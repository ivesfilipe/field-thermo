"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Select, Tabela } from "@/components/ui";

interface OS {
  id: number;
  numero: string;
  servico: string;
  prioridade: string;
  status: string;
  data_agendada: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  cliente_nome: string;
  equipe_nome?: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  equipamento_nome: string | null;
  equipamento_codigo_mt?: string | null;
}

const ABAS_STATUS = [
  { v: "", l: "Todas" },
  { v: "pendente", l: "Pendentes" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "concluida", l: "Concluídas" }
];

function fmtData(d: string | null): string {
  if (!d) return "-";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

export default function MinhasOsPage() {
  const router = useRouter();
  const hoje = new Date().toISOString().slice(0, 10);
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [iniciando, setIniciando] = useState<number | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [apenasHoje, setApenasHoje] = useState(true);
  const [filtro, setFiltro] = useState({
    busca: "",
    status: "",
    prioridade: "",
    data_inicio: "",
    data_fim: ""
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (apenasHoje && !filtro.data_inicio && !filtro.data_fim) {
      params.set("data", hoje);
    }
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
  }, [apenasHoje, filtro, hoje]);

  useEffect(carregar, [carregar]);

  const temFiltro = Object.values(filtro).some((v) => v !== "") || !apenasHoje;

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
        descricao={apenasHoje && !filtro.data_inicio && !filtro.data_fim ? `Ordens de serviço de hoje (${fmtData(hoje)})` : "Acompanhe, filtre por status e execute as ordens da sua equipe"}
        acoes={
          <Botao
            variante="secundario"
            onClick={() => router.push("/app/tecnico/agenda")}
          >
            Ver Agenda
          </Botao>
        }
      />

      {/* Barra de filtros no mesmo padrão do Gestor */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
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
            <span className="mx-1 hidden h-4 w-px bg-zinc-200 sm:inline-block" />
            <button
              type="button"
              onClick={() => {
                setApenasHoje(!apenasHoje);
                setFiltro((f) => ({ ...f, data_inicio: "", data_fim: "" }));
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                apenasHoje && !filtro.data_inicio && !filtro.data_fim
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {apenasHoje && !filtro.data_inicio && !filtro.data_fim ? "Somente Hoje" : "Todas as datas"}
            </button>
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
                onClick={() => {
                  setApenasHoje(true);
                  setFiltro({ busca: "", status: "", prioridade: "", data_inicio: "", data_fim: "" });
                }}
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
            <Campo
              label="Período (de)"
              type="date"
              value={filtro.data_inicio}
              onChange={(e) => {
                setApenasHoje(false);
                setFiltro({ ...filtro, data_inicio: e.target.value });
              }}
            />
            <Campo
              label="Período (até)"
              type="date"
              value={filtro.data_fim}
              onChange={(e) => {
                setApenasHoje(false);
                setFiltro({ ...filtro, data_fim: e.target.value });
              }}
            />
          </div>
        )}
      </div>

      <Card title={`Ordens encontradas (${ordens?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nº", "Cliente — Serviço", "Local", "Data / hora", "Prioridade", "Status", "Ações"]}>
          {ordens === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : ordens.length === 0 ? (
            <LinhaVazia texto="Nenhuma ordem de serviço encontrada." />
          ) : (
            ordens.map((o) => {
              const podeIniciar = ["pendente", "em_andamento"].includes(o.status);
              const horario = o.hora_inicio || o.hora_fim ? `${o.hora_inicio || "--:--"}–${o.hora_fim || "--:--"}` : null;
              return (
                <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>
                  <td className="whitespace-nowrap px-3 py-2 font-semibold text-blue-700">
                    {o.numero}
                    {["urgente", "alta"].includes(o.prioridade) && (
                      <span className="ml-1 font-bold text-red-600" title="Atender com prioridade">*</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-900">{o.cliente_nome}</span>
                    <span className="block text-xs text-zinc-500">
                      {o.servico}
                      {o.equipamento_codigo_mt ? ` • ${o.equipamento_codigo_mt}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-slate-800">{o.local_nome || "-"}</span>
                    {(o.local_endereco_completo || o.local_endereco) && (
                      <span className="block text-xs text-zinc-500">
                        {o.local_endereco_completo || o.local_endereco}
                        <LinksMapa endereco={o.local_endereco_completo || o.local_endereco} pararPropagacao />
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">
                    <span className="block font-medium">{fmtData(o.data_agendada)}</span>
                    {horario && <span className="text-zinc-500">{horario}</span>}
                  </td>
                  <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                  <td className="px-3 py-2"><Badge status={o.status} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {podeIniciar ? (
                      <Botao
                        variante="sucesso"
                        className="px-3 py-1.5 text-xs"
                        disabled={iniciando === o.id}
                        onClick={() => iniciar(o)}
                      >
                        {iniciando === o.id ? "..." : o.status === "em_andamento" ? "Continuar" : "Iniciar"}
                      </Botao>
                    ) : (
                      <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>
                        Abrir
                      </Botao>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </Tabela>
        {ordens !== null && ordens.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            <span className="font-bold text-red-600">*</span> = atender com prioridade (urgente/alta)
          </p>
        )}
      </Card>
    </div>
  );
}
