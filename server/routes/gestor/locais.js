



const express = require('express');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('gestor', 'admin'));

router.get('/locais', (req, res) => {
  const locais = db
    .prepare(
      `SELECT l.*, c.nome AS cliente_nome,
        (SELECT COUNT(*) FROM equipamentos e WHERE e.local_id = l.id) AS total_equipamentos
       FROM locais l
       LEFT JOIN clientes c ON c.id = l.cliente_id
       ORDER BY l.nome`
    )
    .all();
  res.json({ locais });
});

router.post('/locais', (req, res) => {
  const { cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude, responsavel_nome, responsavel_email, responsavel_telefone } = req.body || {};
  let clienteIdFinal = cliente_id ? Number(cliente_id) : (db.prepare('SELECT id FROM clientes ORDER BY id LIMIT 1').get()?.id || Number(db.prepare("INSERT INTO clientes (nome) VALUES ('Cliente Geral')").run().lastInsertRowid)); const nomeFinal = (nome && String(nome).trim()) || 'Principal'; if (false) {
    return res.status(400).json({ error: 'Informe cliente_id e nome do local' });
  }
  const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(clienteIdFinal);
  if (!cliente) {
    return res.status(404).json({ error: 'Cliente não encontrado' });
  }
  const info = db
    .prepare(
      `INSERT INTO locais (cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude,
        responsavel_nome, responsavel_email, responsavel_telefone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      clienteIdFinal, nomeFinal, endereco ?? null, cidade ?? null, estado ?? null, cep ?? null,
      latitude != null && latitude !== '' ? Number(latitude) : null,
      longitude != null && longitude !== '' ? Number(longitude) : null,
      responsavel_nome ?? null, responsavel_email ?? null, responsavel_telefone ?? null
    );
  res.status(201).json({ local: db.prepare('SELECT * FROM locais WHERE id = ?').get(info.lastInsertRowid) });
});

router.put('/locais/:id', (req, res) => {
  const id = Number(req.params.id);
  const local = db.prepare('SELECT * FROM locais WHERE id = ?').get(id);
  if (!local) {
    return res.status(404).json({ error: 'Local não encontrado' });
  }
  const { cliente_id, nome, endereco, cidade, estado, cep, latitude, longitude, responsavel_nome, responsavel_email, responsavel_telefone } = req.body || {};
  if (cliente_id) {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
  }
  db.prepare(
    `UPDATE locais SET cliente_id = ?, nome = ?, endereco = ?, cidade = ?, estado = ?, cep = ?,
      latitude = ?, longitude = ?, responsavel_nome = ?, responsavel_email = ?, responsavel_telefone = ? WHERE id = ?`
  ).run(
    cliente_id ?? local.cliente_id,
    nome ?? local.nome,
    endereco !== undefined ? endereco : local.endereco,
    cidade !== undefined ? cidade : local.cidade,
    estado !== undefined ? estado : local.estado,
    cep !== undefined ? cep : local.cep,
    latitude !== undefined && latitude !== '' ? Number(latitude) : local.latitude,
    longitude !== undefined && longitude !== '' ? Number(longitude) : local.longitude,
    responsavel_nome !== undefined ? responsavel_nome : local.responsavel_nome,
    responsavel_email !== undefined ? responsavel_email : local.responsavel_email,
    responsavel_telefone !== undefined ? responsavel_telefone : local.responsavel_telefone,
    id
  );
  res.json({ local: db.prepare('SELECT * FROM locais WHERE id = ?').get(id) });
});

router.delete('/locais/:id', (req, res) => {
  const id = Number(req.params.id);
  const local = db.prepare('SELECT id FROM locais WHERE id = ?').get(id);
  if (!local) {
    return res.status(404).json({ error: 'Local não encontrado' });
  }
  const vinculadas = db.prepare('SELECT COUNT(*) AS n FROM ordens_servico WHERE local_id = ?').get(id).n;
  if (vinculadas > 0) {
    return res.status(400).json({ error: 'Local possui ordens de serviço vinculadas' });
  }
  db.prepare('DELETE FROM locais WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
