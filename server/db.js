const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('./config');

fs.mkdirSync(path.dirname(config.DB_PATH), { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

function colunasDaTabela(nome) {
  return db.prepare(`PRAGMA table_info(${nome})`).all().map((c) => c.name);
}

const colunasLocais = colunasDaTabela('locais');
for (const col of ['cidade', 'estado', 'cep', 'latitude', 'longitude']) {
  if (!colunasLocais.includes(col)) {
    db.prepare(`ALTER TABLE locais ADD COLUMN ${col} ${col === 'latitude' || col === 'longitude' ? 'REAL' : 'TEXT'}`).run();
  }
}

const colunasOs = colunasDaTabela('ordens_servico');
for (const col of ['hora_inicio', 'hora_fim', 'confirmada']) {
  if (!colunasOs.includes(col)) {
    db.prepare(`ALTER TABLE ordens_servico ADD COLUMN ${col} ${col === 'confirmada' ? 'INTEGER NOT NULL DEFAULT 0' : 'TEXT'}`).run();
  }
}
if (!colunasOs.includes('tipo_atendimento')) {
  db.prepare("ALTER TABLE ordens_servico ADD COLUMN tipo_atendimento TEXT").run();
}

const sqlOs = sqlTabela('ordens_servico');
if (sqlOs && !sqlOs.includes('excluida')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE ordens_servico_nova (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT NOT NULL UNIQUE,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      local_id INTEGER REFERENCES locais(id) ON DELETE SET NULL,
      responsavel_local TEXT,
      equipamento_id INTEGER REFERENCES equipamentos(id) ON DELETE SET NULL,
      servico TEXT NOT NULL,
      descricao TEXT,
      prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
      data_agendada TEXT,
      hora_inicio TEXT,
      hora_fim TEXT,
      confirmada INTEGER NOT NULL DEFAULT 0,
      equipe_id INTEGER REFERENCES equipes(id) ON DELETE SET NULL,
      tecnico_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'em_deslocamento', 'em_andamento', 'aguardando_validacao', 'concluida', 'cancelada', 'excluida')),
      tipo_atendimento TEXT,
      criada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO ordens_servico_nova (id, numero, cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
      prioridade, data_agendada, hora_inicio, hora_fim, confirmada, equipe_id, tecnico_id, status, tipo_atendimento,
      criada_por, criado_em)
      SELECT id, numero, cliente_id, local_id, responsavel_local, equipamento_id, servico, descricao,
        prioridade, data_agendada, hora_inicio, hora_fim, confirmada, equipe_id, tecnico_id, status, tipo_atendimento,
        criada_por, criado_em
      FROM ordens_servico;
    DROP TABLE ordens_servico;
    ALTER TABLE ordens_servico_nova RENAME TO ordens_servico;
    CREATE INDEX IF NOT EXISTS idx_os_tecnico ON ordens_servico(tecnico_id);
    CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
    CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico(cliente_id);
  `);
  db.pragma('foreign_keys = ON');
}

const colunasExec = colunasDaTabela('execucoes');
for (const col of ['necessidade_adicional', 'complemento_solicitado', 'dados_modelo']) {
  if (!colunasExec.includes(col)) {
    db.prepare(`ALTER TABLE execucoes ADD COLUMN ${col} ${col === 'necessidade_adicional' ? "TEXT NOT NULL DEFAULT 'nao'" : 'TEXT'}`).run();
  }
}
if (!colunasExec.includes('concluida_por')) {
  db.prepare('ALTER TABLE execucoes ADD COLUMN concluida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL').run();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios_equipes (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, equipe_id)
  );
  CREATE INDEX IF NOT EXISTS idx_ue_usuario ON usuarios_equipes(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_ue_equipe ON usuarios_equipes(equipe_id);
`);

db.prepare(
  'INSERT OR IGNORE INTO usuarios_equipes (usuario_id, equipe_id) SELECT id, equipe_id FROM usuarios WHERE equipe_id IS NOT NULL'
).run();

const colunasRel = colunasDaTabela('relatorios');
for (const col of ['enviado_comercial_em', 'aberto_por', 'aberto_em', 'complemento_motivo', 'conteudo']) {
  if (!colunasRel.includes(col)) {
    db.prepare(`ALTER TABLE relatorios ADD COLUMN ${col} ${col === 'aberto_por' ? 'INTEGER' : 'TEXT'}`).run();
  }
}

const colunasEquip = colunasDaTabela('equipamentos');
for (const col of ['capacidade', 'patrimonio']) {
  if (!colunasEquip.includes(col)) {
    db.prepare(`ALTER TABLE equipamentos ADD COLUMN ${col} TEXT`).run();
  }
}

const colunasEquip2 = colunasDaTabela('equipamentos');
for (const col of ['codigo_mt', 'tipo', 'gas_refrigerante', 'tensao', 'local', 'ambiente', 'observacoes', 'status']) {
  if (!colunasEquip2.includes(col)) {
    db.prepare(`ALTER TABLE equipamentos ADD COLUMN ${col} ${col === 'status' ? "TEXT NOT NULL DEFAULT 'operando'" : 'TEXT'}`).run();
  }
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_equip_mt ON equipamentos(codigo_mt)`);

const backfillMT = db.transaction(() => {
  const semCodigo = db.prepare("SELECT id FROM equipamentos WHERE codigo_mt IS NULL OR codigo_mt = '' ORDER BY id").all();
  if (semCodigo.length === 0) return;
  const maior = db
    .prepare("SELECT codigo_mt FROM equipamentos WHERE codigo_mt LIKE 'MT-%' ORDER BY CAST(substr(codigo_mt, 4) AS INTEGER) DESC LIMIT 1")
    .get();
  let n = maior ? parseInt(maior.codigo_mt.slice(3), 10) : 0;
  for (const e of semCodigo) {
    n += 1;
    db.prepare("UPDATE equipamentos SET codigo_mt = ? WHERE id = ?").run(`MT-${String(n).padStart(3, '0')}`, e.id);
  }
});
backfillMT();

const colunasExec2 = colunasDaTabela('execucoes');
const colunasExecNova = [
  'condicao_sintomas', 'condicao_equipamento', 'condicao_observacoes', 'causa',
  'medicoes', 'atividades_executadas', 'resultado', 'pendencias', 'recomendacoes',
  'assinatura_nome', 'assinatura_cargo', 'assinaturas', 'relatorio_ia', 'necessidade_descricao'
];
for (const col of colunasExecNova) {
  if (!colunasExec2.includes(col)) {
    db.prepare(`ALTER TABLE execucoes ADD COLUMN ${col} TEXT`).run();
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS anexos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    os_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL DEFAULT 'outros'
      CHECK (categoria IN ('antes', 'durante', 'depois', 'defeito', 'equipamento', 'documento', 'outros')),
    arquivo TEXT NOT NULL,
    nome_original TEXT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_anexos_os ON anexos(os_id);
`);

function sqlTabela(nome) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
  return row ? row.sql : '';
}

const migrarOportunidades = db.transaction(() => {
  const colunasOp = colunasDaTabela('oportunidades');
  if (!colunasOp.includes('tipo')) {
    db.exec(`
      CREATE TABLE oportunidades_nova (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        relatorio_id INTEGER NOT NULL REFERENCES relatorios(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL DEFAULT 'outro_servico',
        descricao TEXT NOT NULL,
        valor_estimado REAL,
        status TEXT NOT NULL DEFAULT 'novo'
          CHECK (status IN ('novo', 'em_analise', 'necessita_contato', 'necessita_informacao',
            'proposta_elaboracao', 'proposta_enviada', 'em_negociacao', 'aprovado', 'perdido', 'sem_oportunidade')),
        responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        data_contato TEXT,
        resultado_contato TEXT,
        proposta_vinculada TEXT,
        previsao_fechamento TEXT,
        criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO oportunidades_nova (id, relatorio_id, descricao, valor_estimado, status, criado_em)
        SELECT id, relatorio_id, descricao, valor_estimado,
          CASE status WHEN 'aberta' THEN 'em_analise' WHEN 'em_andamento' THEN 'em_negociacao'
                      WHEN 'ganha' THEN 'aprovado' WHEN 'perdida' THEN 'perdido' ELSE 'em_analise' END,
          criado_em
        FROM oportunidades;
      DROP TABLE oportunidades;
      ALTER TABLE oportunidades_nova RENAME TO oportunidades;
    `);
  }
});

const migrarHistorico = db.transaction(() => {
  const sql = sqlTabela('historico');
  if (sql && !sql.includes('oportunidade')) {
    db.exec(`
      CREATE TABLE historico_nova (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        usuario_nome TEXT,
        tipo TEXT NOT NULL CHECK (tipo IN ('os', 'atividade', 'relatorio', 'oportunidade', 'execucao', 'km', 'veiculo')),
        registro_id INTEGER NOT NULL,
        campo TEXT NOT NULL,
        valor_anterior TEXT,
        valor_novo TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO historico_nova (id, usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo, criado_em)
        SELECT id, usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo, criado_em FROM historico;
      DROP TABLE historico;
      ALTER TABLE historico_nova RENAME TO historico;
      CREATE INDEX IF NOT EXISTS idx_hist_registro ON historico(tipo, registro_id);
    `);
  } else if (sql && !sql.includes("'km'")) {
    db.exec(`
      CREATE TABLE historico_nova (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        usuario_nome TEXT,
        tipo TEXT NOT NULL CHECK (tipo IN ('os', 'atividade', 'relatorio', 'oportunidade', 'execucao', 'km', 'veiculo')),
        registro_id INTEGER NOT NULL,
        campo TEXT NOT NULL,
        valor_anterior TEXT,
        valor_novo TEXT,
        criado_em TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO historico_nova (id, usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo, criado_em)
        SELECT id, usuario_id, usuario_nome, tipo, registro_id, campo, valor_anterior, valor_novo, criado_em FROM historico;
      DROP TABLE historico;
      ALTER TABLE historico_nova RENAME TO historico;
      CREATE INDEX IF NOT EXISTS idx_hist_registro ON historico(tipo, registro_id);
    `);
  }
});

db.exec(`
  CREATE TABLE IF NOT EXISTS veiculos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    placa TEXT NOT NULL UNIQUE,
    descricao TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS registros_km (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipe_id INTEGER NOT NULL REFERENCES equipes(id),
    veiculo_id INTEGER NOT NULL REFERENCES veiculos(id),
    motorista_id INTEGER NOT NULL REFERENCES usuarios(id),
    os_id INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL,
    data TEXT NOT NULL,
    data_hora_inicio TEXT NOT NULL,
    km_inicial INTEGER NOT NULL,
    local_inicial TEXT NOT NULL,
    data_hora_fim TEXT,
    km_final INTEGER,
    local_final TEXT,
    km_percorrido INTEGER,
    observacao TEXT,
    status TEXT NOT NULL DEFAULT 'em_utilizacao' CHECK (status IN ('em_utilizacao', 'finalizado')),
    iniciado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    finalizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_regkm_equipe ON registros_km(equipe_id);
  CREATE INDEX IF NOT EXISTS idx_regkm_veiculo ON registros_km(veiculo_id);
  CREATE INDEX IF NOT EXISTS idx_regkm_data ON registros_km(data);
  CREATE INDEX IF NOT EXISTS idx_regkm_status ON registros_km(status);
  CREATE INDEX IF NOT EXISTS idx_regkm_motorista ON registros_km(motorista_id);
`);

migrarOportunidades();
migrarHistorico();

const migrarRegistrosKm = db.transaction(() => {
  const colunas = colunasDaTabela('registros_km');
  if (colunas.includes('motorista_nome')) return;
  db.exec(`
    CREATE TABLE registros_km_nova (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipe_id INTEGER NOT NULL REFERENCES equipes(id),
      veiculo_id INTEGER NOT NULL REFERENCES veiculos(id),
      motorista_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      motorista_nome TEXT,
      os_id INTEGER REFERENCES ordens_servico(id) ON DELETE SET NULL,
      data TEXT NOT NULL,
      data_hora_inicio TEXT NOT NULL,
      km_inicial INTEGER NOT NULL,
      local_inicial TEXT NOT NULL,
      data_hora_fim TEXT,
      km_final INTEGER,
      local_final TEXT,
      km_percorrido INTEGER,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'em_utilizacao' CHECK (status IN ('em_utilizacao', 'finalizado')),
      iniciado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      finalizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO registros_km_nova (id, equipe_id, veiculo_id, motorista_id, os_id, data, data_hora_inicio, km_inicial, local_inicial, data_hora_fim, km_final, local_final, km_percorrido, observacao, status, iniciado_por, finalizado_por, criado_em)
      SELECT id, equipe_id, veiculo_id, motorista_id, os_id, data, data_hora_inicio, km_inicial, local_inicial, data_hora_fim, km_final, local_final, km_percorrido, observacao, status, iniciado_por, finalizado_por, criado_em FROM registros_km;
    DROP TABLE registros_km;
    ALTER TABLE registros_km_nova RENAME TO registros_km;
    CREATE INDEX IF NOT EXISTS idx_regkm_equipe ON registros_km(equipe_id);
    CREATE INDEX IF NOT EXISTS idx_regkm_veiculo ON registros_km(veiculo_id);
    CREATE INDEX IF NOT EXISTS idx_regkm_data ON registros_km(data);
    CREATE INDEX IF NOT EXISTS idx_regkm_status ON registros_km(status);
    CREATE INDEX IF NOT EXISTS idx_regkm_motorista ON registros_km(motorista_id);
  `);
});
migrarRegistrosKm();

module.exports = db;
