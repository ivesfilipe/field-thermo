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

let cachedLogoBase64 = null;
function obterLogoBase64() {
  if (cachedLogoBase64 !== null) return cachedLogoBase64;
  const caminhos = [
    path.join(__dirname, '../logo.png'),
    path.join(__dirname, '../../app-tmp/public/logo.png'),
    '/home/medicalthermo/field-thermo-web/public/logo.png'
  ];
  for (const p of caminhos) {
    try {
      if (fs.existsSync(p)) {
        cachedLogoBase64 = fs.readFileSync(p).toString('base64').replace(/(.{76})/g, '$1\r\n');
        return cachedLogoBase64;
      }
    } catch {}
  }
  cachedLogoBase64 = '';
  return cachedLogoBase64;
}

function montarMimeMessage({ fromName, fromEmail, toList, subject, html }) {
  const base64Html = Buffer.from(html, 'utf8')
    .toString('base64')
    .replace(/(.{76})/g, '$1\r\n');

  const logoB64 = obterLogoBase64();
  if (logoB64) {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return [
      `From: ${encodeHeader(fromName)} <${fromEmail}>`,
      `Reply-To: ${fromEmail}`,
      `To: ${toList.join(', ')}`,
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@medicalthermo.com>`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Html,
      '',
      `--${boundary}`,
      'Content-Type: image/png; name="logo.png"',
      'Content-Transfer-Encoding: base64',
      'Content-ID: <logo@medicalthermo.com>',
      'Content-Disposition: inline; filename="logo.png"',
      '',
      logoB64,
      '',
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

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
        try { socket.end(); } catch { }
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
        try { socket.write('QUIT\r\n'); } catch { }
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

function montarHtmlAvaliacaoGoogle({ os_numero, cliente_nome, responsavel_nome, servico, tecnico_nome, link_google }) {
  const e = escapeHtml;
  const link = link_google || config.GOOGLE_REVIEW_URL;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:32px 16px; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; margin:0 auto; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(15,23,42,0.05);">
    <!-- Cabeçalho Corporativo Centralizado -->
    <tr>
      <td align="center" style="background-color:#0f172a; padding:28px 24px 22px; border-bottom:3px solid #1d4ed8;">
        <img src="cid:logo@medicalthermo.com" alt="MedicalThermo Engenharia Herzog" width="190" style="display:block; margin:0 auto 14px; max-width:190px; height:auto; border:0;" />
        <span style="display:inline-block; background-color:#1e293b; border:1px solid #334155; color:#93c5fd; font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; padding:4px 12px; border-radius:999px;">
          Atendimento Concluído • OS ${e(os_numero)}
        </span>
      </td>
    </tr>

    <!-- Corpo da Mensagem -->
    <tr>
      <td style="padding:28px 28px 24px;">
        <h2 style="margin:0 0 12px; font-size:18px; font-weight:700; color:#0f172a; text-align:center;">
          Como foi o nosso atendimento?
        </h2>
        <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#334155; text-align:center;">
          Olá, <strong>${e(responsavel_nome || cliente_nome || 'Cliente')}</strong>!<br/>
          Agradecemos pela confiança em nosso trabalho. Sua opinião no Google é fundamental para continuarmos entregando excelência técnica.
        </p>

        <!-- Resumo Compacto do Atendimento -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin:20px 0; font-size:13px;">
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b; width:38%;">Ordem de Serviço</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:700; color:#0f172a; text-align:right;">${e(os_numero)}</td>
          </tr>
          ${cliente_nome ? `
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b;">Cliente</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#1e293b; text-align:right;">${e(cliente_nome)}</td>
          </tr>` : ''}
          ${servico ? `
          <tr>
            <td style="padding:10px 14px;${tecnico_nome ? ' border-bottom:1px solid #e2e8f0;' : ''} color:#64748b;">Serviço Realizado</td>
            <td style="padding:10px 14px;${tecnico_nome ? ' border-bottom:1px solid #e2e8f0;' : ''} color:#1e293b; text-align:right;">${e(servico)}</td>
          </tr>` : ''}
          ${tecnico_nome ? `
          <tr>
            <td style="padding:10px 14px; color:#64748b;">Técnico Responsável</td>
            <td style="padding:10px 14px; color:#1e293b; text-align:right;">${e(tecnico_nome)}</td>
          </tr>` : ''}
        </table>

        <!-- Botão Principal -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
          <tr>
            <td align="center">
              <a href="${e(link)}" target="_blank" style="display:inline-block; background-color:#1d4ed8; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:14px 32px; border-radius:8px;">
                ⭐ Avaliar Atendimento no Google
              </a>
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0; font-size:11px; color:#94a3b8; text-align:center;">
          Leva menos de 1 minuto • Avaliação oficial no Google
        </p>
      </td>
    </tr>

    <!-- Rodapé -->
    <tr>
      <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; text-align:center; font-size:11px; color:#64748b;">
        <strong>MedicalThermo Engenharia Herzog</strong> • Sistema Thermo Control
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function montarHtmlRelatorioCliente({ os_numero, cliente_nome, local_nome, responsavel_nome, equipamento_nome, tecnico_nome, data_atendimento, servico, servico_executado, diagnostico, recomendacoes, url_relatorio, url_pdf, url_google }) {
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:32px 16px; background-color:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#0f172a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(15,23,42,0.05);">
    <!-- Cabeçalho Corporativo Centralizado -->
    <tr>
      <td align="center" style="background-color:#0f172a; padding:28px 24px 22px; border-bottom:3px solid #1d4ed8;">
        <img src="cid:logo@medicalthermo.com" alt="MedicalThermo Engenharia Herzog" width="190" style="display:block; margin:0 auto 14px; max-width:190px; height:auto; border:0;" />
        <span style="display:inline-block; background-color:#1e293b; border:1px solid #334155; color:#93c5fd; font-size:11px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; padding:4px 12px; border-radius:999px;">
          Relatório Técnico • OS ${e(os_numero)}
        </span>
      </td>
    </tr>

    <!-- Corpo -->
    <tr>
      <td style="padding:28px 28px 24px;">
        <p style="margin:0 0 12px; font-size:15px; line-height:1.5; color:#0f172a;">
          Olá, <strong>${e(responsavel_nome || cliente_nome || 'Cliente')}</strong>.
        </p>
        <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#475569;">
          O relatório técnico referente à Ordem de Serviço <strong>${e(os_numero)}</strong> foi concluído e validado. Confira abaixo o resumo do atendimento:
        </p>

        <!-- Tabela de Identificação Limpa -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:20px; font-size:13px;">
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b; width:38%;">Cliente</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; font-weight:600; color:#0f172a; text-align:right;">${e(cliente_nome || '-')}</td>
          </tr>
          ${local_nome ? `
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b;">Unidade / Local</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#1e293b; text-align:right;">${e(local_nome)}</td>
          </tr>` : ''}
          ${equipamento_nome ? `
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b;">Equipamento</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#1e293b; text-align:right;">${e(equipamento_nome)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b;">Serviço</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#1e293b; text-align:right;">${e(servico || '-')}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#64748b;">Técnico Responsável</td>
            <td style="padding:10px 14px; border-bottom:1px solid #e2e8f0; color:#1e293b; text-align:right;">${e(tecnico_nome || '-')}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; color:#64748b;">Data de Conclusão</td>
            <td style="padding:10px 14px; color:#1e293b; text-align:right;">${e(data_atendimento || '-')}</td>
          </tr>
        </table>

        ${servico_executado || diagnostico || recomendacoes ? `
        <div style="background-color:#f8fafc; border-left:3px solid #1d4ed8; border-top:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; border-radius:6px; padding:14px 16px; margin-bottom:24px; font-size:13px; line-height:1.6; color:#334155;">
          ${servico_executado ? `<div style="margin-bottom:${diagnostico || recomendacoes ? '10px' : '0'};"><strong style="color:#0f172a; display:block; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:2px;">Resumo do Serviço Executado</strong><span style="white-space:pre-wrap;">${e(servico_executado)}</span></div>` : ''}
          ${diagnostico ? `<div style="margin-bottom:${recomendacoes ? '8px' : '0'};"><strong style="color:#0f172a;">Diagnóstico:</strong> ${e(diagnostico)}</div>` : ''}
          ${recomendacoes ? `<div><strong style="color:#0f172a;">Recomendações:</strong> ${e(recomendacoes)}</div>` : ''}
        </div>` : ''}

        <!-- Ações do Relatório -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;">
          <tr>
            <td align="center">
              <a href="${e(url_relatorio)}" target="_blank" style="display:inline-block; background-color:#1d4ed8; color:#ffffff; text-decoration:none; font-weight:700; font-size:14px; padding:13px 28px; border-radius:8px; margin:4px;">
                Visualizar Relatório Online e Fotos
              </a>
              ${url_pdf ? `
              <a href="${e(url_pdf)}" target="_blank" style="display:inline-block; background-color:#0f172a; color:#ffffff; text-decoration:none; font-weight:600; font-size:13px; padding:13px 22px; border-radius:8px; margin:4px;">
                Baixar PDF
              </a>` : ''}
            </td>
          </tr>
        </table>

        ${url_google ? `
        <div style="border-top:1px solid #e2e8f0; margin-top:20px; padding-top:18px; text-align:center;">
          <p style="margin:0 0 10px; font-size:12px; color:#64748b;">
            Ficou satisfeito com o nosso atendimento? Avalie nossa equipe no Google:
          </p>
          <a href="${e(url_google)}" target="_blank" style="display:inline-block; background-color:#f8fafc; border:1px solid #cbd5e1; color:#0f172a; text-decoration:none; font-weight:700; font-size:12px; padding:8px 18px; border-radius:6px;">
            ⭐ Avaliar no Google
          </a>
        </div>` : ''}
      </td>
    </tr>

    <!-- Rodapé -->
    <tr>
      <td style="background-color:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 24px; text-align:center; font-size:11px; color:#64748b;">
        <strong>MedicalThermo Engenharia Herzog</strong> • Sistema Thermo Control
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
