const Database = require('better-sqlite3');
const db = new Database('server/data/field.db');
db.pragma('foreign_keys = ON');
console.log('equipes:', db.prepare('SELECT id, nome FROM equipes').all().map((e) => `${e.id}:${e.nome}`).join(' | '));
console.log('clientes:', db.prepare('SELECT id, nome FROM clientes').all().map((c) => `${c.id}:${c.nome}`).join(' | '));
console.log('locais:', db.prepare('SELECT id, nome, cliente_id FROM locais').all().map((l) => `${l.id}:${l.nome}(c${l.cliente_id})`).join(' | '));
console.log('equipamentos:', db.prepare('SELECT id, nome, codigo_mt, cliente_id FROM equipamentos').all().map((e) => `${e.id}:${e.nome}(${e.codigo_mt},c${e.cliente_id})`).join(' | '));
console.log('usuarios:', db.prepare('SELECT id, nome, perfil, equipe_id FROM usuarios').all().map((u) => `${u.id}:${u.nome}(${u.perfil},e${u.equipe_id})`).join(' | '));
db.close();