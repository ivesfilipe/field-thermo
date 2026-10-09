const RESULTADOS = {
  funcionando: 'Equipamento funcionando normalmente',
  com_restricao: 'Funcionando com restrição',
  indisponivel: 'Equipamento indisponível',
  necessita_retorno: 'Necessita retorno',
  necessita_orcamento: 'Necessita orçamento'
};

const CATEGORIA_ANEXO = {
  antes: 'Antes do atendimento',
  durante: 'Durante o atendimento',
  depois: 'Depois do atendimento',
  defeito: 'Defeito / evidência',
  equipamento: 'Equipamento',
  documento: 'Documento',
  outros: 'Outros'
};

function texto(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function naoRegistrado(v) {
  return !texto(v) || v === 'Não registrado';
}

function capitalizar(t) {
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function gerarSugestaoMedicoes(servico) {
  const s = texto(servico).toLowerCase();
  const sugestoes = [];
  const add = (tipo, unidade) => {
    if (!sugestoes.some((x) => x.tipo === tipo)) sugestoes.push({ tipo, unidade, valor: '', observacao: '' });
  };
  if (/ar.condicionado|climatiza|split|condensadora|evaporadora|refrigera/.test(s)) {
    add('Pressão de baixa', 'psi');
    add('Pressão de alta', 'psi');
    add('Temperatura do ar na saída', '°C');
    add('Corrente elétrica', 'A');
  }
  if (/geladeira|refrigerador|freezer|camara|frigorifica|refrigera/.test(s)) {
    add('Temperatura interna', '°C');
    add('Temperatura do condensador', '°C');
    add('Corrente do compressor', 'A');
  }
  if (/eletric|elétrica|painel|motor|disjuntor|instala/.test(s)) {
    add('Tensão', 'V');
    add('Corrente', 'A');
  }
  if (/caldeira|aquecedor|calor|temperatura|termo/.test(s)) {
    add('Temperatura de operação', '°C');
    add('Pressão de operação', 'bar');
  }
  return sugestoes;
}

function identificarLacunas(os, execucao, anexos) {
  const lacunas = [];
  if (naoRegistrado(execucao.condicao_sintomas)) lacunas.push('Sintomas observados não registrados');
  if (naoRegistrado(execucao.condicao_equipamento)) lacunas.push('Condição do equipamento não registrada');
  if (naoRegistrado(execucao.diagnostico)) lacunas.push('Diagnóstico técnico não registrado');
  if (naoRegistrado(execucao.causa)) lacunas.push('Causa identificada/provável não registrada');
  const atividades = safeJson(execucao.atividades_executadas);
  if (!atividades.length) lacunas.push('Nenhuma atividade executada registrada');
  if (atividades.some((a) => !texto(a.titulo))) lacunas.push('Há atividades sem descrição');
  if (naoRegistrado(execucao.resultado)) lacunas.push('Resultado do atendimento não registrado');
  if (!anexos || !anexos.length) lacunas.push('Nenhuma foto ou anexo vinculado');
  if (naoRegistrado(execucao.assinatura_nome)) lacunas.push('Nome do responsável pela assinatura não registrado');
  if (naoRegistrado(execucao.assinatura)) lacunas.push('Assinatura não registrada');
  if (naoRegistrado(os.servico)) lacunas.push('Serviço solicitado não registrado');
  if (naoRegistrado(os.descricao)) lacunas.push('Descrição inicial da demanda não registrada');
  if (execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao' && naoRegistrado(execucao.necessidade_descricao)) {
    lacunas.push('Descrição da necessidade adicional identificada não registrada');
  }
  return lacunas;
}

function safeJson(v) {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

function safeJsonObj(v) {
  if (!v) return {};
  try {
    const p = JSON.parse(v);
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

function montarSecaoModelo(os, execucao) {
  const { getModelo, camposPreenchidos } = require('./modelos');
  const modelo = getModelo(os.tipo_atendimento);
  if (!modelo) return null;
  const dados = safeJsonObj(execucao.dados_modelo);
  const preenchidos = camposPreenchidos(os.tipo_atendimento, dados);
  if (!preenchidos.length) return null;
  return {
    tipo: modelo.rotulo,
    campos: preenchidos.map((c) => `${c.rotulo}: ${c.valor}`)
  };
}

function gerarRelatorioIA({ os, execucao, anexos }) {
  const atividades = safeJson(execucao.atividades_executadas);
  const medicoes = safeJson(execucao.medicoes);
  const categorias = { antes: [], durante: [], depois: [], defeito: [], equipamento: [], documento: [], outros: [] };
  for (const a of anexos || []) {
    (categorias[a.categoria] || categorias.outros).push(a);
  }

  const condicao = [];
  if (texto(execucao.condicao_sintomas)) condicao.push(`Sintomas observados: ${capitalizar(execucao.condicao_sintomas)}`);
  if (texto(execucao.condicao_equipamento)) condicao.push(`Condição do equipamento: ${capitalizar(execucao.condicao_equipamento)}`);
  if (texto(execucao.condicao_observacoes)) condicao.push(`Observações: ${capitalizar(execucao.condicao_observacoes)}`);

  const diagnostico = [];
  if (texto(execucao.diagnostico)) diagnostico.push(capitalizar(execucao.diagnostico));
  if (texto(execucao.causa)) diagnostico.push(`Causa identificada ou provável: ${capitalizar(execucao.causa)}`);
  if (medicoes.length) {
    const linhas = medicoes
      .filter((m) => texto(m.tipo) || texto(m.valor))
      .map((m) => {
        const base = m.tipo ? m.tipo : 'Medição';
        const v = texto(m.valor) ? `${m.valor}${texto(m.unidade) ? ' ' + m.unidade : ''}` : 'valor não registrado';
        return `${base}: ${v}${texto(m.observacao) ? ` (${m.observacao})` : ''}`;
      });
    if (linhas.length) diagnostico.push(`Medições realizadas — ${linhas.join('; ')}.`);
  }

  const atividadesLinhas = atividades
    .filter((a) => texto(a.titulo))
    .map((a) => {
      const base = capitalizar(a.titulo);
      if (texto(a.resultado)) return `${base} — ${capitalizar(a.resultado)}${texto(a.observacao) ? `. Observação: ${a.observacao}` : ''}.`;
      return `${base}${texto(a.observacao) ? ` — ${a.observacao}` : ''}.`;
    });

  const anexosPorCategoria = Object.entries(categorias)
    .filter(([, lista]) => lista.length)
    .map(([cat, lista]) => `${CATEGORIA_ANEXO[cat]} (${lista.length})`);

  const oportunidade = execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao'
    ? {
        tipo: execucao.necessidade_adicional,
        descricao: texto(execucao.necessidade_descricao) || 'Necessidade adicional identificada pelo técnico.',
        base: 'Gerada a partir da necessidade adicional registrada na execução.'
      }
    : null;

  const lacunas = identificarLacunas(os, execucao, anexos);

  const modelo = montarSecaoModelo(os, execucao);
  const { camposObrigatoriosFaltando } = require('./modelos');
  const faltandoModelo = camposObrigatoriosFaltando(os.tipo_atendimento, safeJsonObj(execucao.dados_modelo));
  for (const f of faltandoModelo) {
    lacunas.push(`${f} não registrado`);
  }

  const conteudo = {
    cabecalho: 'FIELD 2.0 — Relatório Técnico de Atendimento',
    tipo_atendimento: os.tipo_atendimento ? (require('./modelos').getModelo(os.tipo_atendimento) || {}).rotulo : null,
    identificacao: {
      os: os.numero,
      cliente: os.cliente_nome,
      local: os.local_nome,
      responsavel_local: os.responsavel_local || os.local_responsavel,
      equipamento: os.equipamento_nome,
      modelo: os.equipamento_modelo,
      capacidade: os.equipamento_capacidade,
      patrimonio: os.equipamento_patrimonio
    },
    solicitacao: {
      servico: os.servico,
      descricao: os.descricao,
      prioridade: os.prioridade,
      data_agendada: os.data_agendada,
      tecnico: os.tecnico_nome
    },
    condicao_encontrada: condicao,
    diagnostico_tecnico: diagnostico,
    modelo: modelo,
    atividades_executadas: atividadesLinhas,
    resultado: execucao.resultado ? RESULTADOS[execucao.resultado] || execucao.resultado : null,
    pendencias: texto(execucao.pendencias) ? capitalizar(execucao.pendencias) : null,
    recomendacoes: texto(execucao.recomendacoes) ? capitalizar(execucao.recomendacoes) : null,
    evidencia_fotografica: anexosPorCategoria,
    necessidade_adicional: execucao.necessidade_adicional && execucao.necessidade_adicional !== 'nao'
      ? {
          tipo: execucao.necessidade_adicional,
          descricao: texto(execucao.necessidade_descricao) || null
        }
      : null,
    assinatura: {
      nome: execucao.assinatura_nome,
      cargo: execucao.assinatura_cargo,
      data_hora: execucao.concluida_em
    },
    tecnico: os.tecnico_nome,
    lacunas,
    oportunidade,
    observacao_ia: 'Relatório organizado pela assistente FIELD/IA a partir dos dados registrados. Nenhuma informação foi criada pela IA: medições, diagnóstico, peças e procedimentos refletem somente o que foi registrado. Dados ausentes são indicados como lacunas.'
  };

  return { conteudo, lacunas, oportunidade };
}

function formatarParaVisualizacao(conteudo) {
  const linhas = [];
  const titulo = (t) => `\n## ${t}`;
  const item = (r, v) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      if (!v.length) return;
      linhas.push(titulo(r));
      v.forEach((x) => linhas.push(`- ${x}`));
      return;
    }
    linhas.push(titulo(r));
    linhas.push(String(v));
  };

  linhas.push(`# ${conteudo.cabecalho}`);
  linhas.push(`OS: ${conteudo.identificacao.os}`);
  item('Identificação', [
    `Cliente: ${conteudo.identificacao.cliente}`,
    conteudo.identificacao.local ? `Local: ${conteudo.identificacao.local}` : null,
    conteudo.identificacao.responsavel_local ? `Responsável: ${conteudo.identificacao.responsavel_local}` : null,
    conteudo.identificacao.equipamento ? `Equipamento: ${conteudo.identificacao.equipamento}` : null,
    conteudo.identificacao.modelo ? `Modelo: ${conteudo.identificacao.modelo}` : null,
    conteudo.identificacao.capacidade ? `Capacidade: ${conteudo.identificacao.capacidade}` : null,
    conteudo.identificacao.patrimonio ? `Patrimônio: ${conteudo.identificacao.patrimonio}` : null
  ].filter(Boolean));
  item('Solicitação original', [
    conteudo.solicitacao.servico ? `Serviço solicitado: ${conteudo.solicitacao.servico}` : null,
    conteudo.solicitacao.descricao ? `Descrição da demanda: ${conteudo.solicitacao.descricao}` : null,
    conteudo.solicitacao.prioridade ? `Prioridade: ${conteudo.solicitacao.prioridade}` : null,
    conteudo.solicitacao.data_agendada ? `Agendado para: ${conteudo.solicitacao.data_agendada}` : null,
    conteudo.solicitacao.tecnico ? `Técnico responsável: ${conteudo.solicitacao.tecnico}` : null
  ].filter(Boolean));
  item('Condição encontrada', conteudo.condicao_encontrada);
  item('Diagnóstico técnico', conteudo.diagnostico_tecnico);
  if (conteudo.modelo) {
    linhas.push(titulo(`Modelo: ${conteudo.modelo.tipo}`));
    conteudo.modelo.campos.forEach((x) => linhas.push(`- ${x}`));
  }
  item('Atividades executadas', conteudo.atividades_executadas);
  item('Resultado do atendimento', conteudo.resultado);
  item('Pendências', conteudo.pendencias);
  item('Recomendações', conteudo.recomendacoes);
  if (conteudo.evidencia_fotografica && conteudo.evidencia_fotografica.length) {
    linhas.push(titulo('Evidências'));
    conteudo.evidencia_fotografica.forEach((x) => linhas.push(`- ${x}`));
  }
  if (conteudo.necessidade_adicional) {
    linhas.push(titulo('Necessidade adicional'));
    linhas.push(`- ${conteudo.necessidade_adicional.tipo}`);
    if (conteudo.necessidade_adicional.descricao) linhas.push(`- ${conteudo.necessidade_adicional.descricao}`);
  }
  item('Assinatura do responsável', [
    conteudo.assinatura.nome ? `Nome: ${conteudo.assinatura.nome}` : null,
    conteudo.assinatura.cargo ? `Cargo: ${conteudo.assinatura.cargo}` : null,
    conteudo.assinatura.data_hora ? `Em: ${conteudo.assinatura.data_hora}` : null
  ].filter(Boolean));
  item('Identificação do técnico', conteudo.tecnico);

  if (conteudo.lacunas && conteudo.lacunas.length) {
    linhas.push(titulo('Lacunas identificadas (não inventadas pela IA)'));
    conteudo.lacunas.forEach((x) => linhas.push(`- ${x}`));
  }
  if (conteudo.oportunidade) {
    linhas.push(titulo('Sugestão de oportunidade comercial'));
    linhas.push(`- Tipo: ${conteudo.oportunidade.tipo}`);
    linhas.push(`- Descrição: ${conteudo.oportunidade.descricao}`);
  }
  linhas.push(`\n${conteudo.observacao_ia}`);
  return linhas.join('\n').trim();
}

module.exports = { gerarRelatorioIA, formatarParaVisualizacao, gerarSugestaoMedicoes, RESULTADOS, CATEGORIA_ANEXO };