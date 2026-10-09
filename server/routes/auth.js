const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken, authenticate } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'Informe email e senha' });
  }
  const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email).toLowerCase().trim());
  if (!user || !user.ativo) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  if (!bcrypt.compareSync(String(senha), user.senha_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }
  const token = signToken(user);
  res.json({
    token,
    usuario: { id: user.id, nome: user.nome, email: user.email, perfil: user.perfil, equipe_id: user.equipe_id }
  });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ usuario: req.user });
});

module.exports = router;
