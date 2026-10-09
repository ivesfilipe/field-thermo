const bcrypt = require('bcryptjs');
const db = require('./db');

function hash(password) {
  return bcrypt.hashSync(password, 10);
}

function insert(table, data) {
  const keys = Object.keys(data);
  const cols = keys.join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const info = db
    .prepare(`INSERT INTO ${table} (${cols}) VALUES (${placeholders})`)
    .run(...Object.values(data));
  return info.lastInsertRowid;
}

function clearAll() {
  const tables = [
    'usuarios_equipes',
    'oportunidades',
    'relatorios',
    'execucoes',
    'atividades',
    'historico',
    'ordens_servico',
    'equipamentos',
    'locais',
    'clientes',
    'usuarios',
    'equipes'
  ];
  const reset = db.prepare('DELETE FROM sqlite_sequence WHERE name = ?');
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t}`).run();
    reset.run(t);
  }
}

clearAll();

const equipeNorte = insert('equipes', { nome: 'Equipe Norte', descricao: 'Equipe responsável pela região norte' });
const equipeLeste = insert('equipes', { nome: 'Equipe Leste', descricao: 'Equipe responsável pela região leste' });

const adminId = insert('usuarios', { nome: 'Administrador', email: 'admin@field.com', senha_hash: hash('admin123'), perfil: 'admin' });
const gestorId = insert('usuarios', { nome: 'Gestor', email: 'gestor@field.com', senha_hash: hash('gestor123'), perfil: 'gestor', equipe_id: equipeNorte });
const tecnicoId = insert('usuarios', { nome: 'Técnico', email: 'tecnico@field.com', senha_hash: hash('tecnico123'), perfil: 'tecnico', equipe_id: equipeNorte });
const tecnico2Id = insert('usuarios', { nome: 'Técnico 2', email: 'tecnico2@field.com', senha_hash: hash('tecnico123'), perfil: 'tecnico', equipe_id: equipeNorte });
insert('usuarios', { nome: 'Comercial', email: 'comercial@field.com', senha_hash: hash('comercial123'), perfil: 'comercial' });
const tecnicoLesteId = insert('usuarios', { nome: 'Técnico Leste', email: 'tecnico.leste@field.com', senha_hash: hash('tecnico123'), perfil: 'tecnico', equipe_id: equipeLeste });

for (const [usuarioId, equipeId] of [
  [tecnicoId, equipeNorte],
  [tecnico2Id, equipeNorte],
  [tecnicoLesteId, equipeLeste]
]) {
  db.prepare('INSERT OR IGNORE INTO usuarios_equipes (usuario_id, equipe_id) VALUES (?, ?)').run(usuarioId, equipeId);
}

const clienteId = insert('clientes', {
  nome: 'MedicalThermo Herzog',
  documento: '00.000.000/0001-00',
  email: 'contato@medicalthermo.com',
  telefone: '(11) 4000-0000',
  endereco: 'Av. Industrial, 1000 - São Paulo/SP'
});

const localId = insert('locais', {
  cliente_id: clienteId,
  nome: 'Planta Principal',
  endereco: 'Av. Industrial, 1000 - Galpão 3',
  cidade: 'São Paulo',
  estado: 'SP',
  cep: '01000-000',
  latitude: -23.5505,
  longitude: -46.6333,
  responsavel_nome: 'Carlos Souza',
  responsavel_email: 'carlos.souza@medicalthermo.com',
  responsavel_telefone: '(11) 99999-0001'
});

const cliente2Id = insert('clientes', {
  nome: 'Hospital Santa Helena',
  documento: '22.222.222/0001-22',
  email: 'contato@hospitalsantahelena.com',
  telefone: '(31) 3000-0000',
  endereco: 'Av. Afonso Pena, 2000 - Belo Horizonte/MG'
});

const local2Id = insert('locais', {
  cliente_id: cliente2Id,
  nome: 'Unidade Matriz',
  endereco: 'Av. Afonso Pena, 2000 - Ala Sul',
  cidade: 'Belo Horizonte',
  estado: 'MG',
  cep: '30130-002',
  latitude: -19.9245,
  longitude: -43.9352,
  responsavel_nome: 'Marina Alves',
  responsavel_email: 'marina.alves@hospitalsantahelena.com',
  responsavel_telefone: '(31) 98888-0002'
});

insert('equipamentos', {
  cliente_id: cliente2Id,
  local_id: local2Id,
  nome: 'Câmara Frigorífica HF-500',
  modelo: 'HF-500',
  fabricante: 'Herzog',
  numero_serie: 'HF500-000456',
  data_instalacao: '2024-07-22',
  garantia_ate: '2027-07-22'
});

const equipamentoId = insert('equipamentos', {
  cliente_id: clienteId,
  local_id: localId,
  nome: 'Caldeira Industrial MT-2000',
  modelo: 'MT-2000',
  fabricante: 'Herzog',
  numero_serie: 'MT2000-000123',
  data_instalacao: '2024-03-10',
  garantia_ate: '2027-03-10'
});

const osId = insert('ordens_servico', {
  numero: 'OS-0001',
  cliente_id: clienteId,
  local_id: localId,
  responsavel_local: 'Carlos Souza',
  equipamento_id: equipamentoId,
  servico: 'Manutenção preventiva',
  descricao: 'Inspeção completa e manutenção preventiva da caldeira MT-2000.',
  prioridade: 'media',
  data_agendada: '2026-08-15',
  hora_inicio: '08:00',
  hora_fim: '11:00',
  equipe_id: equipeNorte,
  status: 'pendente',
  criada_por: gestorId
});

insert('atividades', {
  titulo: 'Visita técnica - avaliação da planta',
  tipo: 'visita_tecnica',
  cliente_id: clienteId,
  local_id: localId,
  responsavel: 'Carlos Souza',
  equipe_id: equipeNorte,
  tecnico_id: tecnico2Id,
  data: '2026-08-19',
  hora_inicio: '14:00',
  hora_fim: '16:00',
  observacoes: 'Avaliar condições gerais do galpão 3.',
  status: 'agendada',
  criado_por: gestorId
});

insert('atividades', {
  titulo: 'Inspeção complementar da caldeira',
  tipo: 'inspecao',
  os_id: osId,
  cliente_id: clienteId,
  local_id: localId,
  equipe_id: equipeNorte,
  tecnico_id: tecnicoId,
  data: '2026-08-21',
  hora_inicio: '09:00',
  hora_fim: '10:30',
  observacoes: 'Atividade vinculada à OS-0001.',
  status: 'confirmada',
  criado_por: gestorId
});

console.log('Seed concluído.');
console.log('Logins:');
console.log('  admin@field.com / admin123 (Administrador)');
console.log('  gestor@field.com / gestor123 (Gestor)');
console.log('  tecnico@field.com / tecnico123 (Técnico - Equipe Norte)');
console.log('  tecnico2@field.com / tecnico123 (Técnico 2 - Equipe Norte)');
console.log('  tecnico.leste@field.com / tecnico123 (Técnico Leste - Equipe Leste)');
console.log('  comercial@field.com / comercial123 (Comercial)');
