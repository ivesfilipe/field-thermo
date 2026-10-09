const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { registrarHistorico } = require('../../calendario');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/veiculos', (req, res) => {
  const busca = String(req.query.busca || '').trim();
  const veiculos = busca
    ? db.prepare('SELECT * FROM veiculos WHERE placa LIKE ? OR COALESCE(descricao, \'\') LIKE ? ORDER BY placa').all(`%${busca}%`, `%${busca}%`)
    : db.prepare('SELECT * FROM veiculos ORDER BY placa').all();
  res.json({ veiculos });
});

router.post('/veiculos', (req, res) => {
  const placa = String(req.body?.placa || '').trim().toUpperCase();
  if (!placa) return res.status(400).json({ error: 'Placa é obrigatória' });
  const existente = db.prepare('SELECT id FROM veiculos WHERE placa = ?').get(placa);
  if (existente) return res.status(409).json({ error: 'Já existe um veículo com esta placa' });
  const descricao = String(req.body?.descricao || '').trim() || null;
  const info = db.prepare('INSERT INTO veiculos (placa, descricao) VALUES (?, ?)').run(placa, descricao);
  const veiculo = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(info.lastInsertRowid);
  registrarHistorico({ usuario: req.user, tipo: 'veiculo', registroId: veiculo.id, campo: 'criacao', valorNovo: placa });
  res.status(201).json({ veiculo });
});

router.put('/veiculos/:id', (req, res) => {
  const id = Number(req.params.id);
  const veiculo = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(id);
  if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
  const placa = String(req.body?.placa || '').trim().toUpperCase();
  if (!placa) return res.status(400).json({ error: 'Placa é obrigatória' });
  const dup = db.prepare('SELECT id FROM veiculos WHERE placa = ? AND id != ?').get(placa, id);
  if (dup) return res.status(409).json({ error: 'Já existe um veículo com esta placa' });
  const descricao = String(req.body?.descricao || '').trim() || null;
  const ativo = req.body?.ativo === false || req.body?.ativo === 0 ? 0 : 1;
  db.prepare('UPDATE veiculos SET placa = ?, descricao = ?, ativo = ? WHERE id = ?').run(placa, descricao, ativo, id);
  registrarHistorico({ usuario: req.user, tipo: 'veiculo', registroId: id, campo: 'alteracao', valorAnterior: veiculo.placa, valorNovo: placa });
  res.json({ veiculo: db.prepare('SELECT * FROM veiculos WHERE id = ?').get(id) });
});

router.delete('/veiculos/:id', (req, res) => {
  const id = Number(req.params.id);
  const veiculo = db.prepare('SELECT * FROM veiculos WHERE id = ?').get(id);
  if (!veiculo) return res.status(404).json({ error: 'Veículo não encontrado' });
  const emUso = db.prepare('SELECT id FROM registros_km WHERE veiculo_id = ? LIMIT 1').get(id);
  if (emUso) {
    return res.status(400).json({ error: 'Veículo possui registros de quilometragem e não pode ser excluído. Desative-o.' });
  }
  db.prepare('DELETE FROM veiculos WHERE id = ?').run(id);
  registrarHistorico({ usuario: req.user, tipo: 'veiculo', registroId: id, campo: 'exclusao', valorAnterior: veiculo.placa });
  res.json({ ok: true });
});

module.exports = router;