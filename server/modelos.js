const MODELOS = {
  instalacao: {
    rotulo: 'Instalação',
    campos: [
      { chave: 'descricao_instalacao', rotulo: 'Descrição da instalação', tipo: 'textarea', obrigatorio: true },
      { chave: 'infra_tubulacao', rotulo: 'Infraestrutura executada — Tubulação', tipo: 'text' },
      { chave: 'infra_dreno', rotulo: 'Infraestrutura executada — Dreno', tipo: 'text' },
      { chave: 'infra_eletrica', rotulo: 'Infraestrutura executada — Interligação elétrica', tipo: 'text' },
      { chave: 'testes_realizados', rotulo: 'Testes realizados', tipo: 'textarea', obrigatorio: true },
      {
        chave: 'resultado_instalacao', rotulo: 'Resultado da instalação', tipo: 'select', obrigatorio: true,
        opcoes: [
          { v: 'concluida', l: 'Instalação concluída' },
          { v: 'parcial', l: 'Instalação parcial' },
          { v: 'nao_concluida', l: 'Não concluída' }
        ]
      }
    ]
  },
  preventiva: {
    rotulo: 'Manutenção Preventiva',
    campos: [
      { chave: 'descricao_servico', rotulo: 'Descrição do serviço realizado', tipo: 'textarea', obrigatorio: true },
      { chave: 'atividades_realizadas', rotulo: 'Atividades realizadas', tipo: 'textarea', obrigatorio: true },
      { chave: 'condicao_equipamento', rotulo: 'Condição do equipamento', tipo: 'textarea' },
      {
        chave: 'resultado', rotulo: 'Resultado', tipo: 'select',
        opcoes: [
          { v: 'funcionando', l: 'Equipamento funcionando normalmente' },
          { v: 'com_restricao', l: 'Funcionando com restrição' },
          { v: 'indisponivel', l: 'Equipamento indisponível' },
          { v: 'necessita_retorno', l: 'Necessita retorno' },
          { v: 'necessita_orcamento', l: 'Necessita orçamento' }
        ]
      },
      { chave: 'recomendacoes', rotulo: 'Observações / recomendações', tipo: 'textarea' }
    ]
  },
  corretiva: {
    rotulo: 'Levantamento de Corretiva',
    campos: [
      { chave: 'problema_relatado', rotulo: 'Problema relatado', tipo: 'textarea', obrigatorio: true },
      { chave: 'condicao_encontrada', rotulo: 'Condição encontrada', tipo: 'textarea' },
      { chave: 'diagnostico', rotulo: 'Diagnóstico / constatação', tipo: 'textarea', obrigatorio: true },
      { chave: 'necessidade_identificada', rotulo: 'Necessidade identificada', tipo: 'textarea' },
      { chave: 'recomendacoes', rotulo: 'Recomendação', tipo: 'textarea' },
      {
        chave: 'necessidade_orcamento', rotulo: 'Necessidade de orçamento', tipo: 'select',
        opcoes: [
          { v: 'sim', l: 'Sim' },
          { v: 'nao', l: 'Não' }
        ]
      }
    ]
  },
  pmoc: {
    rotulo: 'Levantamento PMOC',
    campos: [
      {
        chave: 'condicao_geral', rotulo: 'Condição geral', tipo: 'select', obrigatorio: true,
        opcoes: [
          { v: 'boa', l: 'Boa' },
          { v: 'regular', l: 'Regular' },
          { v: 'ruim', l: 'Ruim' },
          { v: 'critica', l: 'Crítica' }
        ]
      },
      { chave: 'estado_conservacao', rotulo: 'Estado de conservação', tipo: 'textarea', obrigatorio: true },
      { chave: 'recomendacoes', rotulo: 'Recomendações', tipo: 'textarea' }
    ]
  }
};

function getModelo(tipo) {
  return MODELOS[tipo] || null;
}

function rotuloCampo(tipo, chave) {
  const modelo = getModelo(tipo);
  if (!modelo) return chave;
  const campo = modelo.campos.find((c) => c.chave === chave);
  return campo ? campo.rotulo : chave;
}

function valorRotulo(tipo, chave, valor) {
  const modelo = getModelo(tipo);
  if (!modelo || valor === undefined || valor === null || valor === '') return valor;
  const campo = modelo.campos.find((c) => c.chave === chave);
  if (campo && campo.tipo === 'select' && campo.opcoes) {
    const opcao = campo.opcoes.find((o) => o.v === valor);
    return opcao ? opcao.l : valor;
  }
  return valor;
}

function camposPreenchidos(tipo, dados) {
  const modelo = getModelo(tipo);
  if (!modelo || !dados || typeof dados !== 'object') return [];
  return modelo.campos
    .map((c) => {
      const v = dados[c.chave];
      if (v === undefined || v === null || String(v).trim() === '') return null;
      return { chave: c.chave, rotulo: c.rotulo, valor: String(v).trim() };
    })
    .filter(Boolean);
}

function camposObrigatoriosFaltando(tipo, dados) {
  const modelo = getModelo(tipo);
  if (!modelo) return [];
  const faltando = [];
  for (const c of modelo.campos) {
    if (!c.obrigatorio) continue;
    const v = dados && dados[c.chave];
    if (v === undefined || v === null || String(v).trim() === '') faltando.push(c.rotulo);
  }
  return faltando;
}

module.exports = { MODELOS, getModelo, rotuloCampo, valorRotulo, camposPreenchidos, camposObrigatoriosFaltando };
