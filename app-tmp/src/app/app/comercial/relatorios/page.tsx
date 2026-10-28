"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinhaVazia, Loading, PageHeader, Select, Tabela } from "@/components/ui";

interface Relatorio {
  id: number;
  token?: string | null;
  os_id?: number;
  os_numero: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  local_nome?: string | null;
  local_responsavel?: string | null;
  local_responsavel_telefone?: string | null;
  local_responsavel_email?: string | null;
  responsavel_local?: string | null;
  os_servico: string;
  os_prioridade: string;
  data_validacao: string | null;
  recomendacoes: string | null;
  necessidade_adicional: string | null;
  tipo_necessidade_label: string | null;
  oportunidade_id: number | null;
  oportunidade_status: string | null;
}

interface Cliente { id: number; nome: string }

const TIPOS_OPORTUNIDADE = [
  { v: "nova_manutencao", l: "Nova manutenção" },
  { v: "substituicao_equipamento", l: "Substituição de equipamento" },
  { v: "fornecimento_peca", l: "Fornecimento de peça" },
  { v: "instalacao", l: "Instalação" },
  { v: "adequacao", l: "Adequação" },
  { v: "outro_servico", l: "Outro serviço" }
];

const STATUS_COMERCIAL = [
  { v: "novo", l: "Novo relatório" },
  { v: "em_analise", l: "Em análise" },
  { v: "necessita_contato", l: "Necessita contato" },
  { v: "necessita_informacao", l: "Necessita informação adicional" },
  { v: "proposta_elaboracao", l: "Proposta em elaboração" },
  { v: "proposta_enviada", l: "Proposta enviada" },
  { v: "em_negociacao", l: "Em negociação" },
  { v: "aprovado", l: "Aprovado" },
  { v: "perdido", l: "Perdido" },
  { v: "sem_oportunidade", l: "Sem oportunidade" }
];

export default function RelatoriosPage() {
  const router = useRouter();
  const [relatorios, setRelatorios] = useState<Relatorio[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState({ cliente_id: "", data_inicio: "", data_fim: "", tipo: "", prioridade: "", status: "" });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro.cliente_id) params.set("cliente_id", filtro.cliente_id);
    if (filtro.data_inicio) params.set("data_inicio", filtro.data_inicio);
    if (filtro.data_fim) params.set("data_fim", filtro.data_fim);
    if (filtro.tipo) params.set("tipo", filtro.tipo);
    if (filtro.prioridade) params.set("prioridade", filtro.prioridade);
    if (filtro.status) params.set("status", filtro.status);
    const qs = params.toString();
    api.get<{ relatorios: Relatorio[]; clientes: Cliente[] }>(`/api/comercial/relatorios${qs ? `?${qs}` : ""}`)
      .then((r) => {
        setRelatorios(r.relatorios);
        setClientes(r.clientes);
      })
      .catch(() => setRelatorios([]));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  function urlRelatorio(r: Relatorio): string {
    return `${window.location.origin}/relatorio/${r.token}`;
  }

  async function copiarLink(e: React.MouseEvent, r: Relatorio) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(urlRelatorio(r));
      setMsg(`Link do relatório da OS ${r.os_numero} copiado!`);
    } catch {
      setErro("Não foi possível copiar o link automaticamente.");
    }
  }

  function enviarWhatsApp(e: React.MouseEvent, r: Relatorio) {
    e.stopPropagation();
    const telRaw = (r.local_responsavel_telefone || r.cliente_telefone || "").replace(/\D/g, "");
    const tel = telRaw ? (telRaw.length <= 11 ? `55${telRaw}` : telRaw) : "";
    const resp = r.local_responsavel || r.responsavel_local || r.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const texto = encodeURIComponent(`${saudacao} Segue o relatório técnico do atendimento da OS ${r.os_numero} (${r.local_nome || r.cliente_nome || "Thermo Control"}): ${urlRelatorio(r)}`);
    const url = tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
  }

  function enviarEmail(e: React.MouseEvent, r: Relatorio) {
    e.stopPropagation();
    const email = r.local_responsavel_email || r.cliente_email || "";
    const resp = r.local_responsavel || r.responsavel_local || r.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const assunto = encodeURIComponent(`Relatório Técnico - OS ${r.os_numero}`);
    const corpo = encodeURIComponent(`${saudacao}\n\nSegue o link para acessar e baixar o relatório técnico da OS ${r.os_numero} (${r.os_servico || ""}):\n${urlRelatorio(r)}`);
    window.open(`mailto:${email}?subject=${assunto}&body=${corpo}`, "_blank");
  }

  function abrirPdf(e: React.MouseEvent, r: Relatorio) {
    e.stopPropagation();
    if (r.token) {
      window.open(`${API_URL}/api/comercial/relatorios/publico/${r.token}/pdf`, "_blank");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Relatórios Técnicos"
        descricao="Visualize, baixe em PDF ou envie o link do relatório para o responsável do local via WhatsApp ou e-mail"
        acoes={<Botao onClick={() => router.push("/app/comercial/oportunidades")}>Ver oportunidades</Botao>}
      />

      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <Card title="Filtros">
        <div className="grid gap-2 md:grid-cols-6">
          <Select label="Cliente" value={filtro.cliente_id} onChange={(e) => setFiltro({ ...filtro, cliente_id: e.target.value })}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select label="Tipo de oportunidade" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
            <option value="">Todos</option>
            {TIPOS_OPORTUNIDADE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Select label="Prioridade" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </Select>
          <Select label="Status comercial" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
            <option value="">Todos</option>
            {STATUS_COMERCIAL.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          <Campo label="Período (de)" type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} />
          <Campo label="Período (até)" type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} />
        </div>
      </Card>

      <Card title={`Relatórios (${relatorios?.length ?? "..."})`}>
        <Tabela cabecalhos={["OS", "Cliente / Local", "Responsável do local", "Serviço", "Validado em", "Enviar ao responsável"]}>
          {relatorios === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : relatorios.length === 0 ? (
            <LinhaVazia texto="Nenhum relatório encontrado com os filtros atuais." />
          ) : (
            relatorios.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/comercial/relatorios/${r.id}`)}>
                <td className="px-3 py-2.5 font-semibold text-blue-900">{r.os_numero}</td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-900">{r.cliente_nome}</div>
                  {r.local_nome && <div className="text-xs text-zinc-500">{r.local_nome}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-700">
                  <div className="font-medium">{r.local_responsavel || r.responsavel_local || "-"}</div>
                  {(r.local_responsavel_telefone || r.cliente_telefone) && (
                    <div className="text-zinc-500">{r.local_responsavel_telefone || r.cliente_telefone}</div>
                  )}
                </td>
                <td className="px-3 py-2.5">{r.os_servico}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs text-zinc-600">{r.data_validacao?.slice(0, 10) || "-"}</td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => copiarLink(e, r)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Copiar link
                    </button>
                    <button
                      type="button"
                      onClick={(e) => enviarWhatsApp(e, r)}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={(e) => enviarEmail(e, r)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-100"
                    >
                      E-mail
                    </button>
                    <button
                      type="button"
                      onClick={(e) => abrirPdf(e, r)}
                      className="rounded-lg bg-blue-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-950"
                    >
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>
    </div>
  );
}
