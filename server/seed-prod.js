const bcrypt = require('bcryptjs');
const db = require('./db');

const nome = process.env.SEED_ADMIN_NOME;
const email = process.env.SEED_ADMIN_EMAIL;
const senha = process.env.SEED_ADMIN_SENHA;

if (!nome || !email || !senha) {
  console.error('Defina SEED_ADMIN_NOME, SEED_ADMIN_EMAIL e SEED_ADMIN_SENHA.');
  process.exit(1);
}

const total = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get().total;
if (total > 0 && !process.argv.includes('--force')) {
  console.error(`Banco já possui ${total} usuário(s). Use --force para criar mesmo assim.`);
  process.exit(1);
}

const existente = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
if (existente) {
  console.error(`Usuário com e-mail ${email} já existe (id=${existente.id}).`);
  process.exit(1);
}

const info = db
  .prepare('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES (?, ?, ?, ?)')
  .run(nome, email, bcrypt.hashSync(senha, 10), 'admin');

console.log(`Admin de produção criado: id=${info.lastInsertRowid} email=${email}`);
