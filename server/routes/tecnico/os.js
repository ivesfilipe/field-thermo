const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../../db');
const config = require('../../config');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico, equipesDoUsuario } = require('../../calendario');
const { TIPOS_NECESSIDADE } = require('../../constantes');
const { gerarRelatorioIA } = require('../../ia');
const { sqlEnderecoCompleto, sqlEnderecoLocalOuCliente } = require('../../endereco');

const router = express.Router();

router.use(authenticate, requireRole('tecnico'));

const OS_BASE = `
  SELECT o.id, o.numero, o.servico, o.descricao, o.prioridade, o.data_agendada,
    o.hora_inicio, o.hora_fim, o.status, o.cliente_id, o.local_id, o.equipamento_id,
    o.tipo_atendimento,
    c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.email AS cliente_email,
    l.nome AS local_nome,
    ${sqlEnderecoLocalOuCliente('l', 'c')},
    l.responsavel_nome AS local_responsavel, l.responsavel_telefone AS local_responsavel_telefone, l.responsavel_email AS local_responsavel_email,
    ${sqlEnderecoCompleto('l', 'local_endereco_completo', 'c')},
    o.responsavel_local,
    e.nome AS equipamento_nome, e.modelo AS equipamento_modelo, e.numero_serie AS equipamento_serie,
    e.fabricante AS equipamento_fabricante,
    e.capacidade AS equipamento_capacidade, e.patrimonio AS equipamento_patrimonio,
    e.codigo_mt AS equipamento_codigo_mt, e.tipo AS equipamento_tipo,
    e.gas_refrigerante AS equipamento_gas, e.tensao AS equipamento_tensao,
    e.local AS equipamento_local, e.ambiente AS equipamento_ambiente,
    e.status AS equipamento_status,
    eq.nome AS equipe_nome, o.equipe_id,
    t.nome AS gestor_nome
  FROM ordens_servico o
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN locais l ON l.id = o.local_id
  LEFT JOIN equipamentos e ON e.id = o.equipamento_id
  LEFT JOIN equipes eq ON eq.id = o.equipe_id
  LEFT JOIN usuarios t ON t.id = o.criada_por
`;

const CATEGORIAS_ANEXO = ['antes', 'durante', 'depois', 'defeito', 'equipamento', 'documento', 'outros'];

function filtroAcessoOS(req) {
  const equipeIds = equipesDoUsuario(req.user.id);
  if (equipeIds.length === 0) {
    return { sql: '1 = 0', params: [] };
  }
  const lugar = equipeIds.map(() => '?').join(',');
  return { sql: `o.equipe_id IN (${lugar})`, params: equipeIds };
}

function getMinhaOS(req, id) {
  const filtro = filtroAcessoOS(req);
  return db.prepare(`${OS_BASE} WHERE o.id = ? AND ${filtro.sql} AND o.status != 'excluida'`).get(id, ...filtro.params);
}

function getExecucao(id) {
  return db.prepare(
    `SELECT ex.*, u.nome AS executor_nome, u2.nome AS concluida_por_nome
     FROM execucoes ex
     LEFT JOIN usuarios u ON u.id = ex.tecnico_id
     LEFT JOIN usuarios u2 ON u2.id = ex.concluida_por
     WHERE ex.os_id = ?`
  ).get(id);
}

function getAnexos(osId) {
  return db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(osId);
}

function safeJson(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function safeJsonObj(v) {
  if (!v) return {};
  try {
    const p = JSON.parse(v);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function normalizarAssinaturas(execucao) {
  if (!execucao) return [];
  let lista = [];
  if (typeof execucao.assinaturas === 'string' && execucao.assinaturas) {
    try {
      const p = JSON.parse(execucao.assinaturas);
      if (Array.isArray(p)) lista = p;
    } catch {
      lista = [];
    }
  } else if (Array.isArray(execucao.assinaturas)) {
    lista = execucao.assinaturas;
  }
  if (!lista.length && execucao.assinatura) {
    lista = [{
      id: 1,
      nome: execucao.assinatura_nome || '',
      cargo: execucao.assinatura_cargo || '',
      arquivo: execucao.assinatura,
      criado_em: execucao.concluida_em || null
    }];
  }
  return lista;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(config.UPLOADS_DIR, 'os' + req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || (file.mimetype === 'image/png' ? '.png' : file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (!ok) {
      return cb(new Error('Somente imagens ou PDF são permitidos'));
    }
    cb(null, true);
  }
});

router.get('/os', (req, res) => {
  const { status, data } = req.query;
  const filtro = filtroAcessoOS(req);
  let sql = `${OS_BASE} WHERE ${filtro.sql} AND o.status NOT IN ('cancelada', 'excluida')`;
  const params = [...filtro.params];
  if (status) {
    sql += ' AND o.status = ?';
    params.push(status);
  }
  if (data) {
    sql += ' AND o.data_agendada = ?';
    params.push(data);
  }
  sql += ' ORDER BY CASE o.prioridade WHEN \'urgente\' THEN 1 WHEN \'alta\' THEN 2 WHEN \'media\' THEN 3 ELSE 4 END, o.data_agendada';
  const ordens = db.prepare(sql).all(...params);
  for (const os of ordens) {
    os.execucao = getExecucao(os.id);
  }
  res.json({ ordens });
});

router.get('/os/:id', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  os.execucao = getExecucao(os.id);
  if (os.execucao) {
    os.execucao.medicoes = safeJson(os.execucao.medicoes);
    os.execucao.atividades_executadas = safeJson(os.execucao.atividades_executadas);
    os.execucao.relatorio_ia = safeJson(os.execucao.relatorio_ia);
    os.execucao.dados_modelo = safeJsonObj(os.execucao.dados_modelo);
    os.execucao.assinaturas = normalizarAssinaturas(os.execucao);
  }
  os.anexos = getAnexos(os.id);
  os.google_review_url = config.GOOGLE_REVIEW_URL;
  res.json({ os });
});

function podeEditarExecucao(os) {
  if (!os) {
    return 'Ordem de serviço não encontrada';
  }
  if (os.status === 'concluida') {
    return 'OS já validada pelo gestor';
  }
  if (os.status === 'aguardando_validacao') {
    return 'OS já finalizada pelo técnico e aguardando validação';
  }
  return null;
}

function enriquecerExecutor(os, execucao) {
  if (execucao?.executor_nome) {
    os.tecnico_nome = execucao.executor_nome;
  }
  return os;
}

router.post('/os/:id/iniciar-deslocamento', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'em_deslocamento') {
    return res.json({ os: getMinhaOS(req, os.id) });
  }
  if (os.status !== 'pendente') {
    return res.status(400).json({ error: 'Somente OS agendada pode iniciar deslocamento' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'em_deslocamento' WHERE id = ?").run(os.id);
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os.id, campo: 'status', valorAnterior: os.status, valorNovo: 'em_deslocamento' });
  res.json({ os: getMinhaOS(req, os.id) });
});

router.post('/os/:id/iniciar', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'em_andamento') {
    const execucao = getExecucao(os.id);
    if (execucao && execucao.tecnico_id !== req.user.id) {
      db.prepare('UPDATE execucoes SET tecnico_id = ? WHERE id = ?').run(req.user.id, execucao.id);
      registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os.id, campo: 'assumiu_atendimento', valorNovo: `técnico assumiu o atendimento` });
    }
    return res.json({ os: getMinhaOS(req, os.id), execucao: getExecucao(os.id) });
  }
  if (os.status !== 'pendente' && os.status !== 'em_deslocamento') {
    return res.status(400).json({ error: 'Somente OS pendente pode ser iniciada' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'em_andamento' WHERE id = ?").run(os.id);
  db.prepare(
    "INSERT INTO execucoes (os_id, tecnico_id, iniciada_em) VALUES (?, ?, datetime('now'))"
  ).run(os.id, req.user.id);
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os.id, campo: 'inicio_atendimento', valorNovo: 'atendimento iniciado pelo técnico' });
  const execucao = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(os.id);
  res.json({ os: getMinhaOS(req, os.id), execucao });
});

router.put('/os/:id/execucao', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'pendente') {
    return res.status(400).json({ error: 'Inicie o atendimento antes de registrar dados' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Inicie o atendimento antes de registrar dados' });
  }
  const b = req.body || {};
  const atualizar = {};
  const camposTexto = [
    'condicao_sintomas', 'condicao_equipamento', 'condicao_observacoes',
    'diagnostico', 'causa', 'servico_executado', 'resultado', 'pendencias',
    'recomendacoes', 'assinatura_nome', 'assinatura_cargo',
    'necessidade_descricao'
  ];
  for (const c of camposTexto) {
    if (b[c] !== undefined) atualizar[c] = b[c];
  }
  if (b.medicoes !== undefined) {
    if (!Array.isArray(b.medicoes)) {
      return res.status(400).json({ error: 'Medições inválidas' });
    }
    atualizar.medicoes = JSON.stringify(b.medicoes);
  }
  if (b.atividades_executadas !== undefined) {
    if (!Array.isArray(b.atividades_executadas)) {
      return res.status(400).json({ error: 'Atividades executadas inválidas' });
    }
    atualizar.atividades_executadas = JSON.stringify(b.atividades_executadas);
  }
  if (b.necessidade_adicional !== undefined) {
    if (!TIPOS_NECESSIDADE[b.necessidade_adicional]) {
      return res.status(400).json({ error: 'Necessidade adicional inválida' });
    }
    atualizar.necessidade_adicional = b.necessidade_adicional;
  }
  if (b.dados_modelo !== undefined) {
    if (!b.dados_modelo || typeof b.dados_modelo !== 'object' || Array.isArray(b.dados_modelo)) {
      return res.status(400).json({ error: 'Dados do modelo inválidos' });
    }
    let existente = {};
    try {
      existente = execucao.dados_modelo ? JSON.parse(execucao.dados_modelo) : {};
    } catch {
      existente = {};
    }
    if (!existente || typeof existente !== 'object' || Array.isArray(existente)) existente = {};
    atualizar.dados_modelo = JSON.stringify({ ...existente, ...b.dados_modelo });
  }
  if (b.assinaturas !== undefined) {
    if (!Array.isArray(b.assinaturas)) {
      return res.status(400).json({ error: 'Assinaturas inválidas' });
    }
    const limpas = b.assinaturas
      .filter((a) => a && a.arquivo)
      .map((a, idx) => ({
        id: a.id || idx + 1,
        nome: String(a.nome || '').trim(),
        cargo: String(a.cargo || '').trim(),
        arquivo: String(a.arquivo),
        criado_em: a.criado_em || null
      }));
    atualizar.assinaturas = JSON.stringify(limpas);
    atualizar.assinatura = limpas[0]?.arquivo || null;
    if (limpas[0]?.nome) atualizar.assinatura_nome = limpas[0].nome;
    if (limpas[0]?.cargo !== undefined) atualizar.assinatura_cargo = limpas[0]?.cargo || null;
  } else if (b.assinatura_nome !== undefined || b.assinatura_cargo !== undefined) {
    const listaAtual = normalizarAssinaturas(execucao);
    if (listaAtual.length > 0) {
      if (b.assinatura_nome !== undefined) listaAtual[0].nome = b.assinatura_nome;
      if (b.assinatura_cargo !== undefined) listaAtual[0].cargo = b.assinatura_cargo;
      atualizar.assinaturas = JSON.stringify(listaAtual);
    }
  }
  const colunas = Object.keys(atualizar);
  if (!colunas.length) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar' });
  }
  const sets = colunas.map((c) => `${c} = ?`).join(', ');
  const valores = colunas.map((c) => atualizar[c] !== undefined ? atualizar[c] : execucao[c]);
  db.prepare(`UPDATE execucoes SET ${sets} WHERE id = ?`).run(...valores, execucao.id);
  res.json({ execucao: getExecucao(os.id) });
});

router.post('/os/:id/anexos', upload.array('arquivos', 10), (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Inicie o atendimento antes de enviar anexos' });
  }
  const categoria = req.body.categoria || 'outros';
  if (!CATEGORIAS_ANEXO.includes(categoria)) {
    return res.status(400).json({ error: 'Categoria de anexo inválida' });
  }
  if (categoria === 'documento') {
    const invalido = (req.files || []).some((f) => f.mimetype !== 'application/pdf' && !f.mimetype.startsWith('image/'));
    if (invalido) {
      return res.status(400).json({ error: 'A categoria documento aceita somente PDF ou imagens' });
    }
  }
  const insert = db.prepare('INSERT INTO anexos (os_id, categoria, arquivo, nome_original, usuario_id) VALUES (?, ?, ?, ?, ?)');
  const criados = (req.files || []).map((f) => {
    const info = insert.run(os.id, categoria, `/uploads/os${os.id}/${f.filename}`, f.originalname, req.user.id);
    return { id: info.lastInsertRowid, arquivo: `/uploads/os${os.id}/${f.filename}`, categoria };
  });
  if (criados.length) {
    registrarHistorico({
      usuario: req.user, tipo: 'execucao', registroId: execucao.id, campo: 'anexo',
      valorNovo: `${criados.length} arquivo(s) na categoria ${categoria}`
    });
  }
  res.status(201).json({ anexos: criados });
});

router.delete('/os/:id/anexos/:anexoId', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const anexo = db.prepare('SELECT * FROM anexos WHERE id = ? AND os_id = ?').get(Number(req.params.anexoId), os.id);
  if (!anexo) {
    return res.status(404).json({ error: 'Anexo não encontrado' });
  }
  db.prepare('DELETE FROM anexos WHERE id = ?').run(anexo.id);
  const caminho = path.join(config.UPLOADS_DIR, 'os' + os.id, path.basename(anexo.arquivo));
  try {
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
  } catch {
    // arquivo já removido
  }
  res.status(204).end();
});

router.post('/os/:id/assinatura', upload.single('assinatura'), (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Inicie o atendimento antes de enviar a assinatura' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Envie a imagem da assinatura' });
  }
  const assinatura = `/uploads/os${os.id}/${req.file.filename}`;
  const lista = normalizarAssinaturas(execucao);
  const nome = req.body?.nome !== undefined
    ? String(req.body.nome).trim()
    : (lista.length === 0 ? (execucao.assinatura_nome || '') : '');
  const cargo = req.body?.cargo !== undefined
    ? String(req.body.cargo).trim()
    : (lista.length === 0 ? (execucao.assinatura_cargo || '') : '');
  const item = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    nome,
    cargo,
    arquivo: assinatura,
    criado_em: new Date().toISOString()
  };
  lista.push(item);
  const primeira = lista[0];
  db.prepare(
    'UPDATE execucoes SET assinatura = ?, assinatura_nome = ?, assinatura_cargo = ?, assinaturas = ? WHERE id = ?'
  ).run(
    primeira.arquivo,
    primeira.nome || execucao.assinatura_nome || null,
    primeira.cargo || execucao.assinatura_cargo || null,
    JSON.stringify(lista),
    execucao.id
  );
  registrarHistorico({ usuario: req.user, tipo: 'execucao', registroId: execucao.id, campo: 'assinatura', valorNovo: `assinatura enviada (${nome || 'responsável'})` });
  res.status(201).json({ assinatura, assinaturas: lista, item });
});

router.delete('/os/:id/assinaturas/:assId', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(404).json({ error: 'Execução não encontrada' });
  }
  const assId = String(req.params.assId);
  const lista = normalizarAssinaturas(execucao);
  const alvo = lista.find((a) => String(a.id) === assId);
  const novaLista = lista.filter((a) => String(a.id) !== assId);
  if (alvo && alvo.arquivo) {
    const caminho = path.join(config.UPLOADS_DIR, 'os' + os.id, path.basename(alvo.arquivo));
    try {
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    } catch {
      // arquivo já removido
    }
  }
  const primeira = novaLista[0] || null;
  db.prepare(
    'UPDATE execucoes SET assinatura = ?, assinatura_nome = ?, assinatura_cargo = ?, assinaturas = ? WHERE id = ?'
  ).run(
    primeira ? primeira.arquivo : null,
    primeira ? primeira.nome : null,
    primeira ? primeira.cargo : null,
    JSON.stringify(novaLista),
    execucao.id
  );
  res.json({ assinaturas: novaLista });
});

router.post('/os/:id/relatorio-ia', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Inicie o atendimento antes de gerar o relatório' });
  }
  const anexos = getAnexos(os.id);
  const resultado = gerarRelatorioIA({ os: enriquecerExecutor(os, execucao), execucao, anexos });
  db.prepare('UPDATE execucoes SET relatorio_ia = ? WHERE id = ?').run(JSON.stringify(resultado.conteudo), execucao.id);
  registrarHistorico({ usuario: req.user, tipo: 'execucao', registroId: execucao.id, campo: 'relatorio_ia', valorNovo: 'relatório gerado pela assistente IA' });
  res.json(resultado);
});

const CAMPOS_OBRIGATORIOS = [
  ['servico_executado', 'Descreva o serviço realizado']
];

router.post('/os/:id/concluir', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'pendente') {
    return res.status(400).json({ error: 'Inicie o atendimento antes de concluir' });
  }
  const erro = podeEditarExecucao(os);
  if (erro) {
    return res.status(400).json({ error: erro });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Inicie o atendimento antes de concluir' });
  }
  for (const [campo, msg] of CAMPOS_OBRIGATORIOS) {
    if (!execucao[campo] || !String(execucao[campo]).trim()) {
      return res.status(400).json({ error: msg });
    }
  }
  const listaAssinaturas = normalizarAssinaturas(execucao);
  const temAssinaturaValida = listaAssinaturas.some((a) => !!a.arquivo) || !!execucao.assinatura;
  if (!temAssinaturaValida) {
    return res.status(400).json({ error: 'Registre a assinatura de pelo menos um responsável' });
  }

  const tinhaComplemento = !!execucao.complemento_solicitado;
  let relatorioIa = safeJson(execucao.relatorio_ia);
  if (!relatorioIa) {
    const anexos = getAnexos(os.id);
    relatorioIa = gerarRelatorioIA({ os: enriquecerExecutor(os, execucao), execucao, anexos }).conteudo;
  }

  db.prepare("UPDATE ordens_servico SET status = 'aguardando_validacao' WHERE id = ?").run(os.id);
  db.prepare(
    `UPDATE execucoes SET concluida_em = datetime('now'), concluida_por = ?, complemento_solicitado = NULL, relatorio_ia = ? WHERE id = ?`
  ).run(req.user.id, JSON.stringify(relatorioIa), execucao.id);
  const relatorio = db.prepare('SELECT id FROM relatorios WHERE os_id = ?').get(os.id);
  if (relatorio) {
    db.prepare("UPDATE relatorios SET status = 'pendente', validado_por = NULL, data_validacao = NULL, complemento_motivo = NULL, conteudo = ? WHERE os_id = ?").run(JSON.stringify(relatorioIa), os.id);
  } else {
    db.prepare('INSERT INTO relatorios (os_id, status, conteudo) VALUES (?, ?, ?)').run(os.id, 'pendente', JSON.stringify(relatorioIa));
  }
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os.id, campo: 'finalizacao_tecnico', valorNovo: tinhaComplemento ? 'reenviado após complemento' : 'enviado para validação do gestor' });
  const osAtualizada = getMinhaOS(req, os.id);
  if (osAtualizada) {
    osAtualizada.execucao = getExecucao(os.id);
    osAtualizada.google_review_url = config.GOOGLE_REVIEW_URL;
  }
  res.json({ os: osAtualizada });
});

router.post('/os/:id/avaliacao-google', (req, res) => {
  const os = getMinhaOS(req, Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const execucao = getExecucao(os.id);
  if (!execucao) {
    return res.status(400).json({ error: 'Atendimento ainda não foi iniciado' });
  }
  if (execucao.avaliacao_google_enviada_em && !req.body?.reenviar) {
    return res.status(409).json({
      error: 'O link de avaliação do Google já foi enviado neste atendimento.',
      enviada_em: execucao.avaliacao_google_enviada_em
    });
  }

  const linkGoogle = config.GOOGLE_REVIEW_URL;
  if (!linkGoogle) {
    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: os.id,
      campo: 'avaliacao_google',
      valorNovo: 'Erro no envio: link de avaliação do Google não configurado'
    });
    return res.status(500).json({ error: 'Link oficial de avaliação do Google não configurado no servidor.' });
  }

  const canal = req.body?.canal === 'email' ? 'email' : 'whatsapp';
  const mensagem = [
    'Olá! 😊 Obrigado por confiar em nosso trabalho. Se você ficou satisfeito com o atendimento, gostaríamos muito de contar com sua avaliação no Google. Sua opinião é muito importante para nós!',
    '',
    `⭐ Avalie nosso atendimento aqui: ${linkGoogle}`
  ].join('\n');
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (canal === 'email') {
    const emailDestino = String(req.body?.email || os.local_responsavel_email || os.cliente_email || '').trim();
    if (!emailDestino || !emailDestino.includes('@')) {
      registrarHistorico({
        usuario: req.user,
        tipo: 'os',
        registroId: os.id,
        campo: 'avaliacao_google',
        valorNovo: 'Erro no envio por e-mail: cliente sem e-mail válido cadastrado'
      });
      return res.status(400).json({
        error: 'Este cliente/local não possui e-mail válido cadastrado para envio da avaliação.'
      });
    }

    const assunto = `Avalie nosso atendimento no Google - OS ${os.numero} (MedicalThermo Herzog)`;
    const mailtoUrl = `mailto:${emailDestino}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`;

    db.prepare(
      'UPDATE execucoes SET avaliacao_google_enviada_em = ?, avaliacao_google_enviada_por = ? WHERE id = ?'
    ).run(agora, req.user.id, execucao.id);

    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: os.id,
      campo: 'avaliacao_google',
      valorNovo: `Enviado via E-mail para ${emailDestino} em ${agora}`
    });

    return res.json({
      ok: true,
      canal: 'email',
      enviada_em: agora,
      mailto_url: mailtoUrl,
      link_google: linkGoogle
    });
  }

  const telBruto = String(req.body?.telefone || os.local_responsavel_telefone || os.cliente_telefone || '').replace(/\D/g, '');
  if (!telBruto || telBruto.length < 8) {
    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: os.id,
      campo: 'avaliacao_google',
      valorNovo: 'Erro no envio: cliente sem telefone/WhatsApp válido cadastrado'
    });
    return res.status(400).json({
      error: 'Este cliente/local não possui telefone válido cadastrado para envio via WhatsApp.'
    });
  }

  const telWhatsApp = telBruto.length <= 11 ? `55${telBruto}` : telBruto;
  const whatsappUrl = `https://wa.me/${telWhatsApp}?text=${encodeURIComponent(mensagem)}`;

  db.prepare(
    'UPDATE execucoes SET avaliacao_google_enviada_em = ?, avaliacao_google_enviada_por = ? WHERE id = ?'
  ).run(agora, req.user.id, execucao.id);

  registrarHistorico({
    usuario: req.user,
    tipo: 'os',
    registroId: os.id,
    campo: 'avaliacao_google',
    valorNovo: `Enviado via WhatsApp para ${os.local_responsavel_telefone || os.cliente_telefone} em ${agora}`
  });

  res.json({
    ok: true,
    canal: 'whatsapp',
    enviada_em: agora,
    whatsapp_url: whatsappUrl,
    link_google: linkGoogle
  });
});

module.exports = router;