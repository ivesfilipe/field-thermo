"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, API_URL } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Select, Tabela } from "@/components/ui";

interface Relatorio {
  id: number;
  token?: string | null;
  os_id?: number;
  os_numero: string;
  os_status?: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  equipe_nome?: string | null;
  local_nome?: string | null;
  local_endereco?: string | null;
  local_responsavel?: string | null;
  local_responsavel_telefone?: string | null;
  local_responsavel_email?: string | null;
  responsavel_local?: string | null;
  os_servico: string;
  os_prioridade: string;
  data_agendada?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  data_validacao: string | null;
  recomendacoes: string | null;
  necessidade_adicional: string | null;
  tipo_necessidade_label: string | null;
  oportunidade_id: number | null;
  oportunidade_status: string | null;
}

interface Cliente { id: number; nome: string }

const ABAS_FILTRO = [
  { v: "", l: "Todos" },
  { v: "com_oportunidade", l: "Com oportunidade" },
  { v: "novo", l: "Novos" },
  { v: "em_analise", l: "Em análise" },
  { v: "aprovado", l: "Aprovados" }
];

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

function fmtData(d: string | null | undefined): string {
  if (!d) return "-";
  const p = d.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function RelatoriosPage() {
  const router = useRouter();
  const [relatorios, setRelatorios] = useState<Relatorio[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState({
    busca: "",
    status: "",
    cliente_id: "",
    prioridade: "",
    tipo: "",
    data_inicio: "",
    data_fim: ""
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro.busca) params.set("busca", filtro.busca);
    if (filtro.cliente_id) params.set("cliente_id", filtro.cliente_id);
    if (filtro.data_inicio) params.set("data_inicio", filtro.data_inicio);
    if (filtro.data_fim) params.set("data_fim", filtro.data_fim);
    if (filtro.tipo) params.set("tipo", filtro.tipo);
    if (filtro.prioridade) params.set("prioridade", filtro.prioridade);
    if (filtro.status) params.set("status", filtro.status);
    const qs = params.toString();
    api
      .get<{ relatorios: Relatorio[]; clientes: Cliente[] }>(`/api/comercial/relatorios${qs ? `?${qs}` : ""}`)
      .then((r) => {
        setRelatorios(r.relatorios);
        setClientes(r.clientes);
      })
      .catch(() => setRelatorios([]));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  const temFiltro = Object.values(filtro).some((v) => v !== "");

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

  async function enviarEmail(e: React.MouseEvent, r: Relatorio) {
    e.stopPropagation();
    setErro("");
    setMsg("");
    try {
      const resp = await api.post<{ ok: boolean; destinatarios: string[]; remetente: string }>(
        `/api/comercial/relatorios/${r.id}/enviar-email`,
        { base_url: window.location.origin }
      );
      setMsg(`Relatório da OS ${r.os_numero} enviado automaticamente por e-mail (${resp.remetente}) para ${resp.destinatarios.join(", ")}.`);
    } catch (err) {
      setErro((err as Error).message);
    }
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
        descricao="Acompanhe, filtre, baixe em PDF ou envie os relatórios técnicos das ordens de serviço"
        acoes={<Botao onClick={() => router.push("/app/comercial/oportunidades")}>Ver oportunidades</Botao>}
      />

      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      {/* Barra de filtros idêntica à tela de Ordens de Serviço */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {ABAS_FILTRO.map((aba) => {
              const ativo = filtro.status === aba.v;
              return (
                <button
                  key={aba.v}
                  type="button"
                  onClick={() => setFiltro({ ...filtro, status: aba.v })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    ativo ? "bg-blue-900 text-white shadow-sm" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {aba.l}
                </button>
              );
            })}
          </div>
          <div className="flex flex-1 items-center justify-end gap-2 sm:flex-initial">
            <input
              value={filtro.busca}
              onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })}
              placeholder="Buscar Nº, cliente, equipe ou serviço..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none sm:w-64"
            />
            <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => setMostrarFiltros(!mostrarFiltros)}>
              {mostrarFiltros ? "Ocultar filtros" : "Mais filtros"}
            </Botao>
            {temFiltro && (
              <Botao
                variante="secundario"
                className="px-3 py-1.5 text-xs"
                onClick={() => setFiltro({ busca: "", status: "", cliente_id: "", prioridade: "", tipo: "", data_inicio: "", data_fim: "" })}
              >
                Limpar
              </Botao>
            )}
          </div>
        </div>

        {mostrarFiltros && (
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-6">
            <Select label="Cliente" value={filtro.cliente_id} onChange={(e) => setFiltro({ ...filtro, cliente_id: e.target.value })}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Prioridade" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
              <option value="">Todas</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </Select>
            <Select label="Tipo de oportunidade" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
              <option value="">Todos</option>
              {TIPOS_OPORTUNIDADE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </Select>
            <Select label="Status comercial" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
              <option value="">Todos</option>
              {STATUS_COMERCIAL.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </Select>
            <Campo label="Período (de)" type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} />
            <Campo label="Período (até)" type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} />
          </div>
        )}
      </div>

      {/* Tabela no mesmo formato compacto de Ordens de Serviço */}
      <Card title={`Relatórios encontrados (${relatorios?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nº", "Cliente — Equipe", "Local", "Data / hora", "Prioridade", "Status", "Ações"]}>
          {relatorios === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : relatorios.length === 0 ? (
            <LinhaVazia texto="Nenhum relatório técnico encontrado." />
          ) : (
            relatorios.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/comercial/relatorios/${r.id}`)}>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-blue-700">{r.os_numero}</td>
                <td className="px-3 py-2">
                  <span className="block max-w-64 truncate" title={`${r.cliente_nome} — ${r.equipe_nome || "Sem equipe"}`}>
                    {r.cliente_nome} — {r.equipe_nome || "Sem equipe"}
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  {r.local_nome || "-"}
                  {r.local_endereco && (
                    <span className="block max-w-48 truncate text-xs text-zinc-500" title={r.local_endereco}>
                      {r.local_endereco}
                      <LinksMapa endereco={r.local_endereco} pararPropagacao />
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {fmtData(r.data_agendada || r.data_validacao)}
                  {(r.hora_inicio || r.hora_fim) && (
                    <span className="block text-xs text-zinc-500">
                      {r.hora_inicio || "--:--"}{r.hora_fim ? `–${r.hora_fim}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2"><Prioridade p={r.os_prioridade} /></td>
                <td className="px-3 py-2"><Badge status={r.os_status || "concluida"} /></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => router.push(`/app/comercial/relatorios/${r.id}`)}
                      title={`Abrir relatório ${r.os_numero}`}
                      aria-label={`Abrir relatório ${r.os_numero}`}
                      className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => abrirPdf(e, r)}
                      className="rounded-md bg-blue-900 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-950"
                    >
                      PDF
                    </button>
                    <button
                      type="button"
                      onClick={(e) => copiarLink(e, r)}
                      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={(e) => enviarEmail(e, r)}
                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      E-mail
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
