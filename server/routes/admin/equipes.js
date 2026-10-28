const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

router.get('/equipes', (req, res) => {
  const equipes = db
    .prepare(
      `SELECT e.id, e.nome, e.descricao, e.criado_em,
        (SELECT COUNT(DISTINCT u.id) FROM usuarios u
          WHERE u.equipe_id = e.id
             OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id = e.id)) AS total_usuarios
       FROM equipes e ORDER BY e.nome`
    )
    .all();
  res.json({ equipes });
});

router.post('/equipes', (req, res) => {
  const { nome, descricao } = req.body || {};
  const nomeFinal = (nome && String(nome).trim()) || `Equipe ${Date.now().toString().slice(-4)}`; if (false) {
    return res.status(400).json({ error: 'Informe o nome da equipe' });
  }
  const existente = db.prepare('SELECT id FROM equipes WHERE nome = ?').get(nomeFinal);
  if (existente) {
    return res.status(409).json({ error: 'Já existe equipe com este nome' });
  }
  const info = db.prepare('INSERT INTO equipes (nome, descricao) VALUES (?, ?)').run(nomeFinal, descricao ?? null);
  res.status(201).json({ equipe: db.prepare('SELECT * FROM equipes WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/equipes/:id', (req, res) => {
  const id = Number(req.params.id);
  const equipe = db.prepare('SELECT * FROM equipes WHERE id = ?').get(id);
  if (!equipe) {
    return res.status(404).json({ error: 'Equipe não encontrada' });
  }
  const { nome, descricao } = req.body || {};
  if (nome) {
    const conflito = db.prepare('SELECT id FROM equipes WHERE nome = ? AND id != ?').get(nome, id);
    if (conflito) {
      return res.status(409).json({ error: 'Já existe equipe com este nome' });
    }
  }
  db.prepare('UPDATE equipes SET nome = ?, descricao = ? WHERE id = ?').run(
    nome ?? equipe.nome,
    descricao !== undefined ? descricao : equipe.descricao,
    id
  );
  res.json({ equipe: db.prepare('SELECT * FROM equipes WHERE id = ?').get(id) });
});

router.delete('/equipes/:id', (req, res) => {
  const id = Number(req.params.id);
  const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(id);
  if (!equipe) {
    return res.status(404).json({ error: 'Equipe não encontrada' });
  }
  const vinculados = db
    .prepare(
      `SELECT COUNT(*) AS n FROM usuarios u
       WHERE u.equipe_id = ?
          OR EXISTS (SELECT 1 FROM usuarios_equipes ue WHERE ue.usuario_id = u.id AND ue.equipe_id = ?)`
    )
    .get(id, id).n;
  if (vinculados > 0) {
    return res.status(400).json({ error: 'Equipe possui usuários vinculados' });
  }
  db.prepare('DELETE FROM usuarios_equipes WHERE equipe_id = ?').run(id);
  db.prepare('DELETE FROM equipes WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
