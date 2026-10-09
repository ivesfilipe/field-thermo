const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { TIPOS_NECESSIDADE } = require('../../constantes');

const router = express.Router();

router.use(authenticate, requireRole('comercial', 'gestor', 'admin'));

const RELATORIO_DETALHE = `
  SELECT r.id, r.status, r.data_validacao, r.recomendacoes, r.criado_em, r.conteudo,
    r.enviado_comercial, r.enviado_comercial_em,
    r.aberto_por, r.aberto_em,
    o.id AS os_id, o.numero AS os_numero, o.servico AS os_servico, o.descricao AS os_descricao,
    o.prioridade AS os_prioridade, o.data_agendada, o.responsavel_local,
    c.nome AS cliente_nome, c.email AS cliente_email, c.telefone AS cliente_telefone,
    l.nome AS local_nome, l.endereco AS local_endereco, l.responsavel_nome AS local_responsavel,
    l.responsavel_telefone AS local_responsavel_telefone,
    e.nome AS equipamento_nome, e.modelo AS equipamento_modelo,
    e.codigo_mt AS equipamento_codigo_mt,
    e.numero_serie AS equipamento_serie, e.capacidade AS equipamento_capacidade,
    e.patrimonio AS equipamento_patrimonio,
    ex.diagnostico, ex.servico_executado, ex.observacoes, ex.fotos, ex.assinatura,
    ex.assinatura_nome, ex.assinatura_cargo,
    ex.condicao_sintomas, ex.condicao_equipamento, ex.condicao_observacoes,
    ex.causa, ex.medicoes, ex.atividades_executadas, ex.resultado,
    ex.pendencias, ex.recomendacoes AS recomendacoes_tecnico,
    ex.necessidade_adicional, ex.necessidade_descricao, ex.concluida_em AS atendimento_concluido_em,
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
  LEFT JOIN execucoes ex ON ex.os_id = o.id
  LEFT JOIN usuarios t ON t.id = ex.tecnico_id
  LEFT JOIN usuarios g ON g.id = r.validado_por
  LEFT JOIN oportunidades op ON op.relatorio_id = r.id
  LEFT JOIN usuarios oc ON oc.id = op.responsavel_id
`;

router.get('/relatorios', (req, res) => {
  const { cliente_id, data_inicio, data_fim, tipo, prioridade, status } = req.query;
  let sql = `
    SELECT r.id, r.data_validacao, r.recomendacoes, r.enviado_comercial_em,
      o.numero AS os_numero, o.servico AS os_servico, o.prioridade AS os_prioridade,
      c.id AS cliente_id, c.nome AS cliente_nome,
      ex.necessidade_adicional,
      op.id AS oportunidade_id, op.tipo AS oportunidade_tipo, op.status AS oportunidade_status
    FROM relatorios r
    JOIN ordens_servico o ON o.id = r.os_id
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN execucoes ex ON ex.os_id = o.id
    LEFT JOIN oportunidades op ON op.relatorio_id = r.id
    WHERE r.status = 'aprovado' AND r.enviado_comercial = 1`;
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
    r.tipo_necessidade_label = TIPOS_NECESSIDADE[r.necessidade_adicional] || r.necessidade_adicional;
  }
  const clientes = db
    .prepare(
      `SELECT DISTINCT c.id, c.nome FROM relatorios r
       JOIN ordens_servico o ON o.id = r.os_id
       JOIN clientes c ON c.id = o.cliente_id
       WHERE r.status = 'aprovado' AND r.enviado_comercial = 1
       ORDER BY c.nome`
    )
    .all();
  res.json({ relatorios, clientes });
});

router.get('/relatorios/:id', (req, res) => {
  const relatorio = db.prepare(`${RELATORIO_DETALHE} WHERE r.id = ? AND r.status = 'aprovado' AND r.enviado_comercial = 1`).get(Number(req.params.id));
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
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
  relatorio.anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(relatorio.os_id) || [];
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
  return d.slice(0, 16).replace('T', ' ');
}

function formatarData(d) {
  if (!d) return '-';
  const [ano, mes, dia] = d.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

let logoBase64 = null;
function getLogo() {
  if (logoBase64 !== null) return logoBase64;
  const caminhos = [
    path.join(__dirname, '../../../app-tmp/public/logo_original.png'),
    path.join(__dirname, '../../../logo_medicalthermo_herzog_transparente_cor.png'),
    path.join(__dirname, '../../../app-tmp/public/logo.png')
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

router.get('/relatorios/:id/pdf', (req, res) => {
  const relatorio = db
    .prepare(`${RELATORIO_DETALHE} WHERE r.id = ? AND r.status = 'aprovado' AND r.enviado_comercial = 1`)
    .get(Number(req.params.id));
  if (!relatorio) {
    return res.status(404).json({ error: 'Relatório não encontrado' });
  }
  try {
    relatorio.fotos = JSON.parse(relatorio.fotos || '[]');
  } catch {
    relatorio.fotos = [];
  }
  let conteudoIa = null;
  try {
    conteudoIa = relatorio.conteudo ? JSON.parse(relatorio.conteudo) : null;
  } catch {
    conteudoIa = null;
  }
  const anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(relatorio.os_id) || [];
  const fotosParaPdf = anexos.filter((a) => a.categoria !== 'documento').map((a) => a.arquivo);
  const docsParaPdf = anexos.filter((a) => a.categoria === 'documento');
  if (fotosParaPdf.length) relatorio.fotos = fotosParaPdf;
  const e = escapeHtml;
  const base = `${req.protocol}://${req.get('host')}`;
  const fotoTags = relatorio.fotos
    .map((f) => `<figure class="foto-item"><img src="${e(base + f)}" alt="Foto do atendimento" /><figcaption>Foto do atendimento</figcaption></figure>`)
    .join('');

  const secao = (titulo, linhas) => {
    const itens = linhas
      .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
      .map(([k, v]) => `<div class="campo"><span class="rotulo">${e(k)}</span><span class="valor">${e(v)}</span></div>`)
      .join('');
    return itens ? `<section class="bloco"><h2>${e(titulo)}</h2><div class="grade">${itens}</div></section>` : '';
  };

  const identificacao = secao('Identificação', [
    ['OS', relatorio.os_numero],
    ['Cliente', relatorio.cliente_nome],
    ['E-mail', relatorio.cliente_email],
    ['Telefone', relatorio.cliente_telefone],
    ['Localização/unidade', relatorio.local_nome],
    ['Endereço', relatorio.local_endereco],
    ['Responsável pelo local', relatorio.local_responsavel || relatorio.responsavel_local],
    ['Contato do responsável', relatorio.local_responsavel_telefone],
    ['Data do atendimento', formatarData(relatorio.data_agendada)],
    ['Equipamento / serviço', relatorio.equipamento_codigo_mt ? `${relatorio.equipamento_codigo_mt} - ${relatorio.equipamento_nome || relatorio.os_servico}` : (relatorio.equipamento_nome || relatorio.os_servico)],
    ['Técnico responsável', relatorio.tecnico_nome],
    ['Atendimento concluído em', formatarDataHora(relatorio.atendimento_concluido_em)]
  ]);

  const descricao = relatorio.servico_executado || relatorio.os_descricao
    ? `<section class="bloco"><h2>Descrição do serviço realizado</h2><p class="paragrafo">${e(relatorio.servico_executado || relatorio.os_descricao)}</p></section>`
    : '';

  const diagnostico = relatorio.diagnostico
    ? `<section class="bloco"><h2>Diagnóstico técnico</h2><p class="paragrafo">${e(relatorio.diagnostico)}</p></section>`
    : '';

  const modelo = conteudoIa && conteudoIa.modelo
    ? `<section class="bloco"><h2>${e(conteudoIa.modelo.tipo || 'Modelo de atendimento')}</h2><ul class="docs">${conteudoIa.modelo.campos
        .map((c) => `<li>${e(c)}</li>`)
        .join('')}</ul></section>`
    : '';

  const observacoes = (relatorio.observacoes || relatorio.pendencias || relatorio.recomendacoes || relatorio.recomendacoes_tecnico)
    ? `<section class="bloco"><h2>Observações</h2><p class="paragrafo">${[relatorio.observacoes, relatorio.pendencias ? `Pendências: ${relatorio.pendencias}` : '', relatorio.recomendacoes || relatorio.recomendacoes_tecnico ? `Recomendações: ${relatorio.recomendacoes || relatorio.recomendacoes_tecnico}` : ''].filter(Boolean).map(escapeHtml).join('\n\n')}</p></section>`
    : '';
  const fotos = relatorio.fotos.length
    ? `<section class="bloco"><h2>Registro fotográfico (${relatorio.fotos.length})</h2><div class="fotos">${fotoTags}</div></section>`
    : '';
  const documentos = docsParaPdf.length
    ? `<section class="bloco"><h2>Documentos vinculados (${docsParaPdf.length})</h2><ul class="docs">${docsParaPdf
        .map((d) => `<li><a href="${e(base + d.arquivo)}" target="_blank">${e(d.nome_original || d.arquivo.split('/').pop())}</a></li>`)
        .join('')}</ul></section>`
    : '';
  const assinaturaTecnico = relatorio.assinatura
    ? `<section class="bloco"><h2>Assinatura do responsável pelo atendimento</h2><img class="assinatura" src="${e(base + relatorio.assinatura)}" alt="Assinatura" />${relatorio.assinatura_nome ? `<p class="paragrafo">${e(relatorio.assinatura_nome)}${relatorio.assinatura_cargo ? ` — ${e(relatorio.assinatura_cargo)}` : ''}</p>` : ''}</section>`
    : '';

  const assinaturas = `
    <section class="bloco assinaturas">
      <div><span class="linha"></span><span>${e(relatorio.tecnico_nome || 'Técnico responsável')}</span><span class="cargo">Técnico responsável</span><span class="data">Data: ${e(formatarData(relatorio.atendimento_concluido_em || new Date().toISOString().slice(0, 10)))}</span></div>
      <div><span class="linha"></span><span>${e(relatorio.cliente_nome || 'Cliente')}</span><span class="cargo">Cliente / responsável pelo local</span><span class="data">Data: ______/______/________</span></div>
    </section>`;

  const logo = getLogo()
    ? `<img class="logo" src="data:image/png;base64,${getLogo()}" alt="Thermo control" />`
    : `<div class="logo-texto">FIELD <span>2.0</span></div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Relatório de Atendimento ${e(relatorio.os_numero)} - Thermo control</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 40px; font-size: 13px; line-height: 1.55; }
  .cabecalho { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 6px; }
  .logo { max-height: 52px; max-width: 220px; object-fit: contain; }
  .logo-texto { font-size: 26px; font-weight: 800; color: #1d4ed8; }
  .logo-texto span { color: #f59e0b; }
  .titulo-doc { text-align: right; }
  .titulo-doc h1 { font-size: 19px; margin: 0; color: #1d4ed8; letter-spacing: 0.5px; }
  .titulo-doc p { margin: 2px 0 0; color: #6b7280; font-size: 12px; }
  .linha-os { display: flex; justify-content: space-between; align-items: center; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 16px; margin: 14px 0 18px; }
  .linha-os .os { font-size: 16px; font-weight: 800; color: #1e40af; }
  .linha-os .os small { display: block; font-size: 10px; font-weight: 600; color: #6b7280; letter-spacing: 0.8px; }
  .linha-os .cliente { font-size: 13px; color: #374151; font-weight: 600; }
  .bloco { margin-top: 16px; page-break-inside: avoid; }
  .bloco h2 { font-size: 13px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 0 0 10px; }
  .grade { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 28px; }
  .campo { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border-bottom: 1px dotted #e5e7eb; }
  .campo .rotulo { color: #6b7280; font-weight: 600; white-space: nowrap; }
  .campo .valor { text-align: right; font-weight: 500; }
  .paragrafo { margin: 0; white-space: pre-wrap; }
  .recomendacao { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; }
  .recomendacao h2 { border-bottom: 1px solid #fde68a; }
  .fotos { display: flex; flex-wrap: wrap; gap: 10px; }
  .foto-item { margin: 0; width: 200px; page-break-inside: avoid; }
  .foto-item img { width: 100%; height: 140px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 6px; }
  .foto-item figcaption { font-size: 10px; color: #9ca3af; text-align: center; margin-top: 3px; }
  .docs { margin: 0; padding-left: 18px; }
  .docs a { color: #1d4ed8; }
  .assinatura { max-height: 100px; border: 1px solid #e5e7eb; border-radius: 6px; }
  .assinaturas { display: flex; justify-content: space-between; gap: 28px; margin-top: 28px; }
  .assinaturas div { flex: 1; text-align: center; font-size: 12px; }
  .assinaturas .linha { display: block; border-top: 1px solid #374151; margin-bottom: 6px; }
  .assinaturas .cargo { display: block; color: #9ca3af; font-size: 10px; }
  .assinaturas .data { display: block; color: #9ca3af; font-size: 10px; margin-top: 2px; }
  .nota { margin-top: 18px; padding: 8px 12px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; font-size: 11px; color: #92400e; }
  .rodape { margin-top: 22px; padding-top: 8px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; gap: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="cabecalho">
    ${logo}
    <div class="titulo-doc">
      <h1>RELATÓRIO DE ATENDIMENTO</h1>
      <p>Documento técnico de serviço</p>
    </div>
  </div>

  <div class="linha-os">
    <div class="os"><small>ORDEM DE SERVIÇO</small>${e(relatorio.os_numero)}</div>
    <div class="cliente">${e(relatorio.cliente_nome)}</div>
  </div>

  ${identificacao}
  ${descricao}
  ${diagnostico}
  ${modelo}
  ${observacoes}
  ${fotos}
  ${documentos}
  ${assinaturaTecnico}
  ${assinaturas}

  <div class="rodape">
    <span>${e(relatorio.cliente_nome || '')}</span>
    <span>Gerado em: ${e(formatarDataHora(new Date().toISOString()))}</span>
    <span>Thermo control</span>
  </div>

  <script>window.addEventListener('load', function () { window.focus(); window.print(); });</script>
</body>
</html>`;
  res.type('html').send(html);
});

module.exports = router;