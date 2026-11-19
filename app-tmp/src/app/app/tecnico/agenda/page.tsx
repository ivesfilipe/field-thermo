"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Badge, Botao, Card, EstadoVazio, LinksMapa, Loading, PageHeader, Prioridade } from "@/components/ui";

type Visao = "dia" | "semana" | "mes" | "lista";
type FiltroTipo = "todos" | "os" | "atividade";

interface AgendaItem {
  kind: "os" | "atividade";
  id: number;
  referencia: string;
  titulo: string;
  descricao: string | null;
  cliente_nome: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  equipamento_nome: string | null;
  prioridade: string | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string;
  status_base?: string;
  os_id?: number | null;
  observacoes?: string | null;
}

const STATUS_COR: Record<string, string> = {
  agendada: "bg-sky-100 text-sky-800",
  confirmada: "bg-amber-100 text-amber-800",
  em_andamento: "bg-blue-100 text-blue-800",
  aguardando_validacao: "bg-violet-100 text-violet-800",
  concluida: "bg-emerald-600 text-white",
  reaberta: "bg-orange-100 text-orange-800",
  cancelada: "bg-zinc-200 text-zinc-600",
  atrasada: "bg-red-100 text-red-800",
  pendente: "bg-sky-100 text-sky-800"
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Aguardando início",
  em_andamento: "Em atendimento",
  aguardando_validacao: "Aguardando validação",
  concluida: "Concluída",
  reaberta: "Reaberta",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
  pendente: "Pendente"
};

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDias(d: Date, n: number): Date {
  const nova = new Date(d);
  nova.setDate(nova.getDate() + n);
  return nova;
}

function addMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function inicioSemana(d: Date): Date {
  const nova = new Date(d);
  const dia = (nova.getDay() + 6) % 7;
  return addDias(nova, -dia);
}

function fmtData(d: string | null): string {
  if (!d) return "-";
  const [a, m, di] = d.split("-");
  const hoje = new Date();
  const hj = iso(hoje);
  if (d === hj) return `Hoje (${di}/${m})`;
  return `${di}/${m}/${a}`;
}

function fmtDataSemana(d: Date): string {
  const diaMes = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  return `${diaMes}/${mes}`;
}

export default function MinhaAgendaPage() {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("dia");
  const [ancora, setAncora] = useState(() => new Date());
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [detalhe, setDetalhe] = useState<AgendaItem | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [iniciando, setIniciando] = useState<number | null>(null);

  const periodo = useMemo(() => {
    const inicio =
      visao === "mes"
        ? new Date(ancora.getFullYear(), ancora.getMonth(), 1)
        : visao === "semana"
        ? inicioSemana(ancora)
        : new Date(ancora.getFullYear(), ancora.getMonth(), ancora.getDate());

    const fim =
      visao === "mes"
        ? new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0)
        : visao === "semana"
        ? addDias(inicio, 6)
        : inicio;

    return { inicio, fim };
  }, [visao, ancora]);

  const carregar = useCallback(() => {
    const dInicio = iso(periodo.inicio);
    const dFim = iso(periodo.fim);
    api
      .get<{ agenda: AgendaItem[] }>(`/api/tecnico/agenda?data_inicio=${dInicio}&data_fim=${dFim}`)
      .then((r) => setAgenda(r.agenda))
      .catch((e) => {
        setAgenda([]);
        setErro(e.message);
      });
  }, [periodo]);

  useEffect(carregar, [carregar]);

  function navegar(dir: number) {
    if (visao === "mes") setAncora(addMeses(ancora, dir));
    else if (visao === "semana") setAncora(addDias(ancora, dir * 7));
    else setAncora(addDias(ancora, dir));
  }

  function irParaHoje() {
    setAncora(new Date());
  }

  const tituloPeriodo = useMemo(() => {
    if (visao === "mes") return `${MESES[periodo.inicio.getMonth()]} de ${periodo.inicio.getFullYear()}`;
    if (visao === "semana") return `${fmtData(iso(periodo.inicio))} — ${fmtData(iso(periodo.fim))}`;
    return fmtData(iso(ancora));
  }, [visao, ancora, periodo]);

  async function iniciarAtendimento(item: AgendaItem) {
    if (item.kind !== "os") return;
    setErro("");
    setMsg("");
    setIniciando(item.id);
    try {
      await api.post(`/api/tecnico/os/${item.id}/iniciar`);
      setMsg(`Atendimento ${item.referencia} iniciado.`);
      carregar();
      router.push(`/app/tecnico/os/${item.id}`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setIniciando(null);
    }
  }

  // Filtragem por tipo (todos / os / atividade)
  const itensFiltrados = useMemo(() => {
    if (!agenda) return [];
    if (filtroTipo === "os") return agenda.filter((i) => i.kind === "os");
    if (filtroTipo === "atividade") return agenda.filter((i) => i.kind === "atividade");
    return agenda;
  }, [agenda, filtroTipo]);

  const totalGeral = agenda?.length || 0;
  const totalOs = (agenda || []).filter((i) => i.kind === "os").length;
  const totalAtividades = (agenda || []).filter((i) => i.kind === "atividade");

  // Agrupamento por data para visão de lista / dia
  const grupos = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const item of itensFiltrados) {
      const chave = item.data || "sem-data";
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave)!.push(item);
    }
    return mapa;
  }, [itensFiltrados]);

  // Dias da semana para visão semanal
  const diasSemana = useMemo(() => {
    const inicio = inicioSemana(ancora);
    return Array.from({ length: 7 }, (_, i) => addDias(inicio, i));
  }, [ancora]);

  // Células do mês para visão mensal
  const celulasMes = useMemo(() => {
    if (visao !== "mes") return [];
    const primeiroDia = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
    const ultimoDia = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0);
    const offsetInicio = (primeiroDia.getDay() + 6) % 7;
    const diasTotal = ultimoDia.getDate();
    const celulas: Array<{ data: Date; mesAtual: boolean }> = [];

    for (let i = offsetInicio - 1; i >= 0; i--) {
      celulas.push({ data: addDias(primeiroDia, -(i + 1)), mesAtual: false });
    }
    for (let i = 1; i <= diasTotal; i++) {
      celulas.push({ data: new Date(ancora.getFullYear(), ancora.getMonth(), i), mesAtual: true });
    }
    while (celulas.length % 7 !== 0) {
      const ult = celulas[celulas.length - 1].data;
      celulas.push({ data: addDias(ult, 1), mesAtual: false });
    }
    return celulas;
  }, [visao, ancora]);

  return (
    <div className="space-y-4 pb-12">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Minha Agenda & Atividades"
        descricao="Acompanhe suas Ordens de Serviço e Atividades Técnicas programadas"
      />

      {/* BARRA DE NAVEGAÇÃO DE DATAS E SELETOR DE VISÃO (IGUAL AO CALENDÁRIO OPERACIONAL) */}
      <Card title="Navegação do Calendário">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Controles de Navegação */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navegar(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition"
              title="Anterior"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={irParaHoje}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => navegar(1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white font-bold text-slate-700 shadow-xs hover:bg-slate-50 active:scale-95 transition"
              title="Próximo"
            >
              ›
            </button>
            <span className="ml-2 text-sm sm:text-base font-bold text-blue-950">
              {tituloPeriodo}
            </span>
          </div>

          {/* Seletor de Visão */}
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-medium">
            {(
              [
                { v: "dia", l: "Dia" },
                { v: "semana", l: "Semana" },
                { v: "mes", l: "Mês" },
                { v: "lista", l: "Lista" }
              ] as const
            ).map((item) => (
              <button
                key={item.v}
                type="button"
                onClick={() => setVisao(item.v)}
                className={`rounded-md px-3 py-1.5 transition-all ${
                  visao === item.v
                    ? "bg-white font-bold text-blue-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {item.l}
              </button>
            ))}
          </div>
        </div>

        {/* Abas de Filtro: Todos, OS, Atividades */}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 text-xs">
          <button
            type="button"
            onClick={() => setFiltroTipo("todos")}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              filtroTipo === "todos"
                ? "bg-blue-700 text-white shadow-xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            Todos ({totalGeral})
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("os")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
              filtroTipo === "os"
                ? "bg-blue-700 text-white shadow-xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span>Ordens de Serviço ({totalOs})</span>
          </button>
          <button
            type="button"
            onClick={() => setFiltroTipo("atividade")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
              filtroTipo === "atividade"
                ? "bg-emerald-700 text-white shadow-xs"
                : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span>Atividades Técnicas ({totalAtividades.length})</span>
          </button>
        </div>
      </Card>

      {agenda === null ? (
        <Loading />
      ) : itensFiltrados.length === 0 ? (
        <Card title="Programação">
          <EstadoVazio texto={`Nenhuma ${filtroTipo === "os" ? "OS" : filtroTipo === "atividade" ? "atividade" : "programação"} encontrada para este período.`} />
        </Card>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* VISÃO: DIA E LISTA (IDEAL PARA MOBILE NO CAMPO)                          */}
          {/* ========================================================================= */}
          {(visao === "dia" || visao === "lista") && (
            <div className="space-y-4">
              {Array.from(grupos.entries()).map(([dataGrupo, itens]) => (
                <div key={dataGrupo} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      {fmtData(dataGrupo)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {itens.length} {itens.length === 1 ? "item" : "itens"}
                    </span>
                  </div>

                  <div className="grid gap-3">
                    {itens.map((item) => {
                      const ehOs = item.kind === "os";
                      const podeIniciar = ehOs && ["pendente", "em_deslocamento", "em_andamento"].includes(item.status_base || item.status);
                      const continuar = ehOs && item.status_base === "em_andamento";

                      return (
                        <div
                          key={`${item.kind}-${item.id}`}
                          onClick={() => setDetalhe(item)}
                          className={`group cursor-pointer rounded-xl border p-4 shadow-xs transition-all hover:shadow-md ${
                            ehOs
                              ? "border-blue-200/80 bg-white hover:border-blue-500"
                              : "border-emerald-200/90 bg-emerald-50/20 hover:border-emerald-500"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-6 w-6 items-center justify-center rounded-md text-xs ${
                                  ehOs ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {ehOs ? "📋" : "📌"}
                              </span>
                              <span className={`font-mono text-sm font-bold ${ehOs ? "text-blue-700" : "text-emerald-800"}`}>
                                {item.referencia}
                              </span>
                              {!ehOs && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                                  {item.descricao || "Atividade"}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              {item.prioridade && <Prioridade p={item.prioridade} />}
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  STATUS_COR[item.status] || "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {STATUS_LABEL[item.status] || item.status}
                              </span>
                            </div>
                          </div>

                          <p className="mt-2 text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition">
                            {item.titulo}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <span>🕒</span>
                              <span>{item.hora_inicio ? `${item.hora_inicio}${item.hora_fim ? ` às ${item.hora_fim}` : ""}` : "Dia inteiro"}</span>
                            </span>
                            {item.cliente_nome && (
                              <span className="flex items-center gap-1">
                                <span>🏢</span>
                                <span className="font-medium text-slate-800">{item.cliente_nome}</span>
                              </span>
                            )}
                            {item.local_nome && (
                              <span className="flex items-center gap-1">
                                <span>📍</span>
                                <span>{item.local_nome}</span>
                              </span>
                            )}
                          </div>

                          {(item.local_endereco_completo || item.local_endereco) && (
                            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                              <span className="truncate">{item.local_endereco_completo || item.local_endereco}</span>
                              <LinksMapa endereco={item.local_endereco_completo || item.local_endereco} pararPropagacao />
                            </div>
                          )}

                          {item.observacoes && (
                            <p className="mt-2 text-xs italic text-slate-600 line-clamp-2">
                              &ldquo;{item.observacoes}&rdquo;
                            </p>
                          )}

                          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                            {ehOs ? (
                              podeIniciar ? (
                                <Botao
                                  variante={continuar ? "primario" : "sucesso"}
                                  className="text-xs py-2 px-3 font-semibold shadow-xs"
                                  disabled={iniciando === item.id}
                                  onClick={() => iniciarAtendimento(item)}
                                >
                                  {iniciando === item.id ? "Iniciando..." : continuar ? "Continuar Atendimento" : "▶ Iniciar Atendimento"}
                                </Botao>
                              ) : (
                                <Botao
                                  variante="secundario"
                                  className="text-xs py-2 px-3 font-semibold"
                                  onClick={() => router.push(`/app/tecnico/os/${item.id}`)}
                                >
                                  Abrir OS →
                                </Botao>
                              )
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setDetalhe(item)}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                            >
                              Ver detalhes
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VISÃO: SEMANA                                                             */}
          {/* ========================================================================= */}
          {visao === "semana" && (
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {diasSemana.map((d, idx) => {
                const chave = iso(d);
                const itensDoDia = itensFiltrados.filter((i) => i.data === chave);
                const ehHoje = chave === iso(new Date());

                return (
                  <div
                    key={chave}
                    className={`rounded-xl border p-2.5 transition ${
                      ehHoje ? "border-blue-400 bg-blue-50/30" : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="text-xs font-bold text-slate-700">
                        {DIAS_SEMANA[idx]}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ehHoje ? "bg-blue-600 text-white" : "text-slate-500"}`}>
                        {fmtDataSemana(d)}
                      </span>
                    </div>

                    {itensDoDia.length === 0 ? (
                      <p className="py-4 text-center text-[11px] text-slate-400">Livre</p>
                    ) : (
                      <div className="space-y-1.5">
                        {itensDoDia.map((item) => {
                          const ehOs = item.kind === "os";
                          return (
                            <div
                              key={`${item.kind}-${item.id}`}
                              onClick={() => setDetalhe(item)}
                              className={`cursor-pointer rounded-lg border p-2 text-left text-xs transition shadow-2xs hover:scale-[1.02] ${
                                ehOs
                                  ? "border-blue-200 bg-blue-50/80 text-blue-950 hover:bg-blue-100"
                                  : "border-emerald-200 bg-emerald-50/80 text-emerald-950 hover:bg-emerald-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono text-[10px] font-bold">
                                  {ehOs ? "📋 " : "📌 "}{item.referencia}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500">
                                  {item.hora_inicio || ""}
                                </span>
                              </div>
                              <p className="mt-1 font-semibold truncate leading-tight">{item.titulo}</p>
                              {item.cliente_nome && <p className="text-[10px] text-slate-600 truncate">{item.cliente_nome}</p>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VISÃO: MÊS                                                                */}
          {/* ========================================================================= */}
          {visao === "mes" && (
            <Card title="Calendário Mensal">
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-600 pb-2 border-b border-slate-200">
                {DIAS_SEMANA.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {celulasMes.map((c) => {
                  const chave = iso(c.data);
                  const itensDoDia = itensFiltrados.filter((i) => i.data === chave);
                  const ehHoje = chave === iso(new Date());

                  return (
                    <div
                      key={chave}
                      onClick={() => {
                        setAncora(c.data);
                        setVisao("dia");
                      }}
                      className={`min-h-[75px] sm:min-h-[95px] cursor-pointer rounded-lg border p-1 text-left transition hover:border-blue-400 ${
                        !c.mesAtual
                          ? "border-slate-100 bg-slate-50/50 opacity-40"
                          : ehHoje
                          ? "border-blue-500 bg-blue-50/40"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                            ehHoje ? "bg-blue-600 text-white" : "text-slate-700"
                          }`}
                        >
                          {c.data.getDate()}
                        </span>
                        {itensDoDia.length > 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">
                            {itensDoDia.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 space-y-1">
                        {itensDoDia.slice(0, 2).map((item) => (
                          <div
                            key={`${item.kind}-${item.id}`}
                            className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                              item.kind === "os" ? "bg-blue-100 text-blue-900" : "bg-emerald-100 text-emerald-900"
                            }`}
                          >
                            {item.hora_inicio ? `${item.hora_inicio} ` : ""}{item.referencia}
                          </div>
                        ))}
                        {itensDoDia.length > 2 && (
                          <p className="text-[9px] text-center font-bold text-slate-500">
                            +{itensDoDia.length - 2} mais
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}

      {/* MODAL DETALHES DO ITEM (ATIVIDADE OU OS) */}
      {detalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetalhe(null)}>
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 text-white ${detalhe.kind === "os" ? "bg-blue-700" : "bg-emerald-700"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{detalhe.kind === "os" ? "📋" : "📌"}</span>
                  <div>
                    <h3 className="font-mono text-base font-bold leading-none">{detalhe.referencia}</h3>
                    <p className="mt-1 text-xs opacity-90">{detalhe.kind === "os" ? "Ordem de Serviço" : "Atividade Técnica"}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetalhe(null)}
                  className="rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COR[detalhe.status] || "bg-slate-100"}`}>
                  {STATUS_LABEL[detalhe.status] || detalhe.status}
                </span>
                {detalhe.prioridade && <Prioridade p={detalhe.prioridade} />}
                {detalhe.descricao && detalhe.kind === "atividade" && (
                  <span className="rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 text-xs font-semibold">
                    {detalhe.descricao}
                  </span>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Título / Serviço</p>
                <p className="font-bold text-slate-900 text-base">{detalhe.titulo}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Data</p>
                  <p className="font-medium text-slate-900">{fmtData(detalhe.data)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Horário</p>
                  <p className="font-medium text-slate-900">
                    {detalhe.hora_inicio ? `${detalhe.hora_inicio}${detalhe.hora_fim ? ` às ${detalhe.hora_fim}` : ""}` : "Dia inteiro"}
                  </p>
                </div>
              </div>

              {detalhe.cliente_nome && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Cliente</p>
                  <p className="font-medium text-slate-900">{detalhe.cliente_nome}</p>
                </div>
              )}

              {detalhe.local_nome && (
                <div>
                  <p className="text-xs text-slate-500 font-semibold uppercase">Local</p>
                  <p className="font-medium text-slate-900">{detalhe.local_nome}</p>
                </div>
              )}

              {(detalhe.local_endereco_completo || detalhe.local_endereco) && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Endereço com Rotas</p>
                  <p className="text-slate-800 text-xs mt-0.5">{detalhe.local_endereco_completo || detalhe.local_endereco}</p>
                  <div className="mt-2">
                    <LinksMapa endereco={detalhe.local_endereco_completo || detalhe.local_endereco} />
                  </div>
                </div>
              )}

              {detalhe.equipamento_nome && (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs text-slate-500 font-semibold uppercase">Equipamento</p>
                  <p className="font-medium text-slate-900">{detalhe.equipamento_nome}</p>
                </div>
              )}

              {detalhe.observacoes && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-600">Observações</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-800 text-xs">{detalhe.observacoes}</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 p-4 bg-slate-50 flex flex-wrap gap-2 justify-end">
              {detalhe.kind === "os" && (
                <Botao
                  variante="primario"
                  className="font-semibold shadow-xs"
                  onClick={() => {
                    setDetalhe(null);
                    router.push(`/app/tecnico/os/${detalhe.id}`);
                  }}
                >
                  Abrir Ordem de Serviço →
                </Botao>
              )}
              <Botao variante="secundario" onClick={() => setDetalhe(null)}>
                Fechar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
