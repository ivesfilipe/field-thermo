PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS equipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'gestor', 'tecnico', 'comercial')),
  equipe_id INTEGER REFERENCES equipes(id) ON DELETE SET NULL,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuarios_equipes (
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  equipe_id INTEGER NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, equipe_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  documento TEXT,
  email TEXT,
  telefone TEXT,
  endereco TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  cep TEXT,
  latitude REAL,
  longitude REAL,
  responsavel_nome TEXT,
  responsavel_email TEXT,
  responsavel_telefone TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS equipamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  local_id INTEGER REFERENCES locais(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  modelo TEXT,
  fabricante TEXT,
  numero_serie TEXT,
  capacidade TEXT,
  patrimonio TEXT,
  data_instalacao TEXT,
  garantia_ate TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordens_servico (
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
  criada_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execucoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL UNIQUE REFERENCES ordens_servico(id) ON DELETE CASCADE,
  tecnico_id INTEGER NOT NULL REFERENCES usuarios(id),
  concluida_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  condicao_sintomas TEXT,
  condicao_equipamento TEXT,
  condicao_observacoes TEXT,
  diagnostico TEXT,
  causa TEXT,
  medicoes TEXT,
  servico_executado TEXT,
  atividades_executadas TEXT,
  resultado TEXT,
  pendencias TEXT,
  recomendacoes TEXT,
  observacoes TEXT,
  fotos TEXT,
  assinatura TEXT,
  assinatura_nome TEXT,
  assinatura_cargo TEXT,
  assinaturas TEXT,
  relatorio_ia TEXT,
  iniciada_em TEXT,
  concluida_em TEXT,
  necessidade_adicional TEXT NOT NULL DEFAULT 'nao'
    CHECK (necessidade_adicional IN ('nao', 'nova_manutencao', 'substituicao_equipamento', 'fornecimento_peca', 'instalacao', 'adequacao', 'outro_servico')),
  necessidade_descricao TEXT,
  complemento_solicitado TEXT
);

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

CREATE TABLE IF NOT EXISTS relatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL UNIQUE REFERENCES ordens_servico(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'reprovado')),
  validado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  data_validacao TEXT,
  recomendacoes TEXT,
  conteudo TEXT,
  enviado_comercial INTEGER NOT NULL DEFAULT 0,
  enviado_comercial_em TEXT,
  aberto_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  aberto_em TEXT,
  complemento_motivo TEXT, token TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oportunidades (
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

CREATE TABLE IF NOT EXISTS atividades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'outro'
    CHECK (tipo IN ('visita_tecnica', 'levantamento', 'inspecao', 'reuniao', 'retorno_cliente', 'preventiva', 'acompanhamento', 'outro')),
  os_id INTEGER REFERENCES ordens_servico(id) ON DELETE CASCADE,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  local_id INTEGER REFERENCES locais(id) ON DELETE SET NULL,
  responsavel TEXT,
  equipe_id INTEGER REFERENCES equipes(id) ON DELETE SET NULL,
  tecnico_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  data TEXT,
  hora_inicio TEXT,
  hora_fim TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada', 'confirmada', 'em_andamento', 'aguardando_validacao', 'concluida', 'reaberta', 'cancelada')),
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS historico (
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

CREATE TABLE IF NOT EXISTS avaliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id INTEGER NOT NULL UNIQUE REFERENCES ordens_servico(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'respondida')),
  nota INTEGER CHECK (nota BETWEEN 1 AND 5),
  resolveu_necessidade TEXT CHECK (resolveu_necessidade IN ('sim', 'parcialmente', 'nao')),
  comentario TEXT,
  respondida_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_os ON avaliacoes(os_id);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_status ON avaliacoes(status);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_token ON avaliacoes(token);
CREATE INDEX IF NOT EXISTS idx_usuarios_equipe ON usuarios(equipe_id);
CREATE INDEX IF NOT EXISTS idx_ue_usuario ON usuarios_equipes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ue_equipe ON usuarios_equipes(equipe_id);
CREATE INDEX IF NOT EXISTS idx_os_tecnico ON ordens_servico(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_os_status ON ordens_servico(status);
CREATE INDEX IF NOT EXISTS idx_os_cliente ON ordens_servico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_equip_cliente ON equipamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_atv_tecnico ON atividades(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_atv_os ON atividades(os_id);
CREATE INDEX IF NOT EXISTS idx_atv_data ON atividades(data);
CREATE INDEX IF NOT EXISTS idx_hist_registro ON historico(tipo, registro_id);
CREATE INDEX IF NOT EXISTS idx_anexos_os ON anexos(os_id);
CREATE INDEX IF NOT EXISTS idx_regkm_equipe ON registros_km(equipe_id);
CREATE INDEX IF NOT EXISTS idx_regkm_veiculo ON registros_km(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_regkm_data ON registros_km(data);
CREATE INDEX IF NOT EXISTS idx_regkm_status ON registros_km(status);
CREATE INDEX IF NOT EXISTS idx_regkm_motorista ON registros_km(motorista_id);
