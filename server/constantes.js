const TIPOS_NECESSIDADE = {
  nao: 'Não',
  nova_manutencao: 'Sim — nova manutenção',
  substituicao_equipamento: 'Sim — substituição de equipamento',
  fornecimento_peca: 'Sim — fornecimento de peça',
  instalacao: 'Sim — instalação',
  adequacao: 'Sim — adequação',
  outro_servico: 'Sim — outro serviço'
};

const STATUS_OPORTUNIDADE = [
  'novo',
  'em_analise',
  'necessita_contato',
  'necessita_informacao',
  'proposta_elaboracao',
  'proposta_enviada',
  'em_negociacao',
  'aprovado',
  'perdido',
  'sem_oportunidade'
];

const STATUS_OPORTUNIDADE_LABEL = {
  novo: 'Novo relatório',
  em_analise: 'Em análise',
  necessita_contato: 'Necessita contato',
  necessita_informacao: 'Necessita informação adicional',
  proposta_elaboracao: 'Proposta em elaboração',
  proposta_enviada: 'Proposta enviada',
  em_negociacao: 'Em negociação',
  aprovado: 'Aprovado',
  perdido: 'Perdido',
  sem_oportunidade: 'Sem oportunidade'
};

module.exports = { TIPOS_NECESSIDADE, STATUS_OPORTUNIDADE, STATUS_OPORTUNIDADE_LABEL };