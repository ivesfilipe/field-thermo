export interface CampoModelo {
  chave: string;
  rotulo: string;
  tipo: "text" | "textarea" | "select";
  obrigatorio?: boolean;
  opcoes?: Array<{ v: string; l: string }>;
}

export interface Modelo {
  rotulo: string;
  campos: CampoModelo[];
}

export const MODELOS: Record<string, Modelo> = {
  instalacao: {
    rotulo: "Instalação",
    campos: [
      { chave: "descricao_instalacao", rotulo: "Descrição da instalação", tipo: "textarea", obrigatorio: true },
      { chave: "infra_tubulacao", rotulo: "Infraestrutura executada — Tubulação", tipo: "text" },
      { chave: "infra_dreno", rotulo: "Infraestrutura executada — Dreno", tipo: "text" },
      { chave: "infra_eletrica", rotulo: "Infraestrutura executada — Interligação elétrica", tipo: "text" },
      { chave: "testes_realizados", rotulo: "Testes realizados", tipo: "textarea", obrigatorio: true },
      {
        chave: "resultado_instalacao", rotulo: "Resultado da instalação", tipo: "select", obrigatorio: true,
        opcoes: [
          { v: "concluida", l: "Instalação concluída" },
          { v: "parcial", l: "Instalação parcial" },
          { v: "nao_concluida", l: "Não concluída" }
        ]
      }
    ]
  },
  preventiva: {
    rotulo: "Manutenção Preventiva",
    campos: [
      { chave: "descricao_servico", rotulo: "Descrição do serviço realizado", tipo: "textarea", obrigatorio: true },
      { chave: "atividades_realizadas", rotulo: "Atividades realizadas", tipo: "textarea", obrigatorio: true },
      { chave: "condicao_equipamento", rotulo: "Condição do equipamento", tipo: "textarea" },
      {
        chave: "resultado", rotulo: "Resultado", tipo: "select",
        opcoes: [
          { v: "funcionando", l: "Equipamento funcionando normalmente" },
          { v: "com_restricao", l: "Funcionando com restrição" },
          { v: "indisponivel", l: "Equipamento indisponível" },
          { v: "necessita_retorno", l: "Necessita retorno" },
          { v: "necessita_orcamento", l: "Necessita orçamento" }
        ]
      },
      { chave: "recomendacoes", rotulo: "Observações / recomendações", tipo: "textarea" }
    ]
  },
  corretiva: {
    rotulo: "Levantamento de Corretiva",
    campos: [
      { chave: "problema_relatado", rotulo: "Problema relatado", tipo: "textarea", obrigatorio: true },
      { chave: "condicao_encontrada", rotulo: "Condição encontrada", tipo: "textarea" },
      { chave: "diagnostico", rotulo: "Diagnóstico / constatação", tipo: "textarea", obrigatorio: true },
      { chave: "necessidade_identificada", rotulo: "Necessidade identificada", tipo: "textarea" },
      { chave: "recomendacoes", rotulo: "Recomendação", tipo: "textarea" },
      {
        chave: "necessidade_orcamento", rotulo: "Necessidade de orçamento", tipo: "select",
        opcoes: [
          { v: "sim", l: "Sim" },
          { v: "nao", l: "Não" }
        ]
      }
    ]
  },
  pmoc: {
    rotulo: "Levantamento PMOC",
    campos: [
      {
        chave: "condicao_geral", rotulo: "Condição geral", tipo: "select", obrigatorio: true,
        opcoes: [
          { v: "boa", l: "Boa" },
          { v: "regular", l: "Regular" },
          { v: "ruim", l: "Ruim" },
          { v: "critica", l: "Crítica" }
        ]
      },
      { chave: "estado_conservacao", rotulo: "Estado de conservação", tipo: "textarea", obrigatorio: true },
      { chave: "recomendacoes", rotulo: "Recomendações", tipo: "textarea" }
    ]
  }
};

export function getModelo(tipo: string | null | undefined): Modelo | null {
  return tipo && MODELOS[tipo] ? MODELOS[tipo] : null;
}

export function rotuloCampo(tipo: string, chave: string): string {
  const m = getModelo(tipo);
  const campo = m?.campos.find((c) => c.chave === chave);
  return campo ? campo.rotulo : chave;
}

export function valorRotulo(tipo: string, chave: string, valor: string | null | undefined): string {
  const m = getModelo(tipo);
  const campo = m?.campos.find((c) => c.chave === chave);
  if (campo?.tipo === "select" && campo.opcoes) {
    const opcao = campo.opcoes.find((o) => o.v === valor);
    if (opcao) return opcao.l;
  }
  return valor ?? "";
}

export function camposPreenchidos(tipo: string, dados: Record<string, string>): Array<{ chave: string; rotulo: string; valor: string }> {
  const m = getModelo(tipo);
  if (!m) return [];
  return m.campos
    .map((c) => {
      const v = dados[c.chave];
      if (v === undefined || v === null || String(v).trim() === "") return null;
      return { chave: c.chave, rotulo: c.rotulo, valor: String(v).trim() };
    })
    .filter((x): x is { chave: string; rotulo: string; valor: string } => x !== null);
}