const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const { spawn } = require('child_process');
const config = require('../config');

function detectarEmailEmpresaNoServidor() {
  if (config.SMTP_FROM) return config.SMTP_FROM.trim();
  if (config.SMTP_USER && config.SMTP_USER.includes('@')) return config.SMTP_USER.trim();
  return 'thermocontrol@medicalthermo.com';
}

function encodeHeader(str) {
  return `=?UTF-8?B?${Buffer.from(String(str || ''), 'utf8').toString('base64')}?=`;
}

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function montarMimeMessage({ fromName, fromEmail, toList, subject, html }) {
  const base64Html = Buffer.from(html, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');

  return [
    `From: ${encodeHeader(fromName)} <${fromEmail}>`,
    `Reply-To: ${fromEmail}`,
    `To: ${toList.join(', ')}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@medicalthermo.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Html,
    ''
  ].join('\r\n');
}

function enviarViaSendmailLocal({ fromEmail, rawMime }) {
  return new Promise((resolve, reject) => {
    const sendmailPath = '/usr/sbin/sendmail';
    if (!fs.existsSync(sendmailPath)) {
      return reject(new Error('SENDMAIL_INDISPONIVEL'));
    }

    const proc = spawn(sendmailPath, ['-t', '-i', '-f', fromEmail]);
    let stderr = '';

    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, metodo: 'sendmail' });
      } else {
        reject(new Error(`Sendmail retornou código ${code}: ${stderr}`));
      }
    });

    proc.stdin.write(rawMime);
    proc.stdin.end();
  });
}

function enviarViaSmtpSocket({ host, port, user, pass, fromEmail, toList, rawMime }) {
  return new Promise((resolve, reject) => {
    let socket = null;
    let buffer = '';
    let waiter = null;
    let finalizado = false;

    const timeout = setTimeout(() => {
      if (!finalizado) {
        finalizado = true;
        if (socket) socket.destroy();
        reject(new Error('Tempo limite excedido ao conectar ao servidor de e-mail.'));
      }
    }, 15000);

    function concluir(err, res) {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timeout);
      if (socket) {
        try { socket.end(); } catch {}
      }
      if (err) reject(err);
      else resolve(res);
    }

    function processarBuffer() {
      if (!waiter) return;
      const linhas = buffer.split('\r\n');
      for (let i = 0; i < linhas.length - 1; i++) {
        const linha = linhas[i];
        if (/^\d{3} /.test(linha) || /^\d{3}$/.test(linha)) {
          const codigo = Number(linha.slice(0, 3));
          const textoCompleto = linhas.slice(0, i + 1).join('\n');
          buffer = linhas.slice(i + 1).join('\r\n');
          const fn = waiter;
          waiter = null;
          fn({ codigo, texto: textoCompleto });
          return;
        }
      }
    }

    function aguardarResposta() {
      return new Promise((res, rej) => {
        waiter = (resp) => {
          if (resp.codigo >= 400) {
            rej(new Error(`Erro SMTP (${resp.codigo}): ${resp.texto}`));
          } else {
            res(resp);
          }
        };
        processarBuffer();
      });
    }

    async function comando(cmd) {
      socket.write(`${cmd}\r\n`);
      return aguardarResposta();
    }

    function vincularEventos(s) {
      s.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        processarBuffer();
      });
      s.on('error', (err) => concluir(err));
      s.on('close', () => {
        if (!finalizado) concluir(new Error('Conexão SMTP encerrada antes da conclusão.'));
      });
    }

    async function fluxo() {
      try {
        await aguardarResposta();
        await comando('EHLO thermocontrol.medicalthermo.com');

        if (user && pass) {
          await comando('AUTH LOGIN');
          await comando(Buffer.from(user, 'utf8').toString('base64'));
          await comando(Buffer.from(pass, 'utf8').toString('base64'));
        }

        await comando(`MAIL FROM:<${fromEmail}>`);
        for (const dest of toList) {
          await comando(`RCPT TO:<${dest}>`);
        }

        await comando('DATA');
        socket.write(`${rawMime}\r\n.\r\n`);
        await aguardarResposta();
        try { socket.write('QUIT\r\n'); } catch {}
        concluir(null, { ok: true, metodo: 'smtp' });
      } catch (err) {
        concluir(err);
      }
    }

    if (port === 465) {
      socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    } else {
      socket = net.connect({ host, port });
    }
    vincularEventos(socket);
    fluxo();
  });
}

async function enviarEmailServidor({ para, assunto, html }) {
  const toList = String(para || '')
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter((x) => x.includes('@'));

  if (!toList.length) {
    throw new Error('Este cliente/local não possui e-mail cadastrado.');
  }

  const fromEmail = detectarEmailEmpresaNoServidor();
  const fromName = config.SMTP_FROM_NAME || 'MedicalThermo Herzog';
  const user = config.SMTP_USER || 'thermocontrol@medicalthermo.com';
  const pass = config.SMTP_PASS || 'Acesso@thermo26';
  const rawMime = montarMimeMessage({
    fromName,
    fromEmail,
    toList,
    subject: assunto,
    html
  });

  const tentativasSmtp = [
    { host: config.SMTP_HOST || 'mail.medicalthermo.com', port: Number(config.SMTP_PORT || 465) },
    { host: '127.0.0.1', port: 465 },
    { host: '127.0.0.1', port: 587 },
    { host: '127.0.0.1', port: 25 }
  ];

  let ultimoErro = null;

  for (const t of tentativasSmtp) {
    try {
      await enviarViaSmtpSocket({
        host: t.host,
        port: t.port,
        user,
        pass,
        fromEmail,
        toList,
        rawMime
      });
      return { enviados: toList, remetente: fromEmail };
    } catch (err) {
      ultimoErro = err;
    }
  }

  try {
    await enviarViaSendmailLocal({ fromEmail, rawMime });
    return { enviados: toList, remetente: fromEmail };
  } catch (err) {
    ultimoErro = ultimoErro || err;
  }

  throw ultimoErro || new Error('Não foi possível conectar ao servidor de e-mail.');
}

function montarHtmlAvaliacaoGoogle({ os_numero, cliente_nome, responsavel_nome, servico, tecnico_nome, link_google, url_avaliacao }) {
  const e = escapeHtml;
  const link = link_google || config.GOOGLE_REVIEW_URL;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
</head>
<body style="margin:0; padding:24px 12px; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="background-color:#172554; padding:20px 24px; color:#ffffff;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#93c5fd;">MedicalThermo Herzog</div>
        <div style="font-size:18px; font-weight:700; margin-top:4px;">Avalie nosso atendimento — OS ${e(os_numero)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#1e293b;">
          Olá, <strong>${e(responsavel_nome || cliente_nome || 'Cliente')}</strong>! 😊
        </p>
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#334155;">
          Obrigado por confiar em nosso trabalho no atendimento da <strong>OS ${e(os_numero)}</strong>${servico ? ` (${e(servico)})` : ''}.
          Se você ficou satisfeito com o atendimento, gostaríamos muito de contar com sua avaliação no Google. Sua opinião é muito importante para nós!
        </p>

        <div style="text-align:center; margin:28px 0;">
          <a href="${e(link)}" target="_blank" style="display:inline-block; background-color:#1e3a8a; color:#ffffff; text-decoration:none; font-weight:700; font-size:15px; padding:14px 28px; border-radius:8px; margin:4px;">
            ⭐ Avaliar Atendimento no Google
          </a>
          ${url_avaliacao ? `
          <a href="${e(url_avaliacao)}" target="_blank" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:14px 24px; border-radius:8px; margin:4px;">
            Avaliação Interna do Atendimento
          </a>` : ''}
        </div>

        <p style="margin:16px 0 0; font-size:12px; color:#64748b; text-align:center;">
          Ou acesse diretamente pelo link:<br/>
          <a href="${e(link)}" style="color:#1e3a8a; word-break:break-all;">${e(link)}</a>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; text-align:center; font-size:11px; color:#64748b;">
        <strong>MedicalThermo Herzog</strong> — Engenharia Clínica e Refrigeração Técnica${tecnico_nome ? ` • Técnico: ${e(tecnico_nome)}` : ''}
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function montarHtmlRelatorioCliente({ os_numero, cliente_nome, local_nome, responsavel_nome, equipamento_nome, tecnico_nome, data_atendimento, servico, servico_executado, diagnostico, recomendacoes, url_relatorio, url_pdf, url_avaliacao, url_google }) {
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
</head>
<body style="margin:0; padding:24px 12px; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px; margin:0 auto; background-color:#ffffff; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden;">
    <tr>
      <td style="background-color:#172554; padding:20px 24px; color:#ffffff;">
        <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#93c5fd;">MedicalThermo Herzog — Thermo control</div>
        <div style="font-size:18px; font-weight:700; margin-top:4px;">Relatório Técnico de Atendimento — OS ${e(os_numero)}</div>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;">
        <p style="margin:0 0 14px; font-size:14px; line-height:1.5; color:#334155;">
          Olá, <strong>${e(responsavel_nome || cliente_nome || 'Cliente')}</strong>.
        </p>
        <p style="margin:0 0 16px; font-size:14px; line-height:1.5; color:#334155;">
          Encaminhamos o link de acesso ao <strong>Relatório Técnico da Ordem de Serviço Nº ${e(os_numero)}</strong> realizada em sua unidade.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0; border-radius:6px; margin-bottom:18px; font-size:13px;">
          <tr style="background-color:#f8fafc;">
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#64748b; width:36%;">Cliente</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#0f172a;">${e(cliente_nome || '-')}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#64748b;">Unidade / Local</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${e(local_nome || '-')}</td>
          </tr>
          ${equipamento_nome ? `
          <tr style="background-color:#f8fafc;">
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#64748b;">Equipamento</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${e(equipamento_nome)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#64748b;">Serviço</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${e(servico || '-')}</td>
          </tr>
          <tr style="background-color:#f8fafc;">
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#64748b;">Técnico Responsável</td>
            <td style="padding:8px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${e(tecnico_nome || '-')}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; color:#64748b;">Data</td>
            <td style="padding:8px 12px; color:#0f172a;">${e(data_atendimento || '-')}</td>
          </tr>
        </table>

        ${servico_executado ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:4px;">Serviço Executado</div>
          <div style="padding:12px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; line-height:1.5; color:#1e293b; white-space:pre-wrap;">${e(servico_executado)}</div>
        </div>` : ''}

        ${diagnostico || recomendacoes ? `
        <div style="margin-bottom:20px; padding:12px; background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-size:13px; color:#334155;">
          ${diagnostico ? `<div style="margin-bottom:6px;"><strong>Diagnóstico:</strong> ${e(diagnostico)}</div>` : ''}
          ${recomendacoes ? `<div><strong>Recomendações:</strong> ${e(recomendacoes)}</div>` : ''}
        </div>` : ''}

        <div style="text-align:center; margin:24px 0 16px;">
          <a href="${e(url_relatorio)}" target="_blank" style="display:inline-block; background-color:#1e3a8a; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:12px 24px; border-radius:6px; margin:4px;">
            Abrir Relatório Completo e Fotos
          </a>
          ${url_pdf ? `
          <a href="${e(url_pdf)}" target="_blank" style="display:inline-block; background-color:#0f172a; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding:12px 20px; border-radius:6px; margin:4px;">
            Baixar PDF
          </a>` : ''}
          ${url_avaliacao ? `
          <a href="${e(url_avaliacao)}" target="_blank" style="display:inline-block; background-color:#059669; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding:12px 20px; border-radius:6px; margin:4px;">
            Avaliar Atendimento
          </a>` : ''}
          ${url_google ? `
          <a href="${e(url_google)}" target="_blank" style="display:inline-block; background-color:#d97706; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding:12px 20px; border-radius:6px; margin:4px;">
            ⭐ Avaliar no Google
          </a>` : ''}
        </div>
      </td>
    </tr>
    <tr>
      <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; text-align:center; font-size:11px; color:#64748b;">
        <strong>MedicalThermo Herzog</strong> — Engenharia Clínica e Refrigeração Técnica
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  detectarEmailEmpresaNoServidor,
  enviarEmailServidor,
  montarHtmlAvaliacaoGoogle,
  montarHtmlRelatorioCliente
};
