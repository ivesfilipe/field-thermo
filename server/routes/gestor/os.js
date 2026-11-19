const express = require('express');
const crypto = require('crypto');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const {
  detectarConflitos,
  registrarHistorico,
  verificarConflitoEResponder
} = require('../../calendario');
const { MODELOS } = require('../../modelos');
const { sqlEnderecoCompleto } = require('../../endereco');
const config = require('../../config');
const { enviarEmailServidor, montarHtmlAvaliacaoGoogle, montarHtmlRelatorioCliente } = require('../../services/email');
const { agoraBrasilia } = require('../../tempo');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const OS_BASE = `
  SELECT o.id, o.numero, o.cliente_id, o.local_id, o.responsavel_local,
    o.equipamento_id, o.servico, o.descricao, o.prioridade, o.data_agendada,
    o.hora_inicio, o.hora_fim, o.confirmada, o.tipo_atendimento,
    o.equipe_id, o.status, o.criada_por, o.criado_em,
    o.atualizado_em, o.atualizado_por, ua.nome AS atualizado_por_nome,
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
  LEFT JOIN usuarios ua ON ua.id = o.atualizado_por
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
  sql += ` ORDER BY
    CASE WHEN o.data_agendada IS NULL THEN 1 ELSE 0 END,
    o.data_agendada ASC,
    CASE WHEN o.hora_inicio IS NULL THEN 1 ELSE 0 END,
    o.hora_inicio ASC,
    CASE o.prioridade WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
    o.id ASC`;
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
  // O Gestor pode corrigir os dados administrativos da OS em qualquer status
  // (inclusive concluída). A execução/relatório da equipe é preservada.
  if (os.status === 'excluida') {
    return res.status(400).json({ error: 'OS excluída não pode ser editada' });
  }
  const osFinalizada = ['concluida', 'aguardando_validacao', 'cancelada'].includes(os.status);
  const {
    cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
    prioridade, data_agendada, hora_inicio, hora_fim, equipe_id, confirmada, tipo_atendimento,
    diagnostico, servico_executado, solucao, observacoes_equipe
  } = req.body || {};
  if (tipo_atendimento !== undefined && tipo_atendimento !== null && tipo_atendimento !== '' && !MODELOS[tipo_atendimento]) {
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
  if (novaDataAgendada && novaHoraInicio && !osFinalizada) {
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
       equipe_id = ?, confirmada = ?, tipo_atendimento = ?,
       atualizado_em = datetime('now', '-3 hours'), atualizado_por = ?
     WHERE id = ?`
  ).run(
    novos.cliente_id, novos.local_id, novos.responsavel_local, novos.equipamento_id,
    novos.servico, novos.descricao, novos.prioridade, novos.data_agendada,
    novos.hora_inicio, novos.hora_fim, novos.equipe_id, novos.confirmada,
    novos.tipo_atendimento, req.user.id, id
  );
  // Se o gestor também editou campos da execução/relatório, atualiza livremente preservando fotos e assinaturas
  if (
    diagnostico !== undefined ||
    servico_executado !== undefined ||
    solucao !== undefined ||
    observacoes_equipe !== undefined
  ) {
    const execAtual = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(id);
    if (execAtual) {
      const novoDiag = diagnostico !== undefined ? (diagnostico || null) : execAtual.diagnostico;
      const novoServExec = servico_executado !== undefined ? (servico_executado || null) : execAtual.servico_executado;
      const novaSol = solucao !== undefined ? (solucao || null) : execAtual.solucao;
      const novaObs = observacoes_equipe !== undefined ? (observacoes_equipe || null) : execAtual.observacoes;
      db.prepare(
        'UPDATE execucoes SET diagnostico = ?, servico_executado = ?, solucao = ?, observacoes = ? WHERE os_id = ?'
      ).run(novoDiag, novoServExec, novaSol, novaObs, id);
    }
  }
  atualizarIdentificacaoRelatorio(id);
  res.json({ os: getOS(id) });
});

// Atualiza somente os blocos administrativos (identificação/solicitação) do
// conteúdo salvo do relatório. Diagnóstico, serviço executado, solução,
// observações, fotos e assinaturas da equipe NÃO são alterados.
function atualizarIdentificacaoRelatorio(osId) {
  const rel = db.prepare('SELECT id, conteudo FROM relatorios WHERE os_id = ?').get(osId);
  if (!rel || !rel.conteudo) return;
  let conteudo;
  try { conteudo = JSON.parse(rel.conteudo); } catch { return; }
  if (!conteudo || typeof conteudo !== 'object') return;
  const os = db.prepare(`${OS_BASE} WHERE o.id = ?`).get(osId);
  if (!os) return;
  conteudo.identificacao = {
    ...(conteudo.identificacao || {}),
    os: os.numero,
    cliente: os.cliente_nome,
    local: os.local_nome,
    responsavel_local: os.responsavel_local || os.local_responsavel,
    equipamento: os.equipamento_id ? os.equipamento_nome : null,
    modelo: os.equipamento_id ? os.equipamento_modelo : null,
    capacidade: os.equipamento_id ? os.equipamento_capacidade : null,
    patrimonio: os.equipamento_id ? os.equipamento_patrimonio : null
  };
  conteudo.solicitacao = {
    ...(conteudo.solicitacao || {}),
    servico: os.servico,
    descricao: os.descricao,
    prioridade: os.prioridade,
    data_agendada: os.data_agendada,
    hora_inicio: os.hora_inicio,
    hora_fim: os.hora_fim,
    equipe: os.equipe_nome
  };
  db.prepare('UPDATE relatorios SET conteudo = ? WHERE id = ?').run(JSON.stringify(conteudo), rel.id);
}

router.patch('/os/:id/anexos/:anexoId', (req, res) => {
  const osId = Number(req.params.id);
  const anexoId = Number(req.params.anexoId);
  const anexo = db.prepare('SELECT * FROM anexos WHERE id = ? AND os_id = ?').get(anexoId, osId);
  if (!anexo) {
    return res.status(404).json({ error: 'Anexo não encontrado' });
  }
  const legenda = req.body?.legenda !== undefined ? (String(req.body.legenda).trim() || null) : anexo.legenda;
  db.prepare('UPDATE anexos SET legenda = ? WHERE id = ?').run(legenda, anexo.id);
  res.json({ anexo: { ...anexo, legenda } });
});

router.post('/os/:id/copiar-assinatura', (req, res) => {
  const destinoId = Number(req.params.id);
  const { origem_os_id, copiar_cliente = true, copiar_tecnica = true } = req.body || {};
  const origemId = Number(origem_os_id);
  if (!origemId || origemId === destinoId) {
    return res.status(400).json({ error: 'Informe uma OS de origem válida e diferente da atual' });
  }
  const osDestino = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(destinoId);
  if (!osDestino) {
    return res.status(404).json({ error: 'OS de destino não encontrada' });
  }
  const osOrigem = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(origemId);
  if (!osOrigem) {
    return res.status(404).json({ error: 'OS de origem não encontrada' });
  }
  const execOrigem = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(origemId);
  if (!execOrigem) {
    return res.status(400).json({ error: 'A OS de origem não possui execução/assinatura registrada' });
  }
  const temCliente = Boolean(execOrigem.assinatura || (execOrigem.assinaturas && execOrigem.assinaturas !== '[]'));
  const temTecnica = Boolean(execOrigem.assinatura_tecnico);
  if ((copiar_cliente && !temCliente) && (copiar_tecnica && !temTecnica)) {
    return res.status(400).json({ error: 'A OS de origem não possui assinatura para copiar' });
  }
  let execDestino = db.prepare('SELECT * FROM execucoes WHERE os_id = ?').get(destinoId);
  if (!execDestino) {
    const info = db.prepare("INSERT INTO execucoes (os_id, iniciada_em) VALUES (?, datetime('now', '-3 hours'))").run(destinoId);
    execDestino = db.prepare('SELECT * FROM execucoes WHERE id = ?').get(info.lastInsertRowid);
  }
  const sets = [];
  const vals = [];
  if (copiar_cliente && temCliente) {
    sets.push('assinatura = ?', 'assinatura_nome = ?', 'assinatura_cargo = ?', 'assinaturas = ?');
    vals.push(execOrigem.assinatura, execOrigem.assinatura_nome, execOrigem.assinatura_cargo, execOrigem.assinaturas);
  }
  if (copiar_tecnica && temTecnica) {
    sets.push('assinatura_tecnico = ?', 'assinatura_tecnico_nome = ?');
    vals.push(execOrigem.assinatura_tecnico, execOrigem.assinatura_tecnico_nome);
  }
  if (!sets.length) {
    return res.status(400).json({ error: 'Nenhuma assinatura disponível nos tipos selecionados na OS de origem' });
  }
  db.prepare(`UPDATE execucoes SET ${sets.join(', ')} WHERE id = ?`).run(...vals, execDestino.id);
  registrarHistorico({
    usuario: req.user,
    tipo: 'os',
    registroId: destinoId,
    campo: 'assinatura',
    valorNovo: `Copiada da ${osOrigem.numero}`
  });
  res.json({ os: getOS(destinoId) });
});

router.patch('/os/:id/cancelar', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (!['pendente', 'em_deslocamento', 'em_andamento'].includes(os.status)) {
    return res.status(400).json({ error: 'Somente OS pendente ou em andamento pode ser cancelada' });
  }
  db.prepare("UPDATE ordens_servico SET status = 'cancelada' WHERE id = ?").run(id);
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'status', valorAnterior: os.status, valorNovo: 'cancelada' });
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

router.post('/os/:id/avaliacao/link', (req, res) => {
  const id = Number(req.params.id);
  const os = db.prepare('SELECT * FROM ordens_servico WHERE id = ?').get(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  if (os.status !== 'concluida') {
    return res.status(400).json({ error: 'A avaliação é liberada somente após a OS ser concluída' });
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

router.post('/os/:id/avaliacao/enviar-email', async (req, res) => {
  const id = Number(req.params.id);
  const os = getOS(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const emailDestino = String(req.body?.email || os.local_responsavel_email || os.cliente_email || '').trim();
  if (!emailDestino || !emailDestino.includes('@')) {
    return res.status(400).json({ error: 'Este cliente/local não possui e-mail válido cadastrado. Informe um e-mail para envio.' });
  }
  let avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE os_id = ?').get(id);
  if (!avaliacao) {
    const info = db.prepare('INSERT INTO avaliacoes (os_id, token) VALUES (?, ?)').run(id, crypto.randomBytes(16).toString('hex'));
    avaliacao = db.prepare('SELECT * FROM avaliacoes WHERE id = ?').get(info.lastInsertRowid);
  }
  const baseFront = req.body?.base_url || 'https://thermocontrol.medicalthermo.com';
  const urlAvaliacao = `${baseFront.replace(/\/$/, '')}/avaliar/${avaliacao.token}`;
  const html = montarHtmlAvaliacaoGoogle({
    os_numero: os.numero,
    cliente_nome: os.cliente_nome,
    responsavel_nome: os.local_responsavel || os.responsavel_local || os.cliente_nome,
    servico: os.servico,
    tecnico_nome: os.execucao?.executor_nome || '',
    link_google: config.GOOGLE_REVIEW_URL,
    url_avaliacao: urlAvaliacao
  });
  try {
    const envio = await enviarEmailServidor({
      para: emailDestino,
      assunto: `Avalie o atendimento da OS ${os.numero} - MedicalThermo Herzog`,
      html
    });
    const agora = agoraBrasilia();
    db.prepare('UPDATE execucoes SET avaliacao_google_enviada_em = ?, avaliacao_google_enviada_por = ? WHERE os_id = ?').run(agora, req.user.id, id);
    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: id,
      campo: 'avaliacao_google',
      valorNovo: `Link de avaliação do Google enviado por e-mail (${envio.remetente} -> ${envio.enviados.join(', ')})`
    });
    res.json({ ok: true, destinatarios: envio.enviados, remetente: envio.remetente });
  } catch (err) {
    res.status(500).json({ error: `Falha ao enviar e-mail pelo servidor: ${err.message}` });
  }
});

router.post('/os/:id/relatorio/enviar-email', async (req, res) => {
  const id = Number(req.params.id);
  const os = getOS(id);
  if (!os) {
    return res.status(404).json({ error: 'Ordem de serviço não encontrada' });
  }
  const emailDestino = String(req.body?.email || os.local_responsavel_email || os.cliente_email || '').trim();
  if (!emailDestino || !emailDestino.includes('@')) {
    return res.status(400).json({ error: 'Este cliente/local não possui e-mail válido cadastrado. Informe um e-mail para envio.' });
  }
  let relatorio = db.prepare('SELECT * FROM relatorios WHERE os_id = ?').get(id);
  if (!relatorio) {
    const token = crypto.randomBytes(16).toString('hex');
    const info = db.prepare("INSERT INTO relatorios (os_id, status, token) VALUES (?, 'aprovado', ?)").run(id, token);
    relatorio = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(info.lastInsertRowid);
  } else if (!relatorio.token) {
    const token = crypto.randomBytes(16).toString('hex');
    db.prepare('UPDATE relatorios SET token = ? WHERE id = ?').run(token, relatorio.id);
    relatorio = db.prepare('SELECT * FROM relatorios WHERE id = ?').get(relatorio.id);
  }
  const baseFront = (req.body?.base_url || 'https://thermocontrol.medicalthermo.com').replace(/\/$/, '');
  const baseApi = `${req.protocol}://${req.get('host')}`;
  const urlRelatorio = `${baseFront}/relatorio/${relatorio.token}`;
  const urlPdf = `${baseApi}/api/comercial/relatorios/publico/${relatorio.token}/pdf`;
  const avaliacao = db.prepare('SELECT token FROM avaliacoes WHERE os_id = ?').get(id);
  const urlAvaliacao = avaliacao?.token ? `${baseFront}/avaliar/${avaliacao.token}` : '';

  const html = montarHtmlRelatorioCliente({
    os_numero: os.numero,
    cliente_nome: os.cliente_nome,
    local_nome: os.local_nome,
    responsavel_nome: os.local_responsavel || os.responsavel_local || os.cliente_nome,
    equipamento_nome: os.equipamento_nome ? `${os.equipamento_codigo_mt ? `${os.equipamento_codigo_mt} - ` : ''}${os.equipamento_nome}` : '',
    tecnico_nome: os.execucao?.executor_nome || '',
    data_atendimento: os.execucao?.concluida_em?.slice(0, 16) || os.data_agendada || '',
    servico: os.servico,
    servico_executado: os.execucao?.servico_executado || '',
    diagnostico: os.execucao?.diagnostico || '',
    recomendacoes: relatorio.recomendacoes || os.execucao?.recomendacoes || '',
    url_relatorio: urlRelatorio,
    url_pdf: urlPdf,
    url_avaliacao: urlAvaliacao,
    url_google: config.GOOGLE_REVIEW_URL
  });

  try {
    const envio = await enviarEmailServidor({
      para: emailDestino,
      assunto: `Relatório Técnico de Atendimento - OS ${os.numero} (MedicalThermo Herzog)`,
      html
    });
    registrarHistorico({
      usuario: req.user,
      tipo: 'os',
      registroId: id,
      campo: 'relatorio',
      valorNovo: `Relatório enviado por e-mail (${envio.remetente} -> ${envio.enviados.join(', ')})`
    });
    res.json({ ok: true, destinatarios: envio.enviados, remetente: envio.remetente });
  } catch (err) {
    res.status(500).json({ error: `Falha ao enviar e-mail pelo servidor: ${err.message}` });
  }
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
    db.prepare('UPDATE execucoes SET complemento_solicitado = ?, concluida_em = NULL, concluida_por = NULL WHERE id = ?').run(`Reaberta pelo gestor: ${motivo}`, execucao.id);
  }
  db.prepare(
    `UPDATE relatorios SET status = 'pendente', validado_por = NULL, data_validacao = NULL,
       enviado_comercial = 0, enviado_comercial_em = NULL, complemento_motivo = ?
     WHERE os_id = ?`
  ).run(motivo, id);
  registrarHistorico({ usuario: req.user, tipo: 'os', registroId: id, campo: 'reabertura', valorNovo: motivo });
  res.json({ os: getOS(id) });
});

module.exports = router;
