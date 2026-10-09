const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

function signToken(user) {
  return jwt.sign(
    { id: user.id, perfil: user.perfil, nome: user.nome, email: user.email },
    config.JWT_SECRET,
    { expiresIn: config.TOKEN_EXPIRES_IN }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = db.prepare('SELECT id, nome, email, perfil, equipe_id, ativo FROM usuarios WHERE id = ?').get(payload.id);
    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Usuário inválido ou inativo' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireRole(...perfis) {
  return (req, res, next) => {
    if (!req.user || !perfis.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil' });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole };
