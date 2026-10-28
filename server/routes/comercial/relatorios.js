const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { TIPOS_NECESSIDADE } = require('../../constantes');
const config = require('../../config');
const { registrarHistorico } = require('../../calendario');
const { enviarEmailServidor, montarHtmlRelatorioCliente } = require('../../services/email');

const router = express.Router();

function garantirTokenRelatorio(id, tokenAtual) {
  if (tokenAtual) return tokenAtual;
  const novo = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE relatorios SET token = ? WHERE id = ?').run(novo, id);
  return novo;
}

const RELATORIO_DETALHE = `
  SELECT r.id, r.token, r.status, r.data_validacao, r.recomendacoes, r.criado_em, r.conteudo,
    r.enviado_comercial, r.enviado_comercial_em,
    r.aberto_por, r.aberto_em,
    o.id AS os_id, o.numero AS os_numero, o.servico AS os_servico, o.descricao AS os_descricao,
    o.prioridade AS os_prioridade, o.data_agendada, o.hora_inicio, o.hora_fim, o.responsavel_local,
    o.tipo_atendimento,
    c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone, c.documento AS cliente_documento,
    l.nome AS local_nome, l.endereco AS local_endereco, l.cidade AS local_cidade, l.estado AS local_estado,
    l.responsavel_nome AS local_responsavel, l.responsavel_telefone AS local_responsavel_telefone, l.responsavel_email AS local_responsavel_email,
    e.nome AS equipamento_nome, e.modelo AS equipamento_modelo,
    e.codigo_mt AS equipamento_codigo_mt, e.fabricante AS equipamento_fabricante,
    e.numero_serie AS equipamento_serie, e.capacidade AS equipamento_capacidade,
    e.patrimonio AS equipamento_patrimonio, e.gas_refrigerante AS equipamento_gas,
    e.tensao AS equipamento_tensao, e.local AS equipamento_local, e.ambiente AS equipamento_ambiente,
    eq.nome AS equipe_nome,
    ex.diagnostico, ex.servico_executado, ex.observacoes, ex.fotos, ex.assinatura,
    ex.assinatura_nome, ex.assinatura_cargo, ex.assinaturas,
    ex.condicao_sintomas, ex.condicao_equipamento, ex.condicao_observacoes,
    ex.causa, ex.medicoes, ex.atividades_executadas, ex.resultado,
    ex.pendencias, ex.recomendacoes AS recomendacoes_tecnico,
    ex.necessidade_adicional, ex.necessidade_descricao,
    ex.iniciada_em AS atendimento_iniciado_em, ex.concluida_em AS atendimento_concluido_em,
    t.nome AS tecnico_nome,
    g.nome AS gestor_nome,
    op.id AS oportunidade_id, op.tipo AS oportunidade_tipo,
    op.status AS oportunidade_status, op.descricao AS oportunidade_descricao,
    op.valor_estimado AS oportunidade_valor, op.data_contato AS oportunidade_data_contato,
    op.resultado_contato AS oportunidade_resultado, op.proposta_vinculada AS oportunidade_proposta,
    op.previsao_fechamento AS oportunidade_previsao, op.criado_em AS oportunidade_criado_em,
    oc.nome AS oportunidade_responsavel, op.responsavel_id AS oportunidade_responsavel_id
  FROM relatorios r
  JOIN ordens_servico o ON o.id = r.os_id
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN locais l ON l.id = o.local_id
  LEFT JOIN equipamentos e ON e.id = o.equipamento_id
  LEFT JOIN equipes eq ON eq.id = o.equipe_id
  LEFT JOIN execucoes ex ON ex.os_id = o.id
  LEFT JOIN usuarios t ON t.id = ex.tecnico_id
  LEFT JOIN usuarios g ON g.id = r.validado_por
  LEFT JOIN oportunidades op ON op.relatorio_id = r.id
  LEFT JOIN usuarios oc ON oc.id = op.responsavel_id
`;

router.get('/relatorios/publico/:token', (req, res) => {
  const relatorio = db
    .prepare(`${RELATORIO_DETALHE} WHERE r.token = ?`)
    .get(String(req.params.token || '').trim());
  if (!relatorio) {
    return res.status(404).json({ error: 'Link do relatório não encontrado' });
  }
  try { relatorio.fotos = JSON.parse(relatorio.fotos || '[]'); } catch { relatorio.fotos = []; }
  try { relatorio.medicoes = JSON.parse(relatorio.medicoes || '[]'); } catch { relatorio.medicoes = []; }
  try { relatorio.atividades_executadas = JSON.parse(relatorio.atividades_executadas || '[]'); } catch { relatorio.atividades_executadas = []; }
  try { relatorio.conteudo = JSON.parse(relatorio.conteudo || 'null'); } catch { relatorio.conteudo = null; }
  try {
    const p = JSON.parse(relatorio.assinaturas || '[]');
    relatorio.assinaturas = Array.isArray(p) ? p : [];
  } catch { relatorio.assinaturas = []; }
  if (!relatorio.assinaturas.length && relatorio.assinatura) {
    relatorio.assinaturas = [{
      id: 1,
      nome: relatorio.assinatura_nome || '',
      cargo: relatorio.assinatura_cargo || '',
      arquivo: relatorio.assinatura,
      criado_em: relatorio.atendimento_concluido_em || null
    }];
  }
  relatorio.anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(relatorio.os_id) || [];
  const fotosAnexosPub = relatorio.anexos.filter((a) => a.categoria !== 'documento').map((a) => a.arquivo);
  relatorio.fotos = Array.from(new Set([...(Array.isArray(relatorio.fotos) ? relatorio.fotos : []), ...fotosAnexosPub]));
  const aval = db.prepare('SELECT token, status FROM avaliacoes WHERE os_id = ?').get(relatorio.os_id);
  relatorio.avaliacao_token = aval ? aval.token : null;
  relatorio.avaliacao_status = aval ? aval.status : null;
  res.json({ relatorio });
});

router.get('/relatorios/publico/:token/pdf', (req, res) => {
  const relatorio = db
    .prepare(`${RELATORIO_DETALHE} WHERE r.token = ?`)
    .get(String(req.params.token || '').trim());
  if (!relatorio) {
    return res.status(404).json({ error: 'Link do relatório não encontrado' });
  }
  return enviarPdfHtml(relatorio, req, res);
});

router.use(authenticate, requireRole('comercial', 'gestor', 'admin'));

router.get('/relatorios', (req, res) => {
  const { cliente_id, data_inicio, data_fim, tipo, prioridade, status } = req.query;
  const filtroComercial = req.user.perfil === 'comercial' ? ' AND r.enviado_comercial = 1' : '';
  let sql = `
    SELECT r.id, r.token, r.data_validacao, r.recomendacoes, r.enviado_comercial_em,
      o.id AS os_id, o.numero AS os_numero, o.servico AS os_servico, o.prioridade AS os_prioridade, o.responsavel_local,
      c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
      l.nome AS local_nome, l.responsavel_nome AS local_responsavel, l.responsavel_telefone AS local_responsavel_telefone, l.responsavel_email AS local_responsavel_email,
      ex.necessidade_adicional,
      op.id AS oportunidade_id, op.tipo AS oportunidade_tipo, op.status AS oportunidade_status
    FROM relatorios r
    JOIN ordens_servico o ON o.id = r.os_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN locais l ON l.id = o.local_id
    LEFT JOIN execucoes ex ON ex.os_id = o.id
    LEFT JOIN oportunidades op ON op.relatorio_id = r.id
    WHERE r.status = 'aprovado'${filtroComercial}`;
  const params = [];
  if (cliente_id) {
    sql += ' AND o.cliente_id = ?';
    params.push(cliente_id);
  }
  if (data_inicio) {
    sql += ' AND o.data_agendada >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    sql += ' AND o.data_agendada <= ?';
    params.push(data_fim);
  }
  if (tipo) {
    sql += ' AND op.tipo = ?';
    params.push(tipo);
  }
  if (prioridade) {
    sql += ' AND o.prioridade = ?';
    params.push(prioridade);
  }
  if (status) {
    sql += ' AND op.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY r.data_validacao DESC';
  const relatorios = db.prepare(sql).all(...params);
  for (const r of relatorios) {
    r.token = garantirTokenRelatorio(r.id, r.token);
    r.tipo_necessidade_label = TIPOS_NECESSIDADE[r.necessidade_adicional] || r.necessidade_adicional;
  }
  const clientes = db
    .prepare(
      `SELECT DISTINCT c.id, c.nome FROM relatorios r
       JOIN ordens_servico o ON o.id = r.os_id
       JOIN clientes c ON c.id = o.cliente_id
       WHERE r.status = 'aprovado'${filtroComercial}
       ORDER BY c.nome`
    )
    .all();
  res.json({ relatorios, clientes });
});

router.post('/relatorios/:id/link', (req, res) => {
  const id = Number(req.params.id);
  const relatorio = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(id);
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
  relatorio.token = garantirTokenRelatorio(relatorio.id, relatorio.token);
  const token = (!relatorio.token || req.body?.novo)
    ? garantirTokenRelatorio(id, null)
    : relatorio.token;
  res.json({ relatorio: { id, token, status: relatorio.status, link: `/relatorio/${token}` } });
});

router.post('/relatorios/:id/enviar-email', async (req, res) => {
  const id = Number(req.params.id);
  const relatorio = db.prepare(`${RELATORIO_DETALHE} WHERE r.id = ?`).get(id);
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
  const emailDestino = String(req.body?.email || relatorio.local_responsavel_email || relatorio.cliente_email || '').trim();
  if (!emailDestino || !emailDestino.includes('@')) {
    return res.status(400).json({ error: 'Este cliente/local não possui e-mail válido cadastrado. Informe um e-mail para envio.' });
  }
  relatorio.token = garantirTokenRelatorio(relatorio.id, relatorio.token);
  const baseFront = (req.body?.base_url || 'https://thermocontrol.medicalthermo.com').replace(/\/$/, '');
  const baseApi = `${req.protocol}://${req.get('host')}`;
  const urlRelatorio = `${baseFront}/relatorio/${relatorio.token}`;
  const urlPdf = `${baseApi}/api/comercial/relatorios/publico/${relatorio.token}/pdf`;
  const avaliacao = db.prepare('SELECT token FROM avaliacoes WHERE os_id = ?').get(relatorio.os_id);
  const urlAvaliacao = avaliacao?.token ? `${baseFront}/avaliar/${avaliacao.token}` : '';

  const html = montarHtmlRelatorioCliente({
    os_numero: relatorio.os_numero,
    cliente_nome: relatorio.cliente_nome,
    local_nome: relatorio.local_nome,
    responsavel_nome: relatorio.local_responsavel || relatorio.responsavel_local || relatorio.cliente_nome,
    equipamento_nome: relatorio.equipamento_nome ? `${relatorio.equipamento_codigo_mt ? `${relatorio.equipamento_codigo_mt} - ` : ''}${relatorio.equipamento_nome}` : '',
    tecnico_nome: relatorio.tecnico_nome || '',
    data_atendimento: relatorio.atendimento_concluido_em?.slice(0, 16) || relatorio.data_agendada || '',
    servico: relatorio.os_servico,
    servico_executado: relatorio.servico_executado || '',
    diagnostico: relatorio.diagnostico || '',
    recomendacoes: relatorio.recomendacoes || relatorio.recomendacoes_tecnico || '',
    url_relatorio: urlRelatorio,
    url_pdf: urlPdf,
    url_avaliacao: urlAvaliacao,
    url_google: config.GOOGLE_REVIEW_URL
  });

  try {
    const envio = await enviarEmailServidor({
      para: emailDestino,
      assunto: `Relatório Técnico de Atendimento - OS ${relatorio.os_numero} (MedicalThermo Herzog)`,
      html
    });
    registrarHistorico({
      usuario: req.user,
      tipo: 'relatorio',
      registroId: relatorio.id,
      campo: 'envio_email',
      valorNovo: `Relatório enviado por e-mail (${envio.remetente} -> ${envio.enviados.join(', ')})`
    });
    res.json({ ok: true, destinatarios: envio.enviados, remetente: envio.remetente });
  } catch (err) {
    res.status(500).json({ error: `Falha ao enviar e-mail pelo servidor: ${err.message}` });
  }
});

router.get('/relatorios/:id', (req, res) => {
  const filtroComercial = req.user.perfil === 'comercial' ? ' AND r.enviado_comercial = 1' : '';
  const relatorio = db
    .prepare(`${RELATORIO_DETALHE} WHERE r.id = ? AND r.status = 'aprovado'${filtroComercial}`)
    .get(Number(req.params.id));
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
  relatorio.token = garantirTokenRelatorio(relatorio.id, relatorio.token);
  db.prepare("UPDATE relatorios SET aberto_por = COALESCE(aberto_por, ?), aberto_em = COALESCE(aberto_em, datetime('now')) WHERE id = ?").run(req.user.id, relatorio.id);
  relatorio.aberto_por = relatorio.aberto_por || req.user.id;
  relatorio.aberto_em = relatorio.aberto_em || new Date().toISOString().slice(0, 19).replace('T', ' ');
  try {
    relatorio.fotos = JSON.parse(relatorio.fotos || '[]');
  } catch {
    relatorio.fotos = [];
  }
  try {
    relatorio.medicoes = JSON.parse(relatorio.medicoes || '[]');
  } catch {
    relatorio.medicoes = [];
  }
  try {
    relatorio.atividades_executadas = JSON.parse(relatorio.atividades_executadas || '[]');
  } catch {
    relatorio.atividades_executadas = [];
  }
  try {
    relatorio.conteudo = JSON.parse(relatorio.conteudo || 'null');
  } catch {
    relatorio.conteudo = null;
  }
  try {
    const p = JSON.parse(relatorio.assinaturas || '[]');
    relatorio.assinaturas = Array.isArray(p) ? p : [];
  } catch {
    relatorio.assinaturas = [];
  }
  if (!relatorio.assinaturas.length && relatorio.assinatura) {
    relatorio.assinaturas = [{
      id: 1,
      nome: relatorio.assinatura_nome || '',
      cargo: relatorio.assinatura_cargo || '',
      arquivo: relatorio.assinatura,
      criado_em: relatorio.atendimento_concluido_em || null
    }];
  }
  relatorio.anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(relatorio.os_id) || [];
  const fotosAnexosDet = relatorio.anexos.filter((a) => a.categoria !== 'documento').map((a) => a.arquivo);
  relatorio.fotos = Array.from(new Set([...(Array.isArray(relatorio.fotos) ? relatorio.fotos : []), ...fotosAnexosDet]));
  relatorio.tipo_necessidade_label = TIPOS_NECESSIDADE[relatorio.necessidade_adicional] || relatorio.necessidade_adicional;
  relatorio.oportunidade = relatorio.oportunidade_id
    ? {
        id: relatorio.oportunidade_id,
        status: relatorio.oportunidade_status,
        descricao: relatorio.oportunidade_descricao,
        valor_estimado: relatorio.oportunidade_valor,
        data_contato: relatorio.oportunidade_data_contato,
        resultado_contato: relatorio.oportunidade_resultado,
        proposta_vinculada: relatorio.oportunidade_proposta,
        previsao_fechamento: relatorio.oportunidade_previsao,
        criado_em: relatorio.oportunidade_criado_em,
        responsavel: relatorio.oportunidade_responsavel,
        responsavel_id: relatorio.oportunidade_responsavel_id
      }
    : null;
  const historico = db
    .prepare(
      `SELECT h.*, u.nome AS usuario_nome FROM historico h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE (h.tipo = 'os' AND h.registro_id = ?)
          OR (h.tipo = 'relatorio' AND h.registro_id = ?)
          OR (h.tipo = 'oportunidade' AND h.registro_id = ?)
       ORDER BY h.id DESC LIMIT 200`
    )
    .all(relatorio.os_id, relatorio.id, relatorio.oportunidade_id || 0);
  res.json({ relatorio, historico });
});

function escapeHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatarDataHora(d) {
  if (!d) return '-';
  const str = String(d).slice(0, 19).replace('T', ' ');
  const [dataPart, horaPart] = str.split(' ');
  if (!dataPart) return str;
  const partes = dataPart.split('-');
  if (partes.length !== 3) return str;
  const [ano, mes, dia] = partes;
  const hora = horaPart ? horaPart.slice(0, 5) : '';
  return hora ? `${dia}/${mes}/${ano} às ${hora}` : `${dia}/${mes}/${ano}`;
}

function formatarData(d) {
  if (!d) return '-';
  const [ano, mes, dia] = String(d).slice(0, 10).split('-');
  if (!ano || !mes || !dia) return d;
  return `${dia}/${mes}/${ano}`;
}

let logoBase64 = null;
function getLogo() {
  if (logoBase64 !== null) return logoBase64;
  const caminhos = [
    path.join(__dirname, '../../../app-tmp/public/logo_original.png'),
    path.join(__dirname, '../../../logo_medicalthermo_herzog_transparente_cor.png'),
    path.join(__dirname, '../../../app-tmp/public/logo.png'),
    path.join(__dirname, '../../public/logo_original.png'),
    path.join(__dirname, '../../../public/logo_original.png')
  ];
  for (const caminho of caminhos) {
    try {
      if (fs.existsSync(caminho)) {
        logoBase64 = fs.readFileSync(caminho).toString('base64');
        return logoBase64;
      }
    } catch {
      // tenta o próximo caminho
    }
  }
  logoBase64 = '';
  return logoBase64;
}

function resolverImagem(src, base) {
  if (!src) return '';
  if (src.startsWith('data:')) return src;
  try {
    const limpo = src.replace(/^\/uploads\//, '');
    const localPath = path.join(config.UPLOADS_DIR, limpo);
    if (fs.existsSync(localPath)) {
      const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'jpeg';
      const mime = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg';
      const b64 = fs.readFileSync(localPath).toString('base64');
      return `data:${mime};base64,${b64}`;
    }
  } catch {}
  if (src.startsWith('http://') || src.startsWith('https://')) return src;
  return `${base}${src.startsWith('/') ? '' : '/'}${src}`;
}

const RESULTADO_CONFIG = {
  funcionando: { rotulo: 'Equipamento Funcionando', estilo: 'badge-sucesso' },
  com_restricao: { rotulo: 'Funcionando com Restrição', estilo: 'badge-alerta' },
  indisponivel: { rotulo: 'Equipamento Indisponível', estilo: 'badge-perigo' },
  necessita_retorno: { rotulo: 'Necessita Retorno Técnico', estilo: 'badge-info' },
  necessita_orcamento: { rotulo: 'Necessita Orçamento', estilo: 'badge-info' }
};

const PRIORIDADE_LABEL = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente'
};

router.get('/relatorios/:id/pdf', (req, res) => {
  const filtroComercial = req.user.perfil === 'comercial' ? ' AND r.enviado_comercial = 1' : '';
  const relatorio = db
    .prepare(`${RELATORIO_DETALHE} WHERE r.id = ? AND r.status = 'aprovado'${filtroComercial}`)
    .get(Number(req.params.id));
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
  return enviarPdfHtml(relatorio, req, res);
});

function enviarPdfHtml(relatorio, req, res) {
  relatorio.token = garantirTokenRelatorio(relatorio.id, relatorio.token);

  try {
    relatorio.fotos = JSON.parse(relatorio.fotos || '[]');
  } catch {
    relatorio.fotos = [];
  }
  try {
    relatorio.medicoes = JSON.parse(relatorio.medicoes || '[]');
  } catch {
    relatorio.medicoes = [];
  }
  try {
    relatorio.atividades_executadas = JSON.parse(relatorio.atividades_executadas || '[]');
  } catch {
    relatorio.atividades_executadas = [];
  }

  let conteudoIa = null;
  try {
    conteudoIa = relatorio.conteudo ? JSON.parse(relatorio.conteudo) : null;
  } catch {
    conteudoIa = null;
  }

  const anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(relatorio.os_id) || [];
  const fotosAnexos = anexos.filter((a) => a.categoria !== 'documento').map((a) => a.arquivo);
  const docsParaPdf = anexos.filter((a) => a.categoria === 'documento');
  relatorio.fotos = Array.from(new Set([...(Array.isArray(relatorio.fotos) ? relatorio.fotos : []), ...fotosAnexos]));

  const e = escapeHtml;
  const base = `${req.protocol}://${req.get('host')}`;

  const logoData = getLogo();
  const logoHtml = logoData
    ? `<img class="logo-img" src="data:image/png;base64,${logoData}" alt="MedicalThermo Herzog" />`
    : `<div class="logo-fallback"><div class="logo-main">Medical<span>Thermo</span></div><div class="logo-sub">Herzog Engenharia</div></div>`;

  const resultadoInfo = RESULTADO_CONFIG[relatorio.resultado] || {
    rotulo: relatorio.resultado || 'Atendimento Concluído',
    estilo: 'badge-sucesso'
  };

  const prioridadeTexto = PRIORIDADE_LABEL[relatorio.os_prioridade] || relatorio.os_prioridade || 'Média';

  const enderecoCompleto = [
    relatorio.local_endereco,
    relatorio.local_cidade,
    relatorio.local_estado
  ]
    .filter(Boolean)
    .join(' — ') || relatorio.local_endereco || '-';

  // Fotos em grid
  let fotosHtml = '';
  if (relatorio.fotos && relatorio.fotos.length > 0) {
    const itensFotos = relatorio.fotos
      .map((f, idx) => {
        const imgSrc = resolverImagem(f, base);
        return `
          <div class="foto-card" style="cursor: pointer;" onclick="abrirModalFoto(this.querySelector('img').src, 'Registro fotográfico #${idx + 1}')" title="Clique para ampliar a foto">
            <div class="foto-wrap">
              <img src="${e(imgSrc)}" alt="Registro fotográfico #${idx + 1}" />
            </div>
            <div class="foto-legenda">Registro fotográfico #${idx + 1} <span class="no-print" style="color: #1e3a8a; font-weight: 600;">(Clique para abrir)</span></div>
          </div>
        `;
      })
      .join('');

    fotosHtml = `
      <section class="secao page-break-avoid">
        <div class="secao-titulo">
          <h2>Registro Fotográfico (${relatorio.fotos.length})</h2>
        </div>
        <div class="grade-fotos">
          ${itensFotos}
        </div>
      </section>
    `;
  }

  // Tabela de Medições
  let medicoesHtml = '';
  if (Array.isArray(relatorio.medicoes) && relatorio.medicoes.length > 0) {
    const linhasMedicoes = relatorio.medicoes
      .map(
        (m) => `
        <tr>
          <td class="col-destaque">${e(m.tipo || m.nome || '-')}</td>
          <td class="col-valor">${e(m.valor || '-')}</td>
          <td class="col-unidade">${e(m.unidade || '-')}</td>
          <td class="col-obs">${e(m.observacao || m.obs || '-')}</td>
        </tr>
      `
      )
      .join('');

    medicoesHtml = `
      <section class="secao page-break-avoid">
        <div class="secao-titulo">
          <h2>Medições e Parâmetros Técnicos</h2>
        </div>
        <table class="tabela-padrao">
          <thead>
            <tr>
              <th>Parâmetro / Medição</th>
              <th style="width: 130px;">Valor</th>
              <th style="width: 100px;">Unidade</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            ${linhasMedicoes}
          </tbody>
        </table>
      </section>
    `;
  }

  // Tabela de Atividades Executadas
  let atividadesHtml = '';
  if (Array.isArray(relatorio.atividades_executadas) && relatorio.atividades_executadas.length > 0) {
    const linhasAtv = relatorio.atividades_executadas
      .map(
        (a) => `
        <tr>
          <td class="col-destaque">${e(a.titulo || a.atividade || '-')}</td>
          <td class="col-resultado"><span class="badge-mini">${e(a.resultado || 'Realizado')}</span></td>
          <td class="col-obs">${e(a.observacao || '-')}</td>
        </tr>
      `
      )
      .join('');

    atividadesHtml = `
      <section class="secao page-break-avoid">
        <div class="secao-titulo">
          <span class="icone">✓</span>
          <h2>Checklist de Atividades Executadas</h2>
        </div>
        <table class="tabela-padrao">
          <thead>
            <tr>
              <th>Atividade / Item Verificado</th>
              <th style="width: 140px;">Status</th>
              <th>Observações Técnicas</th>
            </tr>
          </thead>
          <tbody>
            ${linhasAtv}
          </tbody>
        </table>
      </section>
    `;
  }

  // Documentos vinculados
  let docsHtml = '';
  if (docsParaPdf.length > 0) {
    docsHtml = `
      <section class="secao page-break-avoid">
        <div class="secao-titulo">
          <h2>Documentos Vinculados (${docsParaPdf.length})</h2>
        </div>
        <ul class="lista-docs">
          ${docsParaPdf
            .map(
              (d) => `
            <li>
              <a href="${e(base + d.arquivo)}" target="_blank">
                ${e(d.nome_original || d.arquivo.split('/').pop())}
              </a>
            </li>
          `
            )
            .join('')}
        </ul>
      </section>
    `;
  }

  // Recomendações e Pendências
  const recomendacoesGerais = [
    relatorio.recomendacoes_tecnico ? `<strong>Recomendações do Técnico:</strong> ${e(relatorio.recomendacoes_tecnico)}` : '',
    relatorio.recomendacoes ? `<strong>Validação da Gestão:</strong> ${e(relatorio.recomendacoes)}` : '',
    relatorio.observacoes ? `<strong>Observações Adicionais:</strong> ${e(relatorio.observacoes)}` : ''
  ]
    .filter(Boolean)
    .join('<br/><br/>');

  let parecerHtml = '';
  if (recomendacoesGerais || relatorio.pendencias || (relatorio.necessidade_adicional && relatorio.necessidade_adicional !== 'nao')) {
    parecerHtml = `
      <section class="secao page-break-avoid">
        <div class="secao-titulo">
          <h2>Parecer Técnico e Recomendações</h2>
        </div>
        <div class="grade-parecer">
          ${
            recomendacoesGerais
              ? `<div class="card-parecer card-recomendacao">
                  <h4>Orientações e Recomendações</h4>
                  <p>${recomendacoesGerais}</p>
                </div>`
              : ''
          }
          ${
            relatorio.pendencias
              ? `<div class="card-parecer card-pendencia">
                  <h4>Pendências Identificadas</h4>
                  <p>${e(relatorio.pendencias)}</p>
                </div>`
              : ''
          }
          ${
            relatorio.necessidade_adicional && relatorio.necessidade_adicional !== 'nao'
              ? `<div class="card-parecer card-necessidade">
                  <h4>Oportunidade de Melhoria / Ação Futura</h4>
                  <p><strong>Tipo:</strong> ${e(TIPOS_NECESSIDADE[relatorio.necessidade_adicional] || relatorio.necessidade_adicional)}</p>
                  ${relatorio.necessidade_descricao ? `<p>${e(relatorio.necessidade_descricao)}</p>` : ''}
                </div>`
              : ''
          }
        </div>
      </section>
    `;
  }

  // Assinaturas do cliente / local (múltiplas)
  let listaAssinaturas = [];
  try {
    const p = JSON.parse(relatorio.assinaturas || '[]');
    if (Array.isArray(p)) listaAssinaturas = p;
  } catch {
    listaAssinaturas = [];
  }
  if (!listaAssinaturas.length && relatorio.assinatura) {
    listaAssinaturas = [{
      id: 1,
      nome: relatorio.assinatura_nome || '',
      cargo: relatorio.assinatura_cargo || '',
      arquivo: relatorio.assinatura,
      criado_em: relatorio.atendimento_concluido_em || null
    }];
  }
  const blocosAssinaturasClientesHtml = (listaAssinaturas.length ? listaAssinaturas : [null])
    .map((ass, idx) => {
      const imgTag = ass && ass.arquivo
        ? `<img class="img-assinatura" src="${e(resolverImagem(ass.arquivo, base))}" alt="Assinatura do responsável" />`
        : '<div class="linha-vazia-ass"></div>';
      const nomeAss = (ass && ass.nome) || (idx === 0 ? (relatorio.assinatura_nome || relatorio.local_responsavel || relatorio.cliente_nome) : '') || 'Responsável pelo Local';
      const cargoAss = (ass && ass.cargo) || (idx === 0 ? relatorio.assinatura_cargo : '') || 'Responsável no local';
      const dataAss = formatarData((ass && ass.criado_em) || relatorio.atendimento_concluido_em || relatorio.data_agendada);
      const tituloBloco = listaAssinaturas.length > 1 ? `Aceite do Cliente / Local (${idx + 1})` : 'Aceite do Cliente / Local';
      return `
      <div class="bloco-assinatura">
        <div>
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">${e(tituloBloco)}</span>
        </div>
        <div class="assinatura-area">
          ${imgTag}
        </div>
        <div>
          <div class="assinatura-nome">${e(nomeAss)}</div>
          <div class="assinatura-cargo">${e(cargoAss)}</div>
          <div class="assinatura-data">Data: ${e(dataAss)}</div>
        </div>
      </div>`;
    })
    .join('\n');

  const modeloHtml = conteudoIa && conteudoIa.modelo
    ? `<section class="secao page-break-avoid">
        <div class="secao-titulo">
          <span class="icone">📑</span>
          <h2>${e(conteudoIa.modelo.tipo || 'Modelo de Atendimento Técnico')}</h2>
        </div>
        <ul class="lista-docs">${conteudoIa.modelo.campos
          .map((c) => `<li>${e(c)}</li>`)
          .join('')}</ul>
      </section>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Relatório de Atendimento ${e(relatorio.os_numero)} - MedicalThermo</title>
<style>
  :root {
    --primary: #047857;
    --primary-dark: #064e3b;
    --primary-light: #ecfdf5;
    --primary-border: #a7f3d0;
    --text-title: #0f172a;
    --text-body: #334155;
    --text-muted: #64748b;
    --border: #e2e8f0;
    --bg-card: #f8fafc;
  }

  * { box-sizing: border-box; }
  
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--text-body);
    background: #ffffff;
    margin: 0;
    padding: 30px 40px;
    font-size: 12.5px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Barra de ações para visualização em tela */
  .no-print {
    margin-bottom: 24px;
    padding: 12px 18px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .btn-print {
    background: #059669;
    color: #ffffff;
    border: none;
    padding: 8px 18px;
    border-radius: 6px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  }
  .btn-print:hover { background: #047857; }
  .btn-fechar {
    background: transparent;
    border: 1px solid #cbd5e1;
    color: #475569;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  }

  /* Cabeçalho */
  .cabecalho {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid var(--primary);
    padding-bottom: 16px;
    margin-bottom: 16px;
  }
  .logo-container {
    max-width: 250px;
  }
  .logo-img {
    max-height: 58px;
    max-width: 240px;
    object-fit: contain;
    display: block;
  }
  .logo-fallback {
    font-family: inherit;
  }
  .logo-main {
    font-size: 24px;
    font-weight: 800;
    color: var(--primary);
    letter-spacing: -0.5px;
  }
  .logo-main span { color: #0f172a; }
  .logo-sub {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-muted);
    font-weight: 600;
  }

  .titulo-documento {
    text-align: right;
  }
  .titulo-documento h1 {
    font-size: 18px;
    font-weight: 800;
    color: var(--primary-dark);
    margin: 0;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .titulo-documento .subtitulo {
    font-size: 12px;
    color: var(--text-muted);
    margin: 3px 0 0;
  }
  .titulo-documento .emissao {
    font-size: 10.5px;
    color: #94a3b8;
    margin-top: 2px;
  }

  /* Faixa de Destaque da OS */
  .faixa-resumo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--primary-light);
    border: 1px solid var(--primary-border);
    border-radius: 8px;
    padding: 12px 18px;
    margin-bottom: 20px;
  }
  .faixa-item {
    display: flex;
    flex-direction: column;
  }
  .faixa-label {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--primary);
    letter-spacing: 0.8px;
  }
  .faixa-os {
    font-size: 18px;
    font-weight: 800;
    color: var(--primary-dark);
    line-height: 1.2;
  }
  .faixa-servico {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-title);
  }

  /* Badges */
  .badge {
    display: inline-block;
    padding: 3px 9px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .badge-sucesso { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .badge-alerta { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .badge-perigo { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .badge-info { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
  .badge-mt {
    background: #047857;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.5px;
  }
  .badge-mini {
    display: inline-block;
    background: #ecfdf5;
    color: #065f46;
    border: 1px solid #a7f3d0;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
  }

  /* Grid Geral */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  /* Seções */
  .secao {
    margin-top: 18px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .secao-titulo {
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1.5px solid var(--border);
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .secao-titulo .icone {
    color: var(--primary);
    font-size: 14px;
    font-weight: bold;
  }
  .secao-titulo h2 {
    font-size: 13px;
    font-weight: 800;
    color: var(--primary-dark);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin: 0;
  }

  /* Cards de Informações */
  .card-bloco {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    height: 100%;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .card-bloco h3 {
    margin: 0 0 10px 0;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--primary-dark);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 5px;
  }
  .linha-campo {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px dotted #e2e8f0;
    font-size: 11.5px;
  }
  .linha-campo:last-child { border-bottom: none; }
  .campo-rotulo {
    color: var(--text-muted);
    font-weight: 600;
    white-space: nowrap;
    padding-right: 10px;
  }
  .campo-valor {
    text-align: right;
    font-weight: 500;
    color: var(--text-title);
  }

  /* Parágrafos e Caixas de Texto */
  .texto-caixa {
    background: #ffffff;
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-title);
    white-space: pre-wrap;
    margin: 0 0 12px;
  }

  /* Tabelas */
  .tabela-padrao {
    width: 100%;
    border-collapse: collapse;
    margin-top: 6px;
    font-size: 11.5px;
  }
  .tabela-padrao th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 700;
    text-align: left;
    padding: 8px 10px;
    border-top: 1px solid var(--border);
    border-bottom: 2px solid var(--primary);
    text-transform: uppercase;
    font-size: 10.5px;
    letter-spacing: 0.4px;
  }
  .tabela-padrao td {
    padding: 7px 10px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  .tabela-padrao tbody tr:nth-child(even) {
    background: #f8fafc;
  }
  .col-destaque { font-weight: 600; color: var(--text-title); }
  .col-valor { font-weight: 700; color: var(--primary-dark); }
  .col-unidade { color: var(--text-muted); font-size: 11px; }
  .col-obs { color: var(--text-muted); font-size: 11px; }

  /* Parecer e Cards Especiais */
  .grade-parecer {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .card-parecer {
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.5;
  }
  .card-parecer h4 {
    margin: 0 0 4px;
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  .card-parecer p { margin: 0; }
  .card-recomendacao {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }
  .card-pendencia {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }
  .card-necessidade {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
  }

  /* Fotos */
  .grade-fotos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-top: 8px;
  }
  .foto-card {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .foto-wrap {
    height: 140px;
    width: 100%;
    background: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .foto-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .foto-legenda {
    padding: 5px 8px;
    font-size: 10px;
    color: var(--text-muted);
    text-align: center;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
  }

  /* Documentos */
  .lista-docs {
    margin: 0;
    padding-left: 18px;
    font-size: 11.5px;
  }
  .lista-docs li { margin-bottom: 4px; }
  .lista-docs a { color: var(--primary); text-decoration: none; font-weight: 500; }

  /* Assinaturas */
  .assinaturas-container {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-top: 26px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .bloco-assinatura {
    background: #f8fafc;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 150px;
  }
  .assinatura-area {
    min-height: 65px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
  }
  .img-assinatura {
    max-height: 60px;
    max-width: 160px;
    object-fit: contain;
  }
  .linha-vazia-ass {
    width: 80%;
    border-bottom: 1px solid #475569;
    margin: 35px auto 5px;
  }
  .assinatura-nome {
    font-weight: 700;
    font-size: 11.5px;
    color: var(--text-title);
  }
  .assinatura-cargo {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .assinatura-data {
    font-size: 10px;
    color: #94a3b8;
    margin-top: 2px;
  }
  .carimbo-gestao {
    border: 2px dashed #059669;
    background: #ecfdf5;
    border-radius: 6px;
    padding: 10px 8px;
    margin-top: 6px;
  }
  .carimbo-selo {
    font-size: 11px;
    font-weight: 800;
    color: #065f46;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .carimbo-info {
    font-size: 10px;
    color: #047857;
    margin-top: 3px;
  }

  /* Rodapé */
  .rodape {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    font-size: 9.5px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  @media print {
    body { padding: 0 !important; background: #fff !important; }
    .no-print { display: none !important; }
    .secao { page-break-inside: avoid; break-inside: avoid; }
    .card-bloco { page-break-inside: avoid; break-inside: avoid; }
    .foto-card { page-break-inside: avoid; break-inside: avoid; }
    .assinaturas-container { page-break-inside: avoid; break-inside: avoid; }
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 12mm 12mm;
    }
  }
</style>
</head>
<body>

  <div class="no-print">
    <div>
      <strong style="color: #047857; font-size: 14px;">Relatório Técnico de Atendimento — MedicalThermo</strong>
      <div style="font-size: 11px; color: #64748b;">Visualize o documento ou salve em PDF pelo botão ao lado.</div>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
      <button class="btn-fechar" onclick="window.close()">Fechar</button>
    </div>
  </div>

  <div class="cabecalho">
    <div class="logo-container">
      ${logoHtml}
    </div>
    <div class="titulo-documento">
      <h1>RELATÓRIO TÉCNICO DE ATENDIMENTO</h1>
      <div class="subtitulo">Gestão Operacional de Serviços Técnicos</div>
      <div class="emissao">Emissão: ${e(formatarDataHora(new Date().toISOString()))}</div>
    </div>
  </div>

  <div class="faixa-resumo">
    <div class="faixa-item">
      <span class="faixa-label">Ordem de Serviço</span>
      <span class="faixa-os">${e(relatorio.os_numero)}</span>
    </div>
    <div class="faixa-item">
      <span class="faixa-label">Serviço Realizado</span>
      <span class="faixa-servico">${e(relatorio.os_servico || '-')}</span>
    </div>
    <div class="faixa-item">
      <span class="faixa-label">Prioridade</span>
      <div><span class="badge badge-info">${e(prioridadeTexto)}</span></div>
    </div>
    <div class="faixa-item" style="text-align: right;">
      <span class="faixa-label">Status Operacional</span>
      <div><span class="badge ${e(resultadoInfo.estilo)}">${e(resultadoInfo.rotulo)}</span></div>
    </div>
  </div>

  <!-- Identificação do Cliente e do Equipamento -->
  <div class="grid-2">
    <div class="card-bloco">
      <h3>Identificação do Cliente e Local</h3>
      <div class="linha-campo">
        <span class="campo-rotulo">Cliente:</span>
        <span class="campo-valor">${e(relatorio.cliente_nome)}</span>
      </div>
      ${
        relatorio.cliente_documento
          ? `<div class="linha-campo">
              <span class="campo-rotulo">Documento / CNPJ:</span>
              <span class="campo-valor">${e(relatorio.cliente_documento)}</span>
            </div>`
          : ''
      }
      <div class="linha-campo">
        <span class="campo-rotulo">Unidade / Local:</span>
        <span class="campo-valor">${e(relatorio.local_nome || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Endereço:</span>
        <span class="campo-valor">${e(enderecoCompleto)}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Responsável no Local:</span>
        <span class="campo-valor">${e(relatorio.local_responsavel || relatorio.responsavel_local || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Contato:</span>
        <span class="campo-valor">${e([relatorio.local_responsavel_telefone, relatorio.cliente_telefone, relatorio.cliente_email].filter(Boolean).join(' | ') || '-')}</span>
      </div>
    </div>

    <div class="card-bloco">
      <h3>Ficha do Equipamento</h3>
      <div class="linha-campo">
        <span class="campo-rotulo">Identificação MT:</span>
        <span class="campo-valor"><span class="badge-mt">${e(relatorio.equipamento_codigo_mt || 'S/N')}</span></span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Equipamento:</span>
        <span class="campo-valor">${e(relatorio.equipamento_nome || relatorio.os_servico || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Fabricante / Modelo:</span>
        <span class="campo-valor">${e([relatorio.equipamento_fabricante, relatorio.equipamento_modelo].filter(Boolean).join(' / ') || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Nº de Série:</span>
        <span class="campo-valor">${e(relatorio.equipamento_serie || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Patrimônio / Cap.:</span>
        <span class="campo-valor">${e([relatorio.equipamento_patrimonio, relatorio.equipamento_capacidade].filter(Boolean).join(' | ') || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Fluido / Tensão:</span>
        <span class="campo-valor">${e([relatorio.equipamento_gas, relatorio.equipamento_tensao].filter(Boolean).join(' | ') || '-')}</span>
      </div>
      <div class="linha-campo">
        <span class="campo-rotulo">Local / Ambiente:</span>
        <span class="campo-valor">${e([relatorio.equipamento_local, relatorio.equipamento_ambiente].filter(Boolean).join(' — ') || '-')}</span>
      </div>
    </div>
  </div>

  <!-- Informações Operacionais da Execução -->
  <div class="card-bloco" style="margin-bottom: 16px;">
    <h3>Dados Operacionais do Atendimento</h3>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
      <div class="linha-campo" style="flex-direction: column; align-items: flex-start;">
        <span class="campo-rotulo">Equipe Responsável</span>
        <span class="campo-valor" style="text-align: left; font-weight: 600;">${e(relatorio.equipe_nome || '-')}</span>
      </div>
      <div class="linha-campo" style="flex-direction: column; align-items: flex-start;">
        <span class="campo-rotulo">Técnico Executor</span>
        <span class="campo-valor" style="text-align: left; font-weight: 600;">${e(relatorio.tecnico_nome || '-')}</span>
      </div>
      <div class="linha-campo" style="flex-direction: column; align-items: flex-start;">
        <span class="campo-rotulo">Data Agendada</span>
        <span class="campo-valor" style="text-align: left;">${e(formatarData(relatorio.data_agendada))} ${relatorio.hora_inicio ? `(${e(relatorio.hora_inicio)})` : ''}</span>
      </div>
      <div class="linha-campo" style="flex-direction: column; align-items: flex-start;">
        <span class="campo-rotulo">Conclusão do Atendimento</span>
        <span class="campo-valor" style="text-align: left; font-weight: 700; color: var(--primary);">${e(formatarDataHora(relatorio.atendimento_concluido_em))}</span>
      </div>
    </div>
  </div>

  <!-- Diagnóstico e Condição Inicial -->
  ${
    relatorio.condicao_sintomas || relatorio.condicao_equipamento || relatorio.causa || relatorio.diagnostico
      ? `<section class="secao">
          <div class="secao-titulo">
            <h2>Condição Inicial e Diagnóstico Técnico</h2>
          </div>
          <div class="grid-2">
            ${
              relatorio.condicao_sintomas || relatorio.condicao_equipamento
                ? `<div class="card-bloco">
                    <h3>Estado Inicial Relatado</h3>
                    ${relatorio.condicao_sintomas ? `<p style="margin: 0 0 6px;"><strong>Sintomas:</strong> ${e(relatorio.condicao_sintomas)}</p>` : ''}
                    ${relatorio.condicao_equipamento ? `<p style="margin: 0 0 6px;"><strong>Condição do equipamento:</strong> ${e(relatorio.condicao_equipamento)}</p>` : ''}
                    ${relatorio.condicao_observacoes ? `<p style="margin: 0; color: #64748b;">${e(relatorio.condicao_observacoes)}</p>` : ''}
                  </div>`
                : ''
            }
            ${
              relatorio.diagnostico || relatorio.causa
                ? `<div class="card-bloco">
                    <h3>Diagnóstico e Causa</h3>
                    ${relatorio.causa ? `<p style="margin: 0 0 6px;"><strong>Causa identificada:</strong> ${e(relatorio.causa)}</p>` : ''}
                    ${relatorio.diagnostico ? `<p style="margin: 0;"><strong>Diagnóstico técnico:</strong> ${e(relatorio.diagnostico)}</p>` : ''}
                  </div>`
                : ''
            }
          </div>
        </section>`
      : ''
  }

  <!-- Descrição do Serviço Realizado -->
  <section class="secao">
    <div class="secao-titulo">
      <h2>Descrição do Serviço Realizado</h2>
    </div>
    <div class="texto-caixa">${e(relatorio.servico_executado || relatorio.os_descricao || 'Atendimento técnico executado conforme especificações.')}</div>
  </section>

  <!-- Modelo Técnico Específico (se houver) -->
  ${modeloHtml}

  <!-- Atividades Executadas (se houver) -->
  ${atividadesHtml}

  <!-- Medições Técnicas (se houver) -->
  ${medicoesHtml}

  <!-- Parecer Técnico e Recomendações -->
  ${parecerHtml}

  <!-- Registro Fotográfico (se houver) -->
  ${fotosHtml}

  <!-- Documentos Vinculados (se houver) -->
  ${docsHtml}

  <!-- Assinaturas e Validação -->
  <section class="secao page-break-avoid">
    <div class="secao-titulo">
      <h2>Termo de Conclusão e Homologação Técnica</h2>
    </div>

    <div class="assinaturas-container">
      <!-- Técnico Executor -->
      <div class="bloco-assinatura">
        <div>
          <span style="font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase;">Execução Técnica</span>
        </div>
        <div class="assinatura-area">
          <div class="linha-vazia-ass"></div>
        </div>
        <div>
          <div class="assinatura-nome">${e(relatorio.tecnico_nome || 'Técnico Responsável')}</div>
          <div class="assinatura-cargo">${e(relatorio.equipe_nome || 'Equipe Técnica de Campo')}</div>
          <div class="assinatura-data">Concluído em: ${e(formatarData(relatorio.atendimento_concluido_em || relatorio.data_agendada))}</div>
        </div>
      </div>

      <!-- Responsável(is) no Local (Cliente) -->
      ${blocosAssinaturasClientesHtml}

      <!-- Validação da Gestão Técnica -->
      <div class="bloco-assinatura">
        <div>
          <span style="font-size: 10px; font-weight: 700; color: #047857; text-transform: uppercase;">Validação Institucional</span>
        </div>
        <div class="assinatura-area">
          <div class="carimbo-gestao">
            <div class="carimbo-selo">✓ HOMOLOGADO</div>
            <div class="carimbo-info">Validação Técnica</div>
          </div>
        </div>
        <div>
          <div class="assinatura-nome">${e(relatorio.gestor_nome || 'Gestão Operacional')}</div>
          <div class="assinatura-cargo">Gestor Técnico Responsável</div>
          <div class="assinatura-data">${relatorio.data_validacao ? `Aprovado em: ${e(formatarDataHora(relatorio.data_validacao))}` : 'Aprovado'}</div>
        </div>
      </div>
    </div>
  </section>

  <!-- Rodapé -->
  <div class="rodape">
    <div><strong>MedicalThermo Herzog</strong> — Engenharia Clínica e Refrigeração Técnica</div>
    <div>Documento gerado pelo sistema FIELD 2.0</div>
    <div>OS ${e(relatorio.os_numero)} • Via Oficial</div>
  </div>

  <!-- Modal de Visualização de Foto (no-print) -->
  <div id="modal-foto" class="no-print" onclick="fecharModalFoto()" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(15,23,42,0.88); align-items:center; justify-content:center; padding:24px; flex-direction:column;">
    <div onclick="event.stopPropagation()" style="max-width:92vw; max-height:88vh; display:flex; flex-direction:column; align-items:center; gap:12px;">
      <div style="display:flex; align-items:center; justify-content:space-between; width:100%; gap:16px; color:#fff;">
        <span id="modal-foto-legenda" style="font-size:14px; font-weight:700;">Visualização da Foto</span>
        <div style="display:flex; gap:8px;">
          <a id="modal-foto-link" href="#" target="_blank" rel="noopener noreferrer" style="background:#1e3a8a; color:#fff; text-decoration:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600;">Abrir em nova guia</a>
          <button type="button" onclick="fecharModalFoto()" style="background:#ef4444; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;">Fechar ✕</button>
        </div>
      </div>
      <img id="modal-foto-img" src="" alt="Foto ampliada" style="max-width:90vw; max-height:78vh; object-fit:contain; border-radius:8px; background:#fff; box-shadow:0 20px 40px rgba(0,0,0,0.5);" />
    </div>
  </div>

  <script>
    function abrirModalFoto(src, legenda) {
      var m = document.getElementById('modal-foto');
      var img = document.getElementById('modal-foto-img');
      var leg = document.getElementById('modal-foto-legenda');
      var lnk = document.getElementById('modal-foto-link');
      if (m && img) {
        img.src = src;
        if (leg) leg.textContent = legenda || 'Registro fotográfico';
        if (lnk) lnk.href = src;
        m.style.display = 'flex';
      }
    }
    function fecharModalFoto() {
      var m = document.getElementById('modal-foto');
      if (m) m.style.display = 'none';
    }
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.focus();
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;

  res.type('html').send(html);
}

module.exports = router;