const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../../db');
const { authenticate, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate, requireRole('admin'));

const LIST_USER_SQL = `
  SELECT u.id, u.nome, u.email, u.perfil, u.equipe_id, u.ativo, u.criado_em, e.nome AS equipe_nome
  FROM usuarios u
  LEFT JOIN equipes e ON e.id = u.equipe_id
`;

function equipesDoUsuario(usuarioId) {
  return db
    .prepare(
      `SELECT e.id, e.nome FROM equipes e
       WHERE e.id IN (
         SELECT equipe_id FROM usuarios_equipes WHERE usuario_id = ?
         UNION
         SELECT equipe_id FROM usuarios WHERE id = ? AND equipe_id IS NOT NULL
       )
       ORDER BY e.nome`
    )
    .all(usuarioId, usuarioId);
}

function anexarEquipes(usuario) {
  if (!usuario) return usuario;
  usuario.equipes = equipesDoUsuario(usuario.id);
  return usuario;
}

function normalizarEquipeIds(body) {
  const ids = Array.isArray(body?.equipe_ids)
    ? body.equipe_ids
    : body?.equipe_id != null && body?.equipe_id !== ''
      ? [body.equipe_id]
      : null;
  if (ids === null) return null;
  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

function validarEquipes(ids) {
  if (!ids || !ids.length) return null;
  for (const id of ids) {
    const equipe = db.prepare('SELECT id FROM equipes WHERE id = ?').get(id);
    if (!equipe) {
      return `Equipe ${id} não encontrada`;
    }
  }
  return null;
}

function sincronizarEquipes(usuarioId, ids) {
  db.prepare('DELETE FROM usuarios_equipes WHERE usuario_id = ?').run(usuarioId);
  const insert = db.prepare('INSERT OR IGNORE INTO usuarios_equipes (usuario_id, equipe_id) VALUES (?, ?)');
  for (const id of ids) {
    insert.run(usuarioId, id);
  }
}

router.get('/usuarios', (req, res) => {
  const usuarios = db.prepare(`${LIST_USER_SQL} ORDER BY u.nome`).all().map(anexarEquipes);
  res.json({ usuarios });
});

router.post('/usuarios', (req, res) => {
  const { nome, email, senha, perfil, equipe_id, ativo } = req.body || {};
  if (!nome || !email || !senha || !perfil) {
    return res.status(400).json({ error: 'Informe nome, email, senha e perfil' });
  }
  const perfis = ['admin', 'gestor', 'tecnico', 'comercial'];
  if (!perfis.includes(perfil)) {
    return res.status(400).json({ error: 'Perfil inválido' });
  }
  const emailNormalizado = String(email).toLowerCase().trim();
  const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailNormalizado);
  if (existente) {
    return res.status(409).json({ error: 'Já existe usuário com este email' });
  }
  const equipeIds = normalizarEquipeIds(req.body);
  const erroEquipes = validarEquipes(equipeIds);
  if (erroEquipes) {
    return res.status(400).json({ error: erroEquipes });
  }
  const equipePrincipal = equipeIds && equipeIds.length > 0 ? equipeIds[0] : null;
  const info = db
    .prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil, equipe_id, ativo) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nome, emailNormalizado, bcrypt.hashSync(String(senha), 10), perfil, equipePrincipal, ativo === false ? 0 : 1);
  if (equipeIds && equipeIds.length > 0) {
    sincronizarEquipes(info.lastInsertRowid, equipeIds);
  }
  const usuario = anexarEquipes(db.prepare(`${LIST_USER_SQL} WHERE u.id = ?`).get(info.lastInsertRowid));
  res.status(201).json({ usuario });
});

router.put('/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  const { nome, email, senha, perfil, equipe_id, ativo } = req.body || {};
  const perfis = ['admin', 'gestor', 'tecnico', 'comercial'];
  if (perfil && !perfis.includes(perfil)) {
    return res.status(400).json({ error: 'Perfil inválido' });
  }
  const novoEmail = email ? String(email).toLowerCase().trim() : usuario.email;
  if (email) {
    const conflito = db.prepare('SELECT id FROM usuarios WHERE email = ? AND id != ?').get(novoEmail, id);
    if (conflito) {
      return res.status(409).json({ error: 'Já existe usuário com este email' });
    }
  }
  const equipeIds = normalizarEquipeIds(req.body);
  const erroEquipes = validarEquipes(equipeIds);
  if (erroEquipes) {
    return res.status(400).json({ error: erroEquipes });
  }
  const novaEquipeId = equipeIds !== null
    ? (equipeIds.length > 0 ? equipeIds[0] : null)
    : (equipe_id !== undefined ? equipe_id : usuario.equipe_id);
  db.prepare(
    'UPDATE usuarios SET nome = ?, email = ?, perfil = ?, equipe_id = ?, ativo = ? WHERE id = ?'
  ).run(
    nome ?? usuario.nome,
    novoEmail,
    perfil ?? usuario.perfil,
    novaEquipeId,
    ativo !== undefined ? (ativo ? 1 : 0) : usuario.ativo,
    id
  );
  if (equipeIds !== null) {
    sincronizarEquipes(id, equipeIds);
  }
  if (senha) {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(senha), 10), id);
  }
  res.json({ usuario: anexarEquipes(db.prepare(`${LIST_USER_SQL} WHERE u.id = ?`).get(id)) });
});

router.patch('/usuarios/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Não é possível desativar o próprio usuário' });
  }
  const { ativo } = req.body || {};
  if (ativo === undefined) {
    return res.status(400).json({ error: 'Informe o campo ativo' });
  }
  db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(ativo ? 1 : 0, id);
  res.json({ usuario: db.prepare(`${LIST_USER_SQL} WHERE u.id = ?`).get(id) });
});

router.delete('/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  const usuario = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  if (id === req.user.id) {
    return res.status(400).json({ error: 'Não é possível excluir o próprio usuário' });
  }
  const execucoes = db.prepare('SELECT COUNT(*) AS n FROM execucoes WHERE tecnico_id = ?').get(id).n;
  if (execucoes > 0) {
    return res.status(400).json({ error: `Usuário possui ${execucoes} execução(ões) vinculada(s); desative-o em vez de excluir` });
  }
  db.prepare('DELETE FROM usuarios_equipes WHERE usuario_id = ?').run(id);
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
