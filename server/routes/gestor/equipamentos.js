const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { sqlEnderecoCompleto } = require('../../endereco');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

const CAMPOS = [
  'patrimonio', 'tipo', 'fabricante', 'modelo', 'capacidade', 'gas_refrigerante',
  'tensao', 'local', 'ambiente', 'numero_serie', 'observacoes', 'status', 'nome'
];

const STATUS_EQUIPAMENTO = ['operando', 'em_manutencao', 'inoperante', 'desativado'];

function proximoCodigoMT() {
  const row = db
    .prepare(
      "SELECT codigo_mt FROM equipamentos WHERE codigo_mt LIKE 'MT-%' ORDER BY CAST(substr(codigo_mt, 4) AS INTEGER) DESC LIMIT 1"
    )
    .get();
  const n = row ? parseInt(row.codigo_mt.slice(3), 10) + 1 : 1;
  return `MT-${String(n).padStart(3, '0')}`;
}

function getEquipamentoCompleto(id) {
  const equipamento = db
    .prepare(
      `SELECT e.*, c.nome AS cliente_nome, l.nome AS local_nome, l.endereco AS local_endereco,
        ${sqlEnderecoCompleto('l')}
       FROM equipamentos e
       LEFT JOIN clientes c ON c.id = e.cliente_id
       LEFT JOIN locais l ON l.id = e.local_id
       WHERE e.id = ?`
    )
    .get(id);
  if (!equipamento) return null;
  equipamento.historico = db
    .prepare(
      `SELECT o.id, o.numero, o.servico, o.data_agendada, o.status, o.criado_em,
        r.id AS relatorio_id, r.status AS relatorio_status
       FROM ordens_servico o
       LEFT JOIN relatorios r ON r.os_id = o.id
       WHERE o.equipamento_id = ?
       ORDER BY o.criado_em DESC`
    )
    .all(id);
  return equipamento;
}

router.get('/equipamentos', (req, res) => {
  const { cliente_id, local_id, busca, status } = req.query;
  let sql = `
    SELECT e.*, c.nome AS cliente_nome, l.nome AS local_nome, l.endereco AS local_endereco,
      ${sqlEnderecoCompleto('l')}
    FROM equipamentos e
    LEFT JOIN clientes c ON c.id = e.cliente_id
    LEFT JOIN locais l ON l.id = e.local_id
    WHERE 1 = 1`;
  const params = [];
  if (cliente_id) {
    sql += ' AND e.cliente_id = ?';
    params.push(cliente_id);
  }
  if (local_id) {
    sql += ' AND e.local_id = ?';
    params.push(local_id);
  }
  if (status) {
    sql += ' AND e.status = ?';
    params.push(status);
  }
  if (busca) {
    sql += ' AND (e.nome LIKE ? OR e.codigo_mt LIKE ? OR e.numero_serie LIKE ? OR e.fabricante LIKE ? OR e.patrimonio LIKE ?)';
    const like = `%${busca}%`;
    params.push(like, like, like, like, like);
  }
  sql += ' ORDER BY e.codigo_mt';
  const equipamentos = db.prepare(sql).all(...params);
  for (const e of equipamentos) {
    e.historico = db
      .prepare(
        `SELECT o.id, o.numero, o.servico, o.data_agendada, o.status,
          r.id AS relatorio_id
         FROM ordens_servico o
         LEFT JOIN relatorios r ON r.os_id = o.id
         WHERE o.equipamento_id = ?
         ORDER BY o.criado_em DESC`
      )
      .all(e.id);
  }
  res.json({ equipamentos });
});

router.get('/equipamentos/:id', (req, res) => {
  const equipamento = getEquipamentoCompleto(Number(req.params.id));
  if (!equipamento) {
    return res.status(404).json({ error: 'Equipamento não encontrado' });
  }
  res.json({ equipamento });
});

router.post('/equipamentos', (req, res) => {
  const { cliente_id, local_id } = req.body || {};
  if (!cliente_id) {
    return res.status(400).json({ error: 'Informe o cliente do equipamento' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  if (local_id) {
    const local = db.prepare('SELECT id FROM locais WHERE id = ? AND cliente_id = ?').get(local_id, cliente_id);
    if (!local) {
      return res.status(400).json({ error: 'Local não pertence ao cliente informado' });
    }
  }
  const dados = { ...req.body };
  for (const campo of CAMPOS) {
    if (dados[campo] === undefined || dados[campo] === '') dados[campo] = null;
  }
  if (!dados.nome) {
    dados.nome = [dados.tipo, dados.fabricante, dados.modelo, dados.capacidade].filter(Boolean).join(' ').trim() || 'Equipamento';
  }
  if (dados.status !== null && !STATUS_EQUIPAMENTO.includes(dados.status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  const codigo_mt = proximoCodigoMT();
  const info = db
    .prepare(
      `INSERT INTO equipamentos
        (cliente_id, local_id, nome, modelo, fabricante, numero_serie, capacidade, patrimonio,
         codigo_mt, tipo, gas_refrigerante, tensao, local, ambiente, observacoes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      cliente_id,
      local_id ?? null,
      dados.nome ?? 'Equipamento',
      dados.modelo,
      dados.fabricante,
      dados.numero_serie,
      dados.capacidade,
      dados.patrimonio,
      codigo_mt,
      dados.tipo,
      dados.gas_refrigerante,
      dados.tensao,
      dados.local,
      dados.ambiente,
      dados.observacoes,
      dados.status ?? 'operando'
    );
  res.status(201).json({ equipamento: getEquipamentoCompleto(info.lastInsertRowid) });
});

router.put('/equipamentos/:id', (req, res) => {
  const id = Number(req.params.id);
  const equipamento = db.prepare('SELECT * FROM equipamentos WHERE id = ?').get(id);
  if (!equipamento) {
    return res.status(404).json({ error: 'Equipamento não encontrado' });
  }
  const { cliente_id, local_id } = req.body || {};
  const novoClienteId = cliente_id !== undefined && cliente_id !== '' ? cliente_id : equipamento.cliente_id;
  if (novoClienteId !== equipamento.cliente_id) {
    const historico = db.prepare('SELECT COUNT(*) AS n FROM ordens_servico WHERE equipamento_id = ?').get(id).n;
    if (historico > 0) {
      return res.status(400).json({ error: 'Equipamento possui histórico de OS; não é possível transferi-lo de cliente' });
    }
  }
  const novoLocalId = local_id !== undefined ? local_id : equipamento.local_id;
  if (novoLocalId) {
    const local = db.prepare('SELECT id FROM locais WHERE id = ? AND cliente_id = ?').get(novoLocalId, novoClienteId);
    if (!local) {
      return res.status(400).json({ error: 'Local não pertence ao cliente informado' });
    }
  }
  const updates = [];
  const params = [];
  for (const campo of CAMPOS) {
    if (req.body[campo] !== undefined) {
      updates.push(`${campo} = ?`);
      params.push(req.body[campo] === '' ? null : req.body[campo]);
    }
  }
  if (req.body.status !== undefined && !STATUS_EQUIPAMENTO.includes(req.body.status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  if (cliente_id !== undefined && cliente_id !== '') {
    updates.push('cliente_id = ?');
    params.push(novoClienteId);
  }
  if (local_id !== undefined && local_id !== equipamento.local_id) {
    updates.push('local_id = ?');
    params.push(novoLocalId);
  }
  if (updates.length === 0) {
    return res.json({ equipamento: getEquipamentoCompleto(id) });
  }
  db.prepare(`UPDATE equipamentos SET ${updates.join(', ')} WHERE id = ?`).run(...params, id);
  res.json({ equipamento: getEquipamentoCompleto(id) });
});

router.delete('/equipamentos/:id', (req, res) => {
  const id = Number(req.params.id);
  const equipamento = db.prepare('SELECT id FROM equipamentos WHERE id = ?').get(id);
  if (!equipamento) {
    return res.status(404).json({ error: 'Equipamento não encontrado' });
  }
  const vinculadas = db.prepare('SELECT COUNT(*) AS n FROM ordens_servico WHERE equipamento_id = ?').get(id).n;
  if (vinculadas > 0) {
    return res.status(400).json({ error: 'Equipamento possui histórico de ordens de serviço. Prefira desativá-lo (status "Desativado") em vez de excluir.' });
  }
  db.prepare('DELETE FROM equipamentos WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;