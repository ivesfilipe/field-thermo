const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const {
  TIPOS_ATIVIDADE,
  STATUS_VISUAL,
  statusOsVisual,
  statusAtividadeVisual,
  detectarConflitos,
  registrarHistorico,
  verificarConflitoEResponder,
  validarTecnicoDeAgenda
} = require('../../calendario');
const { sqlEnderecoCompleto } = require('../../endereco');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const EVENTO_OS = `
  SELECT o.id, o.numero, o.servico, o.descricao, o.prioridade, o.data_agendada,
    o.hora_inicio, o.hora_fim, o.confirmada, o.status, o.cliente_id, o.local_id,
    o.equipe_id, o.tecnico_id,
    c.nome AS cliente_nome,
    l.nome AS local_nome,
    l.endereco AS local_endereco,
    ${sqlEnderecoCompleto('l')},
    eq.nome AS equipe_nome,
    t.nome AS tecnico_nome
  FROM ordens_servico o
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN locais l ON l.id = o.local_id
  LEFT JOIN equipes eq ON eq.id = o.equipe_id
  LEFT JOIN usuarios t ON t.id = o.tecnico_id
`;

const EVENTO_ATIVIDADE = `
  SELECT a.id, a.titulo, a.tipo, a.os_id, a.cliente_id, a.local_id, a.responsavel,
    a.equipe_id, a.tecnico_id, a.data, a.hora_inicio, a.hora_fim, a.observacoes, a.status,
    c.nome AS cliente_nome,
    l.nome AS local_nome,
    l.endereco AS local_endereco,
    ${sqlEnderecoCompleto('l')},
    eq.nome AS equipe_nome,
    t.nome AS tecnico_nome,
    o.numero AS os_numero
  FROM atividades a
  LEFT JOIN clientes c ON c.id = a.cliente_id
  LEFT JOIN locais l ON l.id = a.local_id
  LEFT JOIN equipes eq ON eq.id = a.equipe_id
  LEFT JOIN usuarios t ON t.id = a.tecnico_id
  LEFT JOIN ordens_servico o ON o.id = a.os_id
`;

function eventoOsParaCalendario(os) {
  return {
    kind: 'os',
    id: os.id,
    referencia: os.numero,
    titulo: os.servico,
    descricao: os.descricao,
    prioridade: os.prioridade,
    data: os.data_agendada,
    hora_inicio: os.hora_inicio,
    hora_fim: os.hora_fim,
    confirmada: os.confirmada,
    status: statusOsVisual(os),
    status_base: os.status,
    cliente_id: os.cliente_id,
    local_id: os.local_id,
    cliente_nome: os.cliente_nome,
    local_nome: os.local_nome,
    local_endereco: os.local_endereco,
    local_endereco_completo: os.local_endereco_completo,
    equipe_id: os.equipe_id,
    equipe_nome: os.equipe_nome,
    tecnico_id: os.tecnico_id,
    tecnico_nome: os.tecnico_nome
  };
}

function eventoAtividadeParaCalendario(atv) {
  return {
    kind: 'atividade',
    id: atv.id,
    referencia: atv.os_numero ? `${atv.os_numero} · Atividade #${atv.id}` : `Atividade #${atv.id}`,
    titulo: atv.titulo,
    tipo: atv.tipo,
    tipo_label: TIPOS_ATIVIDADE[atv.tipo] || atv.tipo,
    os_id: atv.os_id,
    os_numero: atv.os_numero,
    prioridade: null,
    data: atv.data,
    hora_inicio: atv.hora_inicio,
    hora_fim: atv.hora_fim,
    status: statusAtividadeVisual(atv),
    status_base: atv.status,
    cliente_id: atv.cliente_id,
    local_id: atv.local_id,
    responsavel: atv.responsavel,
    observacoes: atv.observacoes,
    cliente_nome: atv.cliente_nome,
    local_nome: atv.local_nome,
    local_endereco: atv.local_endereco,
    local_endereco_completo: atv.local_endereco_completo,
    equipe_id: atv.equipe_id,
    equipe_nome: atv.equipe_nome,
    tecnico_id: atv.tecnico_id,
    tecnico_nome: atv.tecnico_nome
  };
}

function getIndicadores() {
  return db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM ordens_servico WHERE data_agendada = date('now') AND status NOT IN ('concluida', 'cancelada', 'excluida')) AS os_hoje,
        (SELECT COUNT(*) FROM ordens_servico WHERE status = 'em_andamento') AS os_em_andamento,
        (SELECT COUNT(*) FROM ordens_servico WHERE status = 'pendente' AND data_agendada IS NOT NULL) AS os_aguardando_atendimento,
        (SELECT COUNT(*) FROM ordens_servico WHERE status = 'pendente' AND data_agendada < date('now')) AS os_atrasadas,
        (SELECT COUNT(*) FROM ordens_servico WHERE status = 'aguardando_validacao') AS os_aguardando_validacao,
        (SELECT COUNT(*) FROM atividades WHERE status NOT IN ('concluida', 'cancelada') AND data >= date('now')) AS atividades_programadas`
    )
    .get();
}

router.get('/calendario', (req, res) => {
  const { data_inicio, data_fim, cliente_id, equipe_id, tecnico_id, status, prioridade, tipo, os_id } = req.query;

  const condOs = ["o.status != 'excluida'"];
  const condAtv = ['1 = 1'];
  const paramsOs = [];
  const paramsAtv = [];

  if (data_inicio) {
    condOs.push('o.data_agendada >= ?');
    condAtv.push('a.data >= ?');
    paramsOs.push(data_inicio);
    paramsAtv.push(data_inicio);
  }
  if (data_fim) {
    condOs.push('o.data_agendada <= ?');
    condAtv.push('a.data <= ?');
    paramsOs.push(data_fim);
    paramsAtv.push(data_fim);
  }
  if (cliente_id) {
    condOs.push('o.cliente_id = ?');
    condAtv.push('a.cliente_id = ?');
    paramsOs.push(cliente_id);
    paramsAtv.push(cliente_id);
  }
  if (equipe_id) {
    condOs.push('o.equipe_id = ?');
    condAtv.push('a.equipe_id = ?');
    paramsOs.push(equipe_id);
    paramsAtv.push(equipe_id);
  }
  if (tecnico_id) {
    condOs.push('o.tecnico_id = ?');
    condAtv.push('a.tecnico_id = ?');
    paramsOs.push(tecnico_id);
    paramsAtv.push(tecnico_id);
  }
  if (prioridade) {
    condOs.push('o.prioridade = ?');
    paramsOs.push(prioridade);
  }
  if (os_id) {
    condAtv.push('a.os_id = ?');
    paramsAtv.push(os_id);
  }

  let ordens = db.prepare(`${EVENTO_OS} WHERE ${condOs.join(' AND ')} ORDER BY o.data_agendada, o.hora_inicio`).all(...paramsOs);
  let atividades = db.prepare(`${EVENTO_ATIVIDADE} WHERE ${condAtv.join(' AND ')} ORDER BY a.data, a.hora_inicio`).all(...paramsAtv);

  if (tipo) {
    const tipos = String(tipo).split(',');
    atividades = atividades.filter((a) => tipos.includes(a.tipo));
  }

  let eventos = [...ordens.map(eventoOsParaCalendario), ...atividades.map(eventoAtividadeParaCalendario)];

  if (status) {
    const statuses = String(status).split(',');
    eventos = eventos.filter((e) => statuses.includes(e.status));
  }

  eventos.sort((a, b) => {
    const da = `${a.data || ''}${a.hora_inicio || ''}`;
    const db_ = `${b.data || ''}${b.hora_inicio || ''}`;
    return da.localeCompare(db_) || (a.kind === 'os' ? -1 : 1);
  });

  res.json({ eventos, indicadores: getIndicadores() });
});

router.get('/atividades', (req, res) => {
  const { os_id, data_inicio, data_fim } = req.query;
  let sql = `${EVENTO_ATIVIDADE} WHERE 1 = 1`;
  const params = [];
  if (os_id) {
    sql += ' AND a.os_id = ?';
    params.push(os_id);
  }
  if (data_inicio) {
    sql += ' AND a.data >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    sql += ' AND a.data <= ?';
    params.push(data_fim);
  }
  sql += ' ORDER BY a.data, a.hora_inicio';
  res.json({ atividades: db.prepare(sql).all(...params) });
});

router.get('/atividades/:id', (req, res) => {
  const atv = db.prepare(`${EVENTO_ATIVIDADE} WHERE a.id = ?`).get(Number(req.params.id));
  if (!atv) {
    return res.status(404).json({ error: 'Atividade não encontrada' });
  }
  res.json({ atividade: atv });
});

router.post('/atividades', (req, res) => {
  const {
    titulo, tipo, os_id, cliente_id, local_id, responsavel, equipe_id, tecnico_id,
    data, hora_inicio, hora_fim, observacoes, status, ignorar_conflitos
  } = req.body || {};
  const tituloFinal = (titulo && String(titulo).trim()) || 'Atividade agendada'; if (false) {
    return res.status(400).json({ error: 'Informe o título da atividade' });
  }
  if (tipo && !TIPOS_ATIVIDADE[tipo]) {
    return res.status(400).json({ error: 'Tipo de atividade inválido' });
  }
  const STATUS_ATIVIDADE_DB = ['agendada', 'confirmada', 'em_andamento', 'aguardando_validacao', 'concluida', 'reaberta', 'cancelada'];
  if (status && !STATUS_ATIVIDADE_DB.includes(status)) {
    return res.status(400).json({ error: 'Status de atividade inválido' });
  }
  if (os_id) {
    const os = db.prepare('SELECT id FROM ordens_servico WHERE id = ?').get(os_id);
    if (!os) {
      return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
    }
  }
  if (cliente_id) {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
  }
  if (equipe_id) {
    const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(equipe_id);
    if (!equipe) {
      return res.status(404).json({ error: 'Equipe não encontrada' });
    }
  }
  const erroTecnico = validarTecnicoDeAgenda(tecnico_id, equipe_id);
  if (erroTecnico) {
    return res.status(400).json({ error: erroTecnico });
  }
  if (data && hora_inicio) {
    const conflitos = detectarConflitos({ data, hora_inicio, hora_fim, tecnico_id, equipe_id, excluir_atividade_id: null });
    if (verificarConflitoEResponder(res, conflitos, ignorar_conflitos)) return;
  }
  const info = db
    .prepare(
      `INSERT INTO atividades
        (titulo, tipo, os_id, cliente_id, local_id, responsavel, equipe_id, tecnico_id,
         data, hora_inicio, hora_fim, observacoes, status, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      tituloFinal, tipo || 'outro', os_id ?? null, cliente_id ?? null, local_id ?? null,
      responsavel ?? null, equipe_id ?? null, tecnico_id ?? null,
      data ?? null, hora_inicio ?? null, hora_fim ?? null, observacoes ?? null,
      status || 'agendada', req.user.id
    );
  registrarHistorico({ usuario: req.user, tipo: 'atividade', registroId: info.lastInsertRowid, campo: 'criacao', valorNovo: tituloFinal });
  if (os_id) {
    registrarHistorico({ usuario: req.user, tipo: 'os', registroId: os_id, campo: 'atividade', valorNovo: `Atividade #${info.lastInsertRowid} vinculada` });
  }
  res.status(201).json({ atividade: db.prepare(`${EVENTO_ATIVIDADE} WHERE a.id = ?`).get(info.lastInsertRowid) });
});

router.put('/atividades/:id', (req, res) => {
  const id = Number(req.params.id);
  const atv = db.prepare('SELECT * FROM atividades WHERE id = ?').get(id);
  if (!atv) {
    return res.status(404).json({ error: 'Atividade não encontrada' });
  }
  const {
    titulo, tipo, os_id, cliente_id, local_id, responsavel, equipe_id, tecnico_id,
    data, hora_inicio, hora_fim, observacoes, status, ignorar_conflitos
  } = req.body || {};
  if (tipo && !TIPOS_ATIVIDADE[tipo]) {
    return res.status(400).json({ error: 'Tipo de atividade inválido' });
  }
  const novos = {
    titulo: titulo !== undefined ? titulo : atv.titulo,
    tipo: tipo !== undefined ? tipo : atv.tipo,
    os_id: os_id !== undefined ? os_id : atv.os_id,
    cliente_id: cliente_id !== undefined ? cliente_id : atv.cliente_id,
    local_id: local_id !== undefined ? local_id : atv.local_id,
    responsavel: responsavel !== undefined ? responsavel : atv.responsavel,
    equipe_id: equipe_id !== undefined ? equipe_id : atv.equipe_id,
    tecnico_id: tecnico_id !== undefined ? tecnico_id : atv.tecnico_id,
    data: data !== undefined ? data : atv.data,
    hora_inicio: hora_inicio !== undefined ? hora_inicio : atv.hora_inicio,
    hora_fim: hora_fim !== undefined ? hora_fim : atv.hora_fim,
    observacoes: observacoes !== undefined ? observacoes : atv.observacoes,
    status: status !== undefined ? status : atv.status
  };
  const erroTecnico = validarTecnicoDeAgenda(novos.tecnico_id, novos.equipe_id);
  if (erroTecnico) {
    return res.status(400).json({ error: erroTecnico });
  }
  if (novos.data && novos.hora_inicio) {
    const conflitos = detectarConflitos({
      data: novos.data, hora_inicio: novos.hora_inicio, hora_fim: novos.hora_fim,
      tecnico_id: novos.tecnico_id, equipe_id: novos.equipe_id, excluir_atividade_id: id
    });
    if (verificarConflitoEResponder(res, conflitos, ignorar_conflitos)) return;
  }
  const campos = ['titulo', 'tipo', 'os_id', 'cliente_id', 'local_id', 'responsavel', 'equipe_id', 'tecnico_id', 'data', 'hora_inicio', 'hora_fim', 'observacoes', 'status'];
  for (const campo of campos) {
    if (String(novos[campo] ?? '') !== String(atv[campo] ?? '')) {
      registrarHistorico({ usuario: req.user, tipo: 'atividade', registroId: id, campo, valorAnterior: atv[campo], valorNovo: novos[campo] });
    }
  }
  db.prepare(
    `UPDATE atividades SET titulo = ?, tipo = ?, os_id = ?, cliente_id = ?, local_id = ?, responsavel = ?,
       equipe_id = ?, tecnico_id = ?, data = ?, hora_inicio = ?, hora_fim = ?, observacoes = ?, status = ?
     WHERE id = ?`
  ).run(novos.titulo, novos.tipo, novos.os_id, novos.cliente_id, novos.local_id, novos.responsavel,
    novos.equipe_id, novos.tecnico_id, novos.data, novos.hora_inicio, novos.hora_fim, novos.observacoes, novos.status, id);
  res.json({ atividade: db.prepare(`${EVENTO_ATIVIDADE} WHERE a.id = ?`).get(id) });
});

router.patch('/atividades/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const atv = db.prepare('SELECT * FROM atividades WHERE id = ?').get(id);
  if (!atv) {
    return res.status(404).json({ error: 'Atividade não encontrada' });
  }
  const { status } = req.body || {};
  const STATUS_ATIVIDADE_DB = ['agendada', 'confirmada', 'em_andamento', 'aguardando_validacao', 'concluida', 'reaberta', 'cancelada'];
  if (!status || !STATUS_ATIVIDADE_DB.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  if (atv.status !== status) {
    registrarHistorico({ usuario: req.user, tipo: 'atividade', registroId: id, campo: 'status', valorAnterior: atv.status, valorNovo: status });
  }
  db.prepare('UPDATE atividades SET status = ? WHERE id = ?').run(status, id);
  res.json({ atividade: db.prepare(`${EVENTO_ATIVIDADE} WHERE a.id = ?`).get(id) });
});

router.delete('/atividades/:id', (req, res) => {
  const id = Number(req.params.id);
  const atv = db.prepare('SELECT * FROM atividades WHERE id = ?').get(id);
  if (!atv) {
    return res.status(404).json({ error: 'Atividade não encontrada' });
  }
  registrarHistorico({ usuario: req.user, tipo: 'atividade', registroId: id, campo: 'exclusao', valorAnterior: atv.titulo });
  db.prepare('DELETE FROM atividades WHERE id = ?').run(id);
  res.status(204).end();
});

router.patch('/os/:id/horario', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'cancelada') {
    return res.status(400).json({ error: 'OS cancelada não pode ser movida' });
  }
  const { data, hora_inicio, hora_fim, ignorar_conflitos } = req.body || {};
  const novaData = data !== undefined ? data : os.data_agendada;
  const novaHoraInicio = hora_inicio !== undefined ? hora_inicio : os.hora_inicio;
  const novaHoraFim = hora_fim !== undefined ? hora_fim : os.hora_fim;
  if (novaData && novaHoraInicio) {
    const conflitos = detectarConflitos({
      data: novaData, hora_inicio: novaHoraInicio, hora_fim: novaHoraFim,
      tecnico_id: os.tecnico_id, equipe_id: os.equipe_id, excluir_os_id: id
    });
    if (verificarConflitoEResponder(res, conflitos, ignorar_conflitos)) return;
  }
  for (const [campo, novo] of [['data', novaData], ['hora_inicio', novaHoraInicio], ['hora_fim', novaHoraFim]]) {
    if (String(novo ?? '') !== String(os[campo === 'data' ? 'data_agendada' : campo] ?? '')) {
      registrarHistorico({
        usuario: req.user, tipo: 'os', registroId: id, campo,
        valorAnterior: campo === 'data' ? os.data_agendada : os[campo],
        valorNovo: novo
      });
    }
  }
  db.prepare('UPDATE ordens_servico SET data_agendada = ?, hora_inicio = ?, hora_fim = ? WHERE id = ?')
    .run(novaData, novaHoraInicio, novaHoraFim, id);
  res.json({ os: db.prepare(`${EVENTO_OS} WHERE o.id = ?`).get(id) });
});

router.patch('/os/:id/confirmar', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status !== 'pendente') {
    return res.status(400).json({ error: 'Somente OS pendente pode ser confirmada' });
  }
  const confirmada = req.body && req.body.confirmada !== undefined ? (req.body.confirmada ? 1 : 0) : 1;
  if (os.confirmada !== confirmada) {
    registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'confirmada', valorAnterior: os.confirmada, valorNovo: confirmada });
  }
  db.prepare('UPDATE ordens_servico SET confirmada = ? WHERE id = ?').run(confirmada, id);
  res.json({ os: db.prepare(`${EVENTO_OS} WHERE o.id = ?`).get(id) });
});

router.post('/calendario/verificar', (req, res) => {
  const { data, hora_inicio, hora_fim, tecnico_id, equipe_id, excluir_os_id, excluir_atividade_id } = req.body || {};
  if (!data || !hora_inicio) {
    return res.status(400).json({ error: 'Informe data e horário inicial' });
  }
  const conflitos = detectarConflitos({ data, hora_inicio, hora_fim, tecnico_id, equipe_id, excluir_os_id, excluir_atividade_id });
  res.json({ conflitos });
});

router.get('/historico', (req, res) => {
  const { tipo, registro_id } = req.query;
  let sql = `SELECT h.*, u.nome AS usuario_nome FROM historico h
    LEFT JOIN usuarios u ON u.id = h.usuario_id
    WHERE 1 = 1`;
  const params = [];
  if (tipo) {
    sql += ' AND h.tipo = ?';
    params.push(tipo);
  }
  if (registro_id) {
    sql += ' AND h.registro_id = ?';
    params.push(registro_id);
  }
  sql += ' ORDER BY h.id DESC LIMIT 200';
  res.json({ historico: db.prepare(sql).all(...params) });
});

module.exports = router;
