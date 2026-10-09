const fs = require('fs');
const path = require('path');
const config = require('../server/config');

const dbPath = config.DB_PATH;
if (!fs.existsSync(dbPath)) {
  console.error(`Banco não encontrado: ${dbPath}`);
  process.exit(1);
}

const backupDir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(dbPath, { readonly: true });
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
const destino = path.join(backupDir, `field-${stamp}.db`);
fs.copyFileSync(dbPath, destino);

const wal = dbPath + '-wal';
const shm = dbPath + '-shm';
if (fs.existsSync(wal)) fs.copyFileSync(wal, destino + '-wal');
if (fs.existsSync(shm)) fs.copyFileSync(shm, destino + '-shm');

console.log(`Backup criado: ${destino}`);
