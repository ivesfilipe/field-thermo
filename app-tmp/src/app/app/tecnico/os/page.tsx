"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Select, Tabela } from "@/components/ui";

interface OS {
  id: number;
  numero: string;
  cliente_nome: string;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  servico: string;
  equipe_nome: string | null;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  prioridade: string;
  status: string;
}

const ABAS_STATUS = [
  { v: "", l: "Todas" },
  { v: "pendente", l: "Pendentes" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "concluida", l: "Concluídas" }
];

function fmtData(d: string | null | undefined): string {
  if (!d) return "-";
  const p = d.slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function MinhasOsPage() {
  const router = useRouter();
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtro, setFiltro] = useState({
    busca: "",
    status: "",
    prioridade: "",
    data_inicio: "",
    data_fim: ""
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro.busca) params.set("busca", filtro.busca);
    if (filtro.status) params.set("status", filtro.status);
    if (filtro.prioridade) params.set("prioridade", filtro.prioridade);
    if (filtro.data_inicio) params.set("data_inicio", filtro.data_inicio);
    if (filtro.data_fim) params.set("data_fim", filtro.data_fim);
    const qs = params.toString();
    api
      .get<{ ordens: OS[] }>(`/api/tecnico/os${qs ? `?${qs}` : ""}`)
      .then((r) => setOrdens(r.ordens))
      .catch(() => setOrdens([]));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  const temFiltro = Object.values(filtro).some((v) => v !== "");

  async function iniciar(o: OS) {
    setErro("");
    setMsg("");
    setIniciando(o.id);
    try {
      if (o.status === "pendente") {
        await api.post(`/api/tecnico/os/${o.id}/iniciar`);
        setMsg(`Atendimento ${o.numero} iniciado.`);
      }
      router.push(`/app/tecnico/os/${o.id}`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setIniciando(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Minhas Ordens de Serviço"
        descricao="Acompanhe, filtre por status e execute as ordens de serviço da sua equipe"
      />

      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {ABAS_STATUS.map((aba) => {
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
              placeholder="Buscar Nº, cliente ou serviço..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none sm:w-64"
            />
            <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => setMostrarFiltros(!mostrarFiltros)}>
              {mostrarFiltros ? "Ocultar filtros" : "Mais filtros"}
            </Botao>
            {temFiltro && (
              <Botao
                variante="secundario"
                className="px-3 py-1.5 text-xs"
                onClick={() => setFiltro({ busca: "", status: "", prioridade: "", data_inicio: "", data_fim: "" })}
              >
                Limpar
              </Botao>
            )}
          </div>
        </div>

        {mostrarFiltros && (
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-3">
            <Select label="Prioridade" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
              <option value="">Todas</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </Select>
            <Campo label="Período (de)" type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} />
            <Campo label="Período (até)" type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} />
          </div>
        )}
      </div>

      <Card title={`Ordens encontradas (${ordens?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nº", "Cliente — Equipe", "Local", "Data / hora", "Prioridade", "Status", "Ações"]}>
          {ordens === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : ordens.length === 0 ? (
            <LinhaVazia texto="Nenhuma ordem de serviço encontrada." />
          ) : (
            ordens.map((o) => {
              const podeIniciar = ["pendente", "em_andamento"].includes(o.status);
              return (
                <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-blue-700">{o.numero}</td>
                  <td className="px-3 py-2">
                    <span className="block max-w-64 truncate" title={`${o.cliente_nome} — ${o.equipe_nome || "Sem equipe"}`}>
                      {o.cliente_nome} — {o.equipe_nome || "Sem equipe"}
                    </span>
                  </td>
                  <td className="hidden px-3 py-2 md:table-cell">
                    {o.local_nome || "-"}
                    {(o.local_endereco_completo || o.local_endereco) && (
                      <span className="block max-w-48 truncate text-xs text-zinc-500" title={o.local_endereco_completo || o.local_endereco || undefined}>
                        {o.local_endereco_completo || o.local_endereco}
                        <LinksMapa endereco={(o.local_endereco_completo || o.local_endereco)!} pararPropagacao />
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {fmtData(o.data_agendada)}
                    {(o.hora_inicio || o.hora_fim) && (
                      <span className="block text-xs text-zinc-500">
                        {o.hora_inicio || "--:--"}{o.hora_fim ? `–${o.hora_fim}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                  <td className="px-3 py-2"><Badge status={o.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => router.push(`/app/tecnico/os/${o.id}`)}
                        title={`Abrir OS ${o.numero}`}
                        aria-label={`Abrir OS ${o.numero}`}
                        className="inline-flex cursor-pointer items-center justify-center rounded p-1 text-blue-600 transition-colors hover:bg-blue-100 hover:text-blue-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>
                      {podeIniciar && (
                        <Botao
                          variante="sucesso"
                          className="px-2 py-1 text-xs"
                          disabled={iniciando === o.id}
                          onClick={() => iniciar(o)}
                        >
                          {iniciando === o.id ? "..." : o.status === "em_andamento" ? "Continuar" : "Iniciar"}
                        </Botao>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </Tabela>
      </Card>
    </div>
  );
}
