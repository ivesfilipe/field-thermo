const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const {
  detectarConflitos,
  registrarHistorico,
  verificarConflitoEResponder
} = require('../../calendario');
const { TIPOS_NECESSIDADE } = require('../../constantes');
const { MODELOS } = require('../../modelos');
const { sqlEnderecoCompleto } = require('../../endereco');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const OS_BASE = `
  SELECT o.id, o.numero, o.cliente_id, o.local_id, o.responsavel_local,
    o.equipamento_id, o.servico, o.descricao, o.prioridade, o.data_agendada,
    o.hora_inicio, o.hora_fim, o.confirmada, o.tipo_atendimento,
    o.equipe_id, o.status, o.criada_por, o.criado_em,
    c.nome AS cliente_nome,
    c.email AS cliente_email, c.telefone AS cliente_telefone,
    l.nome AS local_nome, l.endereco AS local_endereco, l.responsavel_nome AS local_responsavel,
    l.responsavel_telefone AS local_responsavel_telefone, l.responsavel_email AS local_responsavel_email,
    ${sqlEnderecoCompleto('l')},
    e.nome AS equipamento_nome, e.modelo AS equipamento_modelo,
    e.capacidade AS equipamento_capacidade, e.patrimonio AS equipamento_patrimonio,
    e.codigo_mt AS equipamento_codigo_mt, e.tipo AS equipamento_tipo,
    e.gas_refrigerante AS equipamento_gas, e.tensao AS equipamento_tensao,
    e.local AS equipamento_local, e.ambiente AS equipamento_ambiente,
    e.numero_serie AS equipamento_serie, e.status AS equipamento_status,
    eq.nome AS equipe_nome,
    (SELECT id FROM relatorios r WHERE r.os_id = o.id) AS relatorio_id
  FROM ordens_servico o
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN locais l ON l.id = o.local_id
  LEFT JOIN equipamentos e ON e.id = o.equipamento_id
  LEFT JOIN equipes eq ON eq.id = o.equipe_id
`;

function getOS(id) {
  const os = db.prepare(`${OS_BASE} WHERE o.id = ?`).get(id);
  if (!os) return null;
  os.execucao = db.prepare(
    `SELECT ex.*, u.nome AS executor_nome, u2.nome AS concluida_por_nome
     FROM execucoes ex
     LEFT JOIN usuarios u ON u.id = ex.tecnico_id
     LEFT JOIN usuarios u2 ON u2.id = ex.concluida_por
     WHERE ex.os_id = ?`
  ).get(id) || null;
  os.relatorio = db.prepare('SELECT * FROM relatorios WHERE os_id = ?').get(id) || null;
  if (os.relatorio && !os.relatorio.token) {
    const tk = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE relatorios SET token = ? WHERE id = ?').run(tk, os.relatorio.id);
    os.relatorio.token = tk;
  }
  os.avaliacao = db.prepare('SELECT id, os_id, token, status, nota, resolveu_necessidade, comentario, respondida_em, criado_em FROM avaliacoes WHERE os_id = ?').get(id) || null;
  os.anexos = db.prepare('SELECT * FROM anexos WHERE os_id = ? ORDER BY id').all(id) || [];
  if (os.execucao) {
    for (const campo of ['medicoes', 'atividades_executadas', 'relatorio_ia']) {
      if (os.execucao[campo]) {
        try { os.execucao[campo] = JSON.parse(os.execucao[campo]); } catch { os.execucao[campo] = null; }
      }
    }
    let listaAss = [];
    if (typeof os.execucao.assinaturas === 'string' && os.execucao.assinaturas) {
      try {
        const p = JSON.parse(os.execucao.assinaturas);
        if (Array.isArray(p)) listaAss = p;
      } catch { listaAss = []; }
    } else if (Array.isArray(os.execucao.assinaturas)) {
      listaAss = os.execucao.assinaturas;
    }
    if (!listaAss.length && os.execucao.assinatura) {
      listaAss = [{
        id: 1,
        nome: os.execucao.assinatura_nome || '',
        cargo: os.execucao.assinatura_cargo || '',
        arquivo: os.execucao.assinatura,
        criado_em: os.execucao.concluida_em || null
      }];
    }
    os.execucao.assinaturas = listaAss;
  }
  if (os.relatorio && os.relatorio.conteudo) {
    try { os.relatorio.conteudo = JSON.parse(os.relatorio.conteudo); } catch { os.relatorio.conteudo = null; }
  }
  return os;
}

function proximoNumero() {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(numero, 4) AS INTEGER)) AS max_num FROM ordens_servico").get();
  return `OS-${String((row.max_num || 0) + 1).padStart(4, '0')}`;
}

router.get('/os', (req, res) => {
  const { status, cliente_id, equipe_id, tecnico_id, prioridade, data_inicio, data_fim, busca } = req.query;
  let sql = OS_BASE + ' WHERE 1 = 1';
  const params = [];
  if (status) {
    sql += ' AND o.status = ?';
    params.push(status);
  } else {
    sql += " AND o.status != 'excluida'";
  }
  if (cliente_id) {
    sql += ' AND o.cliente_id = ?';
    params.push(cliente_id);
  }
  if (equipe_id) {
    sql += ' AND o.equipe_id = ?';
    params.push(equipe_id);
  }
  if (tecnico_id) {
    sql += ' AND o.tecnico_id = ?';
    params.push(tecnico_id);
  }
  if (prioridade) {
    sql += ' AND o.prioridade = ?';
    params.push(prioridade);
  }
  if (data_inicio) {
    sql += ' AND o.data_agendada >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    sql += ' AND o.data_agendada <= ?';
    params.push(data_fim);
  }
  if (busca) {
    sql += ' AND (o.numero LIKE ? OR o.servico LIKE ? OR c.nome LIKE ?)';
    const like = `%${busca}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY CASE o.prioridade WHEN \'urgente\' THEN 1 WHEN \'alta\' THEN 2 WHEN \'media\' THEN 3 ELSE 4 END, o.data_agendada';
  res.json({ ordens: db.prepare(sql).all(...params) });
});

router.get('/os/:id', (req, res) => {
  const os = getOS(Number(req.params.id));
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  res.json({ os });
});

router.post('/os', (req, res) => {
  const {
    cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
    prioridade, data_agendada, hora_inicio, hora_fim, equipe_id, tipo_atendimento
  } = req.body || {};
  let clienteIdFinal = cliente_id ? Number(cliente_id) : null;
  if (!clienteIdFinal) {
    const primeiroCliente = db.prepare('SELECT id FROM clientes ORDER BY id LIMIT 1').get();
    if (primeiroCliente) {
      clienteIdFinal = primeiroCliente.id;
    } else {
      const infoCli = db.prepare("INSERT INTO clientes (nome) VALUES ('Cliente Geral')").run();
      clienteIdFinal = Number(infoCli.lastInsertRowid);
    }
  }
  const servicoFinal = (servico && String(servico).trim()) || 'Atendimento técnico';
  if (!equipe_id) {
    return res.status(400).json({ error: 'Informe a equipe / técnico responsável' });
  }
  if (tipo_atendimento && !MODELOS[tipo_atendimento]) {
    return res.status(400).json({ error: 'Tipo de atendimento inválido' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteIdFinal);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (local_id) {
    const local = db.prepare('SELECT id FROM locais WHERE id = ? AND cliente_id = ?').get(local_id, clienteIdFinal);
    if (!local) {
      return res.status(400).json({ error: 'Local não pertence ao cliente informado' });
    }
  }
  if (equipamento_id) {
    const equip = db.prepare('SELECT id FROM equipamentos WHERE id = ? AND cliente_id = ?').get(equipamento_id, clienteIdFinal);
    if (!equip) {
      return res.status(400).json({ error: 'Equipamento não pertence ao cliente informado' });
    }
  }
  const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(equipe_id);
  if (!equipe) {
    return res.status(404).json({ error: 'Equipe não encontrada' });
  }
  const prioridades = ['baixa', 'media', 'alta', 'urgente'];
  if (prioridade && !prioridades.includes(prioridade)) {
    return res.status(400).json({ error: 'Prioridade inválida' });
  }
  if (data_agendada && hora_inicio) {
    const conflitos = detectarConflitos({ data: data_agendada, hora_inicio, hora_fim, equipe_id });
    if (verificarConflitoEResponder(res, conflitos, req.body?.ignorar_conflitos)) return;
  }
  const numero = proximoNumero();
  const info = db
    .prepare(
      `INSERT INTO ordens_servico
        (numero, cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
         prioridade, data_agendada, hora_inicio, hora_fim, equipe_id, criada_por, tipo_atendimento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      numero, clienteIdFinal, local_id ?? null, responsavel_local ?? null, equipamento_id ?? null,
      servicoFinal, descricao ?? null, prioridade || 'media', data_agendada ?? null,
      hora_inicio ?? null, hora_fim ?? null,
      equipe_id, req.user.id,
      tipo_atendimento || null
    );
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: info.lastInsertRowid, campo: 'criacao', valorNovo: numero });
  res.status(201).json({ os: getOS(info.lastInsertRowid) });
});

router.put('/os/:id', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status !== 'pendente') {
    return res.status(400).json({ error: 'Somente OS pendente pode ser editada' });
  }
  const {
    cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
    prioridade, data_agendada, hora_inicio, hora_fim, equipe_id, confirmada, tipo_atendimento
  } = req.body || {};
  if (tipo_atendimento !== undefined && tipo_atendimento !== null && !MODELOS[tipo_atendimento]) {
    return res.status(400).json({ error: 'Tipo de atendimento inválido' });
  }
  const novoClienteId = cliente_id ?? os.cliente_id;
  const novoLocalId = local_id !== undefined ? local_id : os.local_id;
  const novoEquipamentoId = equipamento_id !== undefined ? equipamento_id : os.equipamento_id;
  if (novoLocalId) {
    const local = db.prepare('SELECT id FROM locais WHERE id = ? AND cliente_id = ?').get(novoLocalId, novoClienteId);
    if (!local) {
      return res.status(400).json({ error: 'Local não pertence ao cliente informado' });
    }
  }
  if (novoEquipamentoId) {
    const equip = db.prepare('SELECT id FROM equipamentos WHERE id = ? AND cliente_id = ?').get(novoEquipamentoId, novoClienteId);
    if (!equip) {
      return res.status(400).json({ error: 'Equipamento não pertence ao cliente informado' });
    }
  }
  const novoEquipeId = equipe_id !== undefined ? equipe_id : os.equipe_id;
  if (novoEquipeId != null) {
    const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(novoEquipeId);
    if (!equipe) {
      return res.status(404).json({ error: 'Equipe não encontrada' });
    }
  }
  const prioridades = ['baixa', 'media', 'alta', 'urgente'];
  if (prioridade && !prioridades.includes(prioridade)) {
    return res.status(400).json({ error: 'Prioridade inválida' });
  }
  const novaDataAgendada = data_agendada !== undefined ? data_agendada : os.data_agendada;
  const novaHoraInicio = hora_inicio !== undefined ? hora_inicio : os.hora_inicio;
  const novaHoraFim = hora_fim !== undefined ? hora_fim : os.hora_fim;
  if (novaDataAgendada && novaHoraInicio) {
    const conflitos = detectarConflitos({
      data: novaDataAgendada, hora_inicio: novaHoraInicio, hora_fim: novaHoraFim,
      equipe_id: novoEquipeId, excluir_os_id: id
    });
    if (verificarConflitoEResponder(res, conflitos, req.body?.ignorar_conflitos)) return;
  }
  const novos = {
    cliente_id: novoClienteId,
    local_id: novoLocalId,
    responsavel_local: responsavel_local !== undefined ? responsavel_local : os.responsavel_local,
    equipamento_id: novoEquipamentoId,
    servico: servico ?? os.servico,
    descricao: descricao !== undefined ? descricao : os.descricao,
    prioridade: prioridade ?? os.prioridade,
    data_agendada: novaDataAgendada,
    hora_inicio: novaHoraInicio,
    hora_fim: novaHoraFim,
    equipe_id: novoEquipeId,
    confirmada: confirmada !== undefined ? (confirmada ? 1 : 0) : os.confirmada,
    tipo_atendimento: tipo_atendimento !== undefined && tipo_atendimento !== '' ? tipo_atendimento : (tipo_atendimento === '' ? null : os.tipo_atendimento)
  };
  for (const campo of Object.keys(novos)) {
    if (String(novos[campo] ?? '') !== String(os[campo] ?? '')) {
      registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo, valorAnterior: os[campo], valorNovo: novos[campo] });
    }
  }
  db.prepare(
    `UPDATE ordens_servico SET cliente_id = ?, local_id = ?, responsavel_local = ?, equipamento_id = ?,
       servico = ?, descricao = ?, prioridade = ?, data_agendada = ?, hora_inicio = ?, hora_fim = ?,
       equipe_id = ?, confirmada = ?, tipo_atendimento = ?
     WHERE id = ?`
  ).run(
    novos.cliente_id, novos.local_id, novos.responsavel_local, novos.equipamento_id,
    novos.servico, novos.descricao, novos.prioridade, novos.data_agendada,
    novos.hora_inicio, novos.hora_fim, novos.equipe_id, novos.confirmada,
    novos.tipo_atendimento, id
  );
  res.json({ os: getOS(id) });
});

router.patch('/os/:id/cancelar', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (!['pendente', 'em_andamento'].includes(os.status)) {
    return res.status(400).json({ error: 'Somente OS pendente ou em andamento pode ser cancelada' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'cancelada' WHERE id = ?").run(id);
  res.json({ os: getOS(id) });
});

router.delete('/os/:id', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status === 'em_andamento' || os.status === 'em_deslocamento') {
    return res.status(400).json({ error: 'OS em atendimento não pode ser excluída; cancele-a primeiro' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'excluida' WHERE id = ?").run(id);
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'exclusao', valorNovo: `OS ${os.numero} excluída (mantida no histórico do cliente)` });
  res.json({ os: getOS(id) });
});

router.get('/agenda', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT o.id, o.numero, o.servico, o.prioridade, o.data_agendada, o.hora_inicio, o.hora_fim, o.status,
      c.nome AS cliente_nome, l.nome AS local_nome, l.endereco AS local_endereco, eq.nome AS equipe_nome,
      ${sqlEnderecoCompleto('l')}
    FROM ordens_servico o
    LEFT JOIN clientes c ON c.id = o.cliente_id
    LEFT JOIN locais l ON l.id = o.local_id
    LEFT JOIN equipes eq ON eq.id = o.equipe_id
    WHERE o.data_agendada IS NOT NULL AND o.status NOT IN ('cancelada', 'excluida')`;
  const params = [];
  if (data_inicio) {
    sql += ' AND o.data_agendada >= ?';
    params.push(data_inicio);
  }
  if (data_fim) {
    sql += ' AND o.data_agendada <= ?';
    params.push(data_fim);
  }
  sql += ' ORDER BY o.data_agendada, o.prioridade';
  res.json({ agenda: db.prepare(sql).all(...params) });
});

router.patch('/os/:id/validar', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status !== 'aguardando_validacao') {
    return res.status(400).json({ error: 'Somente OS aguardando validação pode ser validada' });
  }
  const execucao = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(id);
  if (!execucao) {
    return res.status(400).json({ error: 'OS sem execução registrada' });
  }
  const { aprovado, recomendacoes, complemento_motivo, enviar_comercial } = req.body || {};
  if (aprovado === undefined) {
    return res.status(400).json({ error: 'Informe o campo aprovado (true/false)' });
  }
  const relatorioExistente = db.prepare('SELECT id FROM relatorios WHERE os_id = ?').get(id);

  if (!aprovado) {
    const motivo = (complemento_motivo || '').trim();
    if (!motivo) {
      return res.status(400).json({ error: 'Informe o motivo do complemento solicitado' });
    }
    db.prepare(
      `UPDATE relatorios SET status = 'reprovado', validado_por = ?, data_validacao = datetime('now'),
         recomendacoes = ?, complemento_motivo = ?, enviado_comercial = 0, enviado_comercial_em = NULL
       WHERE os_id = ?`
    ).run(req.user.id, recomendacoes ?? null, motivo, id);
    db.prepare('UPDATE execucoes SET complemento_solicitado = ? WHERE id = ?').run(motivo, execucao.id);
    db.prepare("UPDATE ordens_servico SET status = 'em_andamento' WHERE id = ?").run(id);
    registrarHistorico({ usuario: req.user, tipo: 'relatorio', registroId: relatorioExistente.id, campo: 'complemento', valorNovo: motivo });
    registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'status', valorAnterior: 'aguardando_validacao', valorNovo: 'em_andamento (complemento solicitado)' });
    return res.json({ os: getOS(id) });
  }

  const status = 'aprovado';
  const novoTokenRel = crypto.randomBytes(16).toString('hex');
  if (relatorioExistente) {
    db.prepare(
      `UPDATE relatorios SET status = ?, validado_por = ?, data_validacao = datetime('now'),
         recomendacoes = ?, complemento_motivo = NULL, token = COALESCE(token, ?) WHERE os_id = ?`
    ).run(status, req.user.id, recomendacoes ?? null, novoTokenRel, id);
  } else {
    db.prepare(
      'INSERT INTO relatorios (os_id, status, validado_por, data_validacao, recomendacoes, token) VALUES (?, ?, ?, datetime(\'now\'), ?, ?)'
    ).run(id, status, req.user.id, recomendacoes ?? null, novoTokenRel);
  }
  const relatorio = db.prepare('SELECT * FROM relatorios WHERE os_id = ?').get(id);
  const temOportunidade = enviar_comercial === true || (execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao');
  if (temOportunidade) {
    db.prepare(
      'UPDATE relatorios SET enviado_comercial = 1, enviado_comercial_em = datetime(\'now\') WHERE id = ?'
    ).run(relatorio.id);
    const jaExiste = db.prepare('SELECT id FROM oportunidades WHERE relatorio_id = ?').get(relatorio.id);
    if (!jaExiste) {
      const tipoOportunidade = execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao'
        ? execucao.necessidade_adicional
        : 'outro_servico';
      const descricao = [
        os.servico,
        TIPOS_NECESSIDADE[tipoOportunidade],
        recomendacoes ? `Recomendações: ${recomendacoes}` : null
      ].filter(Boolean).join(' — ');
      db.prepare(
        'INSERT INTO oportunidades (relatorio_id, tipo, descricao, status, criado_por) VALUES (?, ?, ?, ?, ?)'
      ).run(relatorio.id, tipoOportunidade, descricao, 'novo', req.user.id);
      const novaOportunidade = db.prepare('SELECT id FROM oportunidades WHERE relatorio_id = ?').get(relatorio.id);
      registrarHistorico({ usuario: req.user, tipo: 'oportunidade', registroId: novaOportunidade.id, campo: 'criacao_automatica', valorNovo: descricao });
    }
    registrarHistorico({ usuario: req.user, tipo: 'relatorio', registroId: relatorio.id, campo: 'envio_comercial', valorNovo: 'relatório validado disponibilizado ao comercial' });
  } else {
    db.prepare('UPDATE relatorios SET enviado_comercial = 0, enviado_comercial_em = NULL WHERE id = ?').run(relatorio.id);
  }
  db.prepare("UPDATE ordens_servico SET status = 'concluida' WHERE id = ?").run(id);
  const avaliacaoExistente = db.prepare('SELECT id FROM avaliacoes WHERE os_id = ?').get(id);
  if (!avaliacaoExistente) {
    db.prepare('INSERT INTO avaliacoes (os_id, token) VALUES (?, ?)').run(id, crypto.randomBytes(16).toString('hex'));
    registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'avaliacao', valorNovo: 'avaliação de cliente liberada' });
  }
  registrarHistorico({ usuario: req.user, tipo: 'relatorio', registroId: relatorio.id, campo: 'validacao', valorAnterior: 'pendente', valorNovo: 'aprovado' });
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'status', valorAnterior: 'aguardando_validacao', valorNovo: 'concluida' });
  res.json({ os: getOS(id) });
});

router.post('/os/:id/avaliacao/link', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status !== 'concluida') {
    return res.status(400).json({ error: 'A avaliação é liberada somente após a OS ser concluída e validada' });
  }
  let avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE os_id = ?').get(id);
  if (!avaliacao) {
    const info = db.prepare('INSERT INTO avaliacoes (os_id, token) VALUES (?, ?)').run(id, crypto.randomBytes(16).toString('hex'));
    avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE id = ?').get(info.lastInsertRowid);
    registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'avaliacao', valorNovo: 'link de avaliação gerado' });
  }
  const link = `/avaliacao/${avaliacao.token}`;
  res.json({ avaliacao: { id: avaliacao.id, token: avaliacao.token, status: avaliacao.status, link } });
});

router.post('/os/:id/relatorio/link', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  let relatorio = db.prepare('SELECT * FROM relatorios WHERE os_id = ?').get(id);
  if (!relatorio) {
    const token = crypto.randomBytes(16).toString('hex');
    const info = db.prepare("INSERT INTO relatorios (os_id, status, token) VALUES (?, 'aprovado', ?)").run(id, token);
    relatorio = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(info.lastInsertRowid);
  } else if (!relatorio.token || req.body?.novo) {
    const token = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE relatorios SET token = ? WHERE id = ?').run(token, relatorio.id);
    relatorio = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(relatorio.id);
  }
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'relatorio', valorNovo: 'link do relatório gerado para envio' });
  const link = `/relatorio/${relatorio.token}`;
  res.json({ relatorio: { id: relatorio.id, token: relatorio.token, status: relatorio.status, link } });
});

router.patch('/os/:id/reabrir', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (!['concluida', 'aguardando_validacao', 'cancelada'].includes(os.status)) {
    return res.status(400).json({ error: 'Somente OS concluída, aguardando validação ou cancelada pode ser reaberta' });
  }
  const motivo = String((req.body || {}).motivo || '').trim();
  if (!motivo) {
    return res.status(400).json({ error: 'Informe o motivo da reabertura' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'em_andamento' WHERE id = ?").run(id);
  const execucao = db.prepare('SELECT id FROM execucoes WHERE os_id = ?').get(id);
  if (execucao) {
    db.prepare('UPDATE execucoes SET complemento_solicitado = ?, concluida_em = NULL WHERE id = ?').run(`Reaberta pelo gestor: ${motivo}`, execucao.id);
  }
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'reabertura', valorNovo: motivo });
  res.json({ os: getOS(id) });
});

module.exports = router;
