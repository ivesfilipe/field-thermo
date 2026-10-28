"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, LinksMapa, Modal, Select, Prioridade } from "@/components/ui";
import SelecionarCliente from "@/components/selecionar-cliente";

type Visao = "mes" | "semana" | "dia" | "lista";

interface Evento {
  kind: "os" | "atividade";
  id: number;
  referencia: string;
  titulo: string;
  descricao: string | null;
  tipo?: string;
  tipo_label?: string;
  os_id?: number | null;
  os_numero?: string | null;
  prioridade: string | null;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: string;
  status_base?: string;
  confirmada?: number;
  cliente_id: number | null;
  cliente_nome: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  equipe_id: number | null;
  equipe_nome: string | null;
  tecnico_id: number | null;
  tecnico_nome: string | null;
  responsavel?: string | null;
  observacoes?: string | null;
}

interface Indicadores {
  os_hoje: number;
  os_em_andamento: number;
  os_aguardando_atendimento: number;
  os_atrasadas: number;
  os_aguardando_validacao: number;
  atividades_programadas: number;
}

interface Cliente { id: number; nome: string; documento?: string | null; cidade_principal?: string | null; estado_principal?: string | null }
interface Equipe { id: number; nome: string }

interface Conflito {
  tipo: string;
  id: number;
  referencia: string;
  titulo: string;
  motivo: string;
  horario: string;
  tecnico_nome?: string | null;
  equipe_nome?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluida: "Concluída",
  reaberta: "Reaberta",
  cancelada: "Cancelada",
  atrasada: "Atrasada",
  pendente: "Pendente"
};

const STATUS_COR: Record<string, string> = {
  agendada: "bg-sky-100 text-sky-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  em_andamento: "bg-blue-100 text-blue-800",
  aguardando_validacao: "bg-violet-100 text-violet-800",
  concluida: "bg-emerald-600 text-white",
  reaberta: "bg-orange-100 text-orange-800",
  cancelada: "bg-zinc-200 text-zinc-600",
  atrasada: "bg-red-100 text-red-800"
};

const TIPOS_ATIVIDADE = [
  { v: "visita_tecnica", l: "Visita técnica" },
  { v: "levantamento", l: "Levantamento" },
  { v: "inspecao", l: "Inspeção" },
  { v: "reuniao", l: "Reunião" },
  { v: "retorno_cliente", l: "Retorno ao cliente" },
  { v: "preventiva", l: "Preventiva programada" },
  { v: "acompanhamento", l: "Acompanhamento de serviço" },
  { v: "outro", l: "Outra atividade" }
];

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HORAS = Array.from({ length: 15 }, (_, i) => i + 6);

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
  return `${di}/${m}/${a}`;
}
function horarioLabel(e: Evento): string {
  if (!e.hora_inicio) return "Dia inteiro";
  return e.hora_fim ? `${e.hora_inicio}–${e.hora_fim}` : e.hora_inicio;
}

function BadgeEvento({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COR[status] || "bg-zinc-100 text-zinc-700"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "concluida" ? "bg-white" : "bg-current"}`} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function Indicador({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
      <p className="text-lg font-bold leading-tight" style={{ color: cor }}>{valor}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}

export default function CalendarioPage() {
  const router = useRouter();
  const [visao, setVisao] = useState<Visao>("mes");
  const [ancora, setAncora] = useState(() => new Date());
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [filtro, setFiltro] = useState({ cliente_id: "", equipe_id: "", status: "", prioridade: "", tipo: "" });
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [selecionado, setSelecionado] = useState<Evento | null>(null);
  const [modal, setModal] = useState<null | "novo" | "editar" | "historico" | "conflito">(null);
  const [slotClicado, setSlotClicado] = useState<{ data: string; hora: string } | null>(null);
  const [histAtivo, setHistAtivo] = useState<{ tipo: string; id: number } | null>(null);
  const [historico, setHistorico] = useState<Array<Record<string, unknown>> | null>(null);
  const [pendencia, setPendencia] = useState<{ enviar: () => Promise<void>; conflitos: Conflito[] } | null>(null);
  const forcarRef = useRef(false);

  const [formNovo, setFormNovo] = useState({
    tipo: "os",
    os_id: undefined as number | undefined,
    titulo: "",
    tipo_atv: "visita_tecnica",
    cliente_id: "",
    responsavel: "",
    servico: "",
    descricao: "",
    prioridade: "media",
    equipe_id: "",
    data: "",
    hora_inicio: "",
    hora_fim: ""
  });
  const [edit, setEdit] = useState({ data: "", hora_inicio: "", hora_fim: "", equipe_id: "" });

  const periodo = useMemo(() => {
    const inicio = visao === "mes"
      ? new Date(ancora.getFullYear(), ancora.getMonth(), 1)
      : visao === "semana" ? inicioSemana(ancora) : new Date(ancora.getFullYear(), ancora.getMonth(), ancora.getDate());
    const fim = visao === "mes"
      ? new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0)
      : visao === "semana" ? addDias(inicio, 6) : inicio;
    return { inicio, fim };
  }, [visao, ancora]);

  const carregar = useCallback(() => {
    api
      .get<{ eventos: Evento[]; indicadores: Indicadores }>(`/api/gestor/calendario?data_inicio=${iso(periodo.inicio)}&data_fim=${iso(periodo.fim)}`)
      .then((r) => {
        setEventos(r.eventos);
        setIndicadores(r.indicadores);
      })
      .catch((e) => {
        setEventos([]);
        setErro(e.message);
      });
  }, [periodo]);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    api.get<{ clientes: Cliente[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch(() => {});
    api.get<{ equipes: Equipe[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  const filtrados = useMemo(() => {
    if (!eventos) return [];
    return eventos.filter((e) => {
      if (filtro.cliente_id && e.cliente_id !== Number(filtro.cliente_id)) return false;
      if (filtro.equipe_id && e.equipe_id !== Number(filtro.equipe_id)) return false;
      if (filtro.status && e.status !== filtro.status) return false;
      if (filtro.prioridade && e.prioridade !== filtro.prioridade) return false;
      if (filtro.tipo && e.tipo !== filtro.tipo) return false;
      return true;
    });
  }, [eventos, filtro]);

  function navegar(dir: number) {
    if (visao === "mes") setAncora(addMeses(ancora, dir));
    else if (visao === "semana") setAncora(addDias(ancora, dir * 7));
    else setAncora(addDias(ancora, dir));
  }

  function tituloPeriodo(): string {
    if (visao === "mes") return `${MESES[periodo.inicio.getMonth()]} ${periodo.inicio.getFullYear()}`;
    if (visao === "semana") return `${fmtData(iso(periodo.inicio))} — ${fmtData(iso(periodo.fim))}`;
    if (visao === "dia") return fmtData(iso(ancora));
    return "Lista de próximas atividades";
  }

  function eventosDoDia(d: Date): Evento[] {
    const chave = iso(d);
    return filtrados
      .filter((e) => e.data === chave)
      .sort((a, b) => (a.hora_inicio || "").localeCompare(b.hora_inicio || "") || (a.kind === "os" ? -1 : 1));
  }

  function abrirNovo(data: string, hora: string) {
    setSlotClicado({ data, hora });
    setFormNovo((f) => ({ ...f, data, hora_inicio: hora, hora_fim: "", tipo: "os", os_id: undefined }));
    setModal("novo");
  }

  async function enviarComReconflito(enviar: () => Promise<void>) {
    forcarRef.current = false;
    try {
      await enviar();
    } catch (err) {
      const e = err as { status?: number; conflitos?: Conflito[]; message?: string };
      if (e?.status === 409 && Array.isArray(e?.conflitos)) {
        setPendencia({ enviar, conflitos: e.conflitos });
        setModal("conflito");
      } else {
        setErro(e?.message || "Erro ao salvar");
      }
    }
  }

  async function criarOS() {
    const payload = () =>
      ({
        cliente_id: Number(formNovo.cliente_id),
        servico: formNovo.servico,
        descricao: formNovo.descricao || undefined,
        prioridade: formNovo.prioridade,
        data_agendada: formNovo.data || undefined,
        hora_inicio: formNovo.hora_inicio || undefined,
        hora_fim: formNovo.hora_fim || undefined,
        responsavel_local: formNovo.responsavel || undefined,
        equipe_id: formNovo.equipe_id ? Number(formNovo.equipe_id) : undefined,
        ignorar_conflitos: forcarRef.current || undefined
      }) as Record<string, unknown>;
    await enviarComReconflito(async () => {
      const r = await api.post<{ os: { id: number } }>("/api/gestor/os", payload());
      setMsg("OS criada e agendada no calendário.");
      setModal(null);
      router.push(`/app/gestor/os/${r.os.id}`);
    });
  }

  async function criarAtividade(osId?: number) {
    const payload = () =>
      ({
        titulo: formNovo.titulo,
        tipo: formNovo.tipo_atv,
        os_id: osId || undefined,
        cliente_id: formNovo.cliente_id ? Number(formNovo.cliente_id) : undefined,
        responsavel: formNovo.responsavel || undefined,
        observacoes: formNovo.descricao || undefined,
        equipe_id: formNovo.equipe_id ? Number(formNovo.equipe_id) : undefined,
        data: formNovo.data || undefined,
        hora_inicio: formNovo.hora_inicio || undefined,
        hora_fim: formNovo.hora_fim || undefined,
        ignorar_conflitos: forcarRef.current || undefined
      }) as Record<string, unknown>;
    await enviarComReconflito(async () => {
      await api.post("/api/gestor/atividades", payload());
      setMsg("Atividade criada e exibida no calendário.");
      setModal(null);
      carregar();
    });
  }

  async function moverEm(data: string, horaInicio: string) {
    const e = selecionado;
    if (!e) return;
    const novaHora = horaInicio || e.hora_inicio || undefined;
    const novaFim = horaInicio ? e.hora_fim : undefined;
    await enviarComReconflito(async () => {
      if (e.kind === "os") {
        await api.patch(`/api/gestor/os/${e.id}/horario`, { data, hora_inicio: novaHora, hora_fim: novaFim, ignorar_conflitos: forcarRef.current || undefined });
      } else {
        await api.put(`/api/gestor/atividades/${e.id}`, { data, hora_inicio: novaHora, hora_fim: novaFim, ignorar_conflitos: forcarRef.current || undefined });
      }
      setMsg(`${e.referencia} movida para ${fmtData(data)}.`);
      setSelecionado(null);
      carregar();
    });
  }

  function onDragStart(e: React.DragEvent, ev: Evento) {
    e.dataTransfer.setData("text/plain", JSON.stringify({ kind: ev.kind, id: ev.id }));
    e.dataTransfer.effectAllowed = "move";
  }

  function onDrop(ev: React.DragEvent, data: string, horaInicio: string) {
    ev.preventDefault();
    const raw = ev.dataTransfer.getData("text/plain");
    if (!raw) return;
    const { kind, id } = JSON.parse(raw);
    const alvo = (filtrados || []).find((x) => x.kind === kind && x.id === id);
    if (alvo) {
      setSelecionado(alvo);
      moverEm(data, horaInicio);
    }
  }

  function abrirEdicao(e: Evento) {
    setSelecionado(e);
    setEdit({ data: e.data || "", hora_inicio: e.hora_inicio || "", hora_fim: e.hora_fim || "", equipe_id: e.equipe_id ? String(e.equipe_id) : "" });
    setModal("editar");
  }

  async function salvarEdicao() {
    const e = selecionado;
    if (!e) return;
    if (e.kind === "atividade") {
      await enviarComReconflito(async () => {
        await api.put(`/api/gestor/atividades/${e.id}`, {
          data: edit.data || undefined,
          hora_inicio: edit.hora_inicio || undefined,
          hora_fim: edit.hora_fim || undefined,
          equipe_id: edit.equipe_id ? Number(edit.equipe_id) : undefined,
          ignorar_conflitos: forcarRef.current || undefined
        });
        setMsg("Atividade atualizada.");
        setModal(null);
        carregar();
      });
      return;
    }
    if (e.status_base === "pendente") {
      await enviarComReconflito(async () => {
        await api.put(`/api/gestor/os/${e.id}`, {
          data_agendada: edit.data || undefined,
          hora_inicio: edit.hora_inicio || undefined,
          hora_fim: edit.hora_fim || undefined,
          equipe_id: edit.equipe_id ? Number(edit.equipe_id) : undefined,
          ignorar_conflitos: forcarRef.current || undefined
        });
        setMsg("OS atualizada.");
        setModal(null);
        carregar();
      });
    } else {
      await enviarComReconflito(async () => {
        await api.patch(`/api/gestor/os/${e.id}/horario`, {
          data: edit.data || undefined,
          hora_inicio: edit.hora_inicio || undefined,
          hora_fim: edit.hora_fim || undefined,
          ignorar_conflitos: forcarRef.current || undefined
        });
        setMsg("Data/horário da OS atualizados.");
        setModal(null);
        carregar();
      });
    }
  }

  async function confirmarOS() {
    const e = selecionado;
    if (!e || e.kind !== "os") return;
    try {
      await api.patch(`/api/gestor/os/${e.id}/confirmar`, { confirmada: e.confirmada ? false : true });
      setMsg(e.confirmada ? "OS desconfirmada." : "OS confirmada.");
      setSelecionado(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function abrirHistorico() {
    const e = selecionado;
    if (!e) return;
    setHistAtivo({ tipo: e.kind, id: e.id });
    setModal("historico");
    try {
      const r = await api.get<{ historico: Array<Record<string, unknown>> }>(`/api/gestor/historico?tipo=${e.kind}&registro_id=${e.id}`);
      setHistorico(r.historico);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function cancelarAtividade() {
    const e = selecionado;
    if (!e || e.kind !== "atividade") return;
    if (!confirm(`Cancelar a atividade "${e.titulo}"?`)) return;
    try {
      await api.patch(`/api/gestor/atividades/${e.id}/status`, { status: "cancelada" });
      setMsg("Atividade cancelada.");
      setSelecionado(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function reabrirAtividade() {
    const e = selecionado;
    if (!e || e.kind !== "atividade") return;
    try {
      await api.patch(`/api/gestor/atividades/${e.id}/status`, { status: "reaberta" });
      setMsg("Atividade reaberta.");
      setSelecionado(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluirAtividade() {
    const e = selecionado;
    if (!e || e.kind !== "atividade") return;
    if (!confirm(`Excluir a atividade "${e.titulo}"?`)) return;
    try {
      await api.del(`/api/gestor/atividades/${e.id}`);
      setMsg("Atividade excluída.");
      setSelecionado(null);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const diasMes = useMemo(() => {
    const inicio = new Date(periodo.inicio);
    const primeiroDiaCelula = inicioSemana(inicio);
    return Array.from({ length: 42 }, (_, i) => addDias(primeiroDiaCelula, i)).filter(
      (d) => d.getMonth() === inicio.getMonth() || d <= periodo.fim
    );
  }, [periodo]);

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      {indicadores && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Indicador label="OS de hoje" valor={indicadores.os_hoje} cor="#2563eb" />
          <Indicador label="OS em andamento" valor={indicadores.os_em_andamento} cor="#0891b2" />
          <Indicador label="OS aguardando atendimento" valor={indicadores.os_aguardando_atendimento} cor="#d97706" />
          <Indicador label="OS atrasadas" valor={indicadores.os_atrasadas} cor="#dc2626" />
          <Indicador label="OS aguardando validação" valor={indicadores.os_aguardando_validacao} cor="#7c3aed" />
          <Indicador label="Atividades programadas" valor={indicadores.atividades_programadas} cor="#059669" />
        </div>
      )}

      <Card title="Calendário Operacional">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Botao variante="secundario" onClick={() => navegar(-1)}>◀</Botao>
          <Botao variante="secundario" onClick={() => setAncora(new Date())}>Hoje</Botao>
          <Botao variante="secundario" onClick={() => navegar(1)}>▶</Botao>
          <span className="min-w-44 text-sm font-semibold">{tituloPeriodo()}</span>
          <div className="ml-auto flex gap-1">
            {(["mes", "semana", "dia", "lista"] as Visao[]).map((v) => (
              <button
                key={v}
                onClick={() => setVisao(v)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${visao === v ? "bg-blue-600 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}
              >
                {v === "mes" ? "Mês" : v === "semana" ? "Semana" : v === "dia" ? "Dia" : "Lista"}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 grid gap-2 md:grid-cols-5">
          <SelecionarCliente clientes={clientes} value={filtro.cliente_id} onChange={(v) => setFiltro({ ...filtro, cliente_id: v })} placeholder="Todos os clientes" />
          <Select label="Equipe" value={filtro.equipe_id} onChange={(e) => setFiltro({ ...filtro, equipe_id: e.target.value })}>
            <option value="">Todas</option>
            {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
          </Select>
          <Select label="Status" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select label="Prioridade (OS)" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </Select>
          <Select label="Tipo de atividade" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
            <option value="">Todos</option>
            {TIPOS_ATIVIDADE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
        </div>

        <p className="mb-3 text-xs text-zinc-500">
          Arraste uma OS ou atividade para reagendar. Clique em um dia/horário vazio para criar um agendamento.
        </p>

        {eventos === null ? (
          <p className="py-10 text-center text-sm text-zinc-400">Carregando...</p>
        ) : visao === "mes" ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-175 grid-cols-7 border border-zinc-200">
              {DIAS_SEMANA.map((d) => (
                <div key={d} className="border-b border-r border-zinc-200 bg-zinc-50 px-2 py-1 text-center text-xs font-semibold text-zinc-500">{d}</div>
              ))}
              {diasMes.map((d) => {
                const eventosDia = eventosDoDia(d);
                const fora = d.getMonth() !== ancora.getMonth();
                const hoje = iso(d) === iso(new Date());
                return (
                  <div
                    key={iso(d)}
                    onClick={() => abrirNovo(iso(d), "")}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, iso(d), "")}
                    className={`min-h-24 cursor-pointer border-b border-r border-zinc-200 p-1 ${fora ? "bg-zinc-50 opacity-60" : "bg-white"} ${hoje ? "bg-blue-50" : ""}`}
                  >
                    <p className="text-right text-xs font-medium text-zinc-400">{d.getDate()}</p>
                    <div className="space-y-1">
                      {eventosDia.slice(0, 3).map((e) => (
                        <div
                          key={`${e.kind}-${e.id}`}
                          draggable
                          onDragStart={(ev) => onDragStart(ev, e)}
                          onClick={(ev) => { ev.stopPropagation(); abrirEdicao(e); }}
                          className={`cursor-grab rounded border-l-2 px-1.5 py-0.5 text-xs ${e.kind === "os" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50"} ${e.status === "atrasada" ? "border-red-500 bg-red-50" : ""} ${e.status === "cancelada" ? "opacity-50" : ""}`}
                        >
                          <span className="font-semibold">{e.referencia}</span> {e.titulo}
                        </div>
                      ))}
                      {eventosDia.length > 3 && <p className="text-xs text-zinc-400">+{eventosDia.length - 3} mais</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : visao === "semana" ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-175 grid-cols-7 border border-zinc-200">
              {Array.from({ length: 7 }, (_, i) => addDias(periodo.inicio, i)).map((d) => (
                <div key={iso(d)} className={`border-b border-r border-zinc-200 px-2 py-1 text-center text-xs font-semibold ${iso(d) === iso(new Date()) ? "bg-blue-50" : "bg-zinc-50"}`}>
                  {DIAS_SEMANA[(d.getDay() + 6) % 7]} {d.getDate()}/{d.getMonth() + 1}
                </div>
              ))}
              {Array.from({ length: 7 }, (_, i) => addDias(periodo.inicio, i)).map((d) => (
                <div
                  key={iso(d)}
                  onClick={() => abrirNovo(iso(d), "")}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, iso(d), "")}
                  className="min-h-40 cursor-pointer border-b border-r border-zinc-200 bg-white p-1"
                >
                  <div className="space-y-1">
                    {eventosDoDia(d).map((e) => (
                      <div
                        key={`${e.kind}-${e.id}`}
                        draggable
                        onDragStart={(ev) => onDragStart(ev, e)}
                        onClick={(ev) => { ev.stopPropagation(); abrirEdicao(e); }}
                        className={`cursor-grab rounded border-l-2 px-1.5 py-0.5 text-xs ${e.kind === "os" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50"} ${e.status === "atrasada" ? "border-red-500 bg-red-50" : ""}`}
                      >
                        <span className="font-semibold">{horarioLabel(e)}</span> — {e.referencia} {e.titulo}
                      </div>
                    ))}
                    {eventosDoDia(d).length === 0 && <p className="pt-6 text-center text-xs text-zinc-300">clique para agendar</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : visao === "dia" ? (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-[4rem_1fr] border border-zinc-200">
              {HORAS.map((h) => {
                const horaStr = `${String(h).padStart(2, "0")}:00`;
                const eventosHora = filtrados.filter((e) => e.data === iso(ancora) && (e.hora_inicio || "").slice(0, 2) === horaStr.slice(0, 2));
                return (
                  <div key={h} className="contents">
                    <div className="border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-right text-xs font-medium text-zinc-500">{horaStr}</div>
                    <div
                      onClick={() => abrirNovo(iso(ancora), horaStr)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDrop(e, iso(ancora), horaStr)}
                      className="min-h-14 cursor-pointer border-b border-zinc-200 p-1 hover:bg-blue-50/50"
                    >
                      {eventosHora.map((e) => (
                        <div
                          key={`${e.kind}-${e.id}`}
                          draggable
                          onDragStart={(ev) => onDragStart(ev, e)}
                          onClick={(ev) => { ev.stopPropagation(); abrirEdicao(e); }}
                          className={`mb-1 cursor-grab rounded border-l-2 px-1.5 py-0.5 text-xs ${e.kind === "os" ? "border-blue-500 bg-blue-50" : "border-emerald-500 bg-emerald-50"}`}
                        >
                          <span className="font-semibold">{horarioLabel(e)}</span> — {e.referencia} {e.titulo}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                  <th className="px-3 py-2 font-semibold">Data</th>
                  <th className="px-3 py-2 font-semibold">Horário</th>
                  <th className="px-3 py-2 font-semibold">Referência</th>
                  <th className="px-3 py-2 font-semibold">Título</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Local</th>
                  <th className="px-3 py-2 font-semibold">Equipe</th>
                  <th className="px-3 py-2 font-semibold">Prioridade</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-sm text-zinc-400">Nenhum agendamento no período.</td>
                  </tr>
                )}
                {filtrados.map((e) => (
                  <tr key={`${e.kind}-${e.id}`} className="cursor-pointer hover:bg-zinc-50" onClick={() => abrirEdicao(e)}>
                    <td className="px-3 py-2">{fmtData(e.data)}</td>
                    <td className="px-3 py-2">{horarioLabel(e)}</td>
                    <td className="px-3 py-2 font-medium text-blue-600">{e.referencia}</td>
                    <td className="px-3 py-2">
                      {e.titulo}
                      {e.tipo_label && <span className="ml-1 text-xs text-zinc-400">({e.tipo_label})</span>}
                    </td>
                    <td className="px-3 py-2">{e.cliente_nome || "-"}</td>
                    <td className="px-3 py-2">
                      {e.local_nome || "-"}
                      {(e.local_endereco_completo || e.local_endereco) && (
                        <span className="block text-xs text-zinc-500">
                          {e.local_endereco_completo || e.local_endereco}
                          <LinksMapa endereco={e.local_endereco_completo || e.local_endereco} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{e.equipe_nome || "-"}</td>
                    <td className="px-3 py-2">{e.prioridade ? <Prioridade p={e.prioridade} /> : "-"}</td>
                    <td className="px-3 py-2"><BadgeEvento status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal === "novo" && (
        <Modal titulo={`Novo agendamento em ${fmtData(slotClicado?.data || formNovo.data)}${slotClicado?.hora ? ` às ${slotClicado.hora}` : ""}`} onFechar={() => setModal(null)}>
          <div className="mb-3 flex gap-2">
            <button onClick={() => setFormNovo({ ...formNovo, tipo: "os" })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${formNovo.tipo === "os" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"}`}>
              Criar OS
            </button>
            <button onClick={() => setFormNovo({ ...formNovo, tipo: "atividade" })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${formNovo.tipo === "atividade" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-700"}`}>
              Criar atividade
            </button>
          </div>
          {formNovo.tipo === "os" ? (
            <form onSubmit={(e) => { e.preventDefault(); criarOS(); }} className="grid gap-3 md:grid-cols-2">
              <SelecionarCliente clientes={clientes} value={formNovo.cliente_id} onChange={(v) => setFormNovo({ ...formNovo, cliente_id: v })} />
              <Campo label="Serviço solicitado" value={formNovo.servico} onChange={(e) => setFormNovo({ ...formNovo, servico: e.target.value })} placeholder="Ex.: Manutenção preventiva" />
              <Campo label="Data" type="date" value={formNovo.data} onChange={(e) => setFormNovo({ ...formNovo, data: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Horário inicial" type="time" value={formNovo.hora_inicio} onChange={(e) => setFormNovo({ ...formNovo, hora_inicio: e.target.value })} />
                <Campo label="Prev. término" type="time" value={formNovo.hora_fim} onChange={(e) => setFormNovo({ ...formNovo, hora_fim: e.target.value })} />
              </div>
              <Campo label="Responsável do local" value={formNovo.responsavel} onChange={(e) => setFormNovo({ ...formNovo, responsavel: e.target.value })} />
              <Select label="Prioridade" value={formNovo.prioridade} onChange={(e) => setFormNovo({ ...formNovo, prioridade: e.target.value })}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
              <Select label="Equipe" value={formNovo.equipe_id} onChange={(e) => setFormNovo({ ...formNovo, equipe_id: e.target.value })}>
                <option value="">Sem equipe</option>
                {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
              </Select>
              <div className="md:col-span-2">
                <Campo label="Descrição" value={formNovo.descricao} onChange={(e) => setFormNovo({ ...formNovo, descricao: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Botao tipo="submit">Agendar OS</Botao>
                <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); criarAtividade(formNovo.os_id); }} className="grid gap-3 md:grid-cols-2">
              <Campo label="Título" value={formNovo.titulo} onChange={(e) => setFormNovo({ ...formNovo, titulo: e.target.value })} />
              <Select label="Tipo" value={formNovo.tipo_atv} onChange={(e) => setFormNovo({ ...formNovo, tipo_atv: e.target.value })}>
                {TIPOS_ATIVIDADE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </Select>
              <Campo label="Data" type="date" value={formNovo.data} onChange={(e) => setFormNovo({ ...formNovo, data: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Campo label="Horário inicial" type="time" value={formNovo.hora_inicio} onChange={(e) => setFormNovo({ ...formNovo, hora_inicio: e.target.value })} />
                <Campo label="Horário final" type="time" value={formNovo.hora_fim} onChange={(e) => setFormNovo({ ...formNovo, hora_fim: e.target.value })} />
              </div>
              <SelecionarCliente clientes={clientes} value={formNovo.cliente_id} onChange={(v) => setFormNovo({ ...formNovo, cliente_id: v })} placeholder="Sem cliente (opcional)" />
              <Campo label="Responsável" value={formNovo.responsavel} onChange={(e) => setFormNovo({ ...formNovo, responsavel: e.target.value })} />
              <Select label="Equipe" value={formNovo.equipe_id} onChange={(e) => setFormNovo({ ...formNovo, equipe_id: e.target.value })}>
                <option value="">Sem equipe</option>
                {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
              </Select>
              <div className="md:col-span-2">
                <Campo label="Observações" value={formNovo.descricao} onChange={(e) => setFormNovo({ ...formNovo, descricao: e.target.value })} />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <Botao tipo="submit">Agendar atividade</Botao>
                <Botao variante="secundario" onClick={() => setModal(null)}>Cancelar</Botao>
              </div>
            </form>
          )}
        </Modal>
      )}

      {modal === "editar" && selecionado && (
        <Modal titulo={`${selecionado.referencia} — ${selecionado.titulo}`} onFechar={() => setModal(null)}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <BadgeEvento status={selecionado.status} />
              {selecionado.prioridade && <Prioridade p={selecionado.prioridade} />}
              {selecionado.tipo_label && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">{selecionado.tipo_label}</span>
              )}
            </div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Cliente</dt><dd>{selecionado.cliente_nome || "-"}</dd>
              <dt className="text-zinc-500">Local</dt>
              <dd>
                {selecionado.local_nome || "-"}
                {(selecionado.local_endereco_completo || selecionado.local_endereco) && (
                  <LinksMapa endereco={selecionado.local_endereco_completo || selecionado.local_endereco} />
                )}
              </dd>
              <dt className="text-zinc-500">Equipe</dt><dd>{selecionado.equipe_nome || "-"}</dd>
              <dt className="text-zinc-500">Data</dt><dd>{fmtData(selecionado.data)}</dd>
              <dt className="text-zinc-500">Horário</dt><dd>{horarioLabel(selecionado)}</dd>
            </dl>
            {selecionado.descricao && <p className="text-sm text-zinc-600">{selecionado.descricao}</p>}

            <div className="border-t border-zinc-200 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase text-zinc-500">Alterar data, horário e equipe</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                <Campo label="Data" type="date" value={edit.data} onChange={(e) => setEdit({ ...edit, data: e.target.value })} />
                <Campo label="Horário inicial" type="time" value={edit.hora_inicio} onChange={(e) => setEdit({ ...edit, hora_inicio: e.target.value })} />
                <Campo label="Horário final" type="time" value={edit.hora_fim} onChange={(e) => setEdit({ ...edit, hora_fim: e.target.value })} />
              </div>
              <div className="mt-2">
                <Select label="Equipe" value={edit.equipe_id} onChange={(e) => setEdit({ ...edit, equipe_id: e.target.value })}>
                  <option value="">Sem alteração</option>
                  {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
                </Select>
              </div>
              {selecionado.kind === "os" && selecionado.status_base !== "pendente" && (
                <p className="mt-2 text-xs text-amber-600">OS em andamento: somente data e horário podem ser alterados.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
              {selecionado.kind === "os" && selecionado.status_base === "pendente" && (
                <Botao onClick={confirmarOS}>{selecionado.confirmada ? "Desconfirmar" : "Confirmar OS"}</Botao>
              )}
              <Botao onClick={salvarEdicao}>Salvar alterações</Botao>
              {selecionado.kind === "os" ? (
                <Botao variante="secundario" onClick={() => router.push(`/app/gestor/os/${selecionado.id}`)}>Abrir OS</Botao>
              ) : (
                <Botao variante="secundario" onClick={() => abrirHistorico()}>Histórico</Botao>
              )}
              {selecionado.kind === "atividade" && (
                <>
                  {selecionado.status_base === "cancelada" ? (
                    <Botao onClick={reabrirAtividade}>Reabrir atividade</Botao>
                  ) : (
                    <Botao variante="perigo" onClick={cancelarAtividade}>Cancelar atividade</Botao>
                  )}
                  <Botao variante="perigo" onClick={excluirAtividade}>Excluir atividade</Botao>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selecionado.kind === "os" && (
                <>
                  <Botao
                    variante="secundario"
                    onClick={() => {
                      setFormNovo((f) => ({ ...f, tipo: "atividade", data: "", hora_inicio: "", hora_fim: "", cliente_id: selecionado.cliente_id ? String(selecionado.cliente_id) : "", os_id: selecionado.id }));
                      setModal("novo");
                    }}
                  >
                    + Atividade para esta OS
                  </Botao>
                  <Botao variante="secundario" onClick={() => abrirHistorico()}>Histórico</Botao>
                </>
              )}
              <Botao variante="secundario" onClick={() => setModal(null)}>Fechar</Botao>
            </div>
          </div>
        </Modal>
      )}

      {modal === "historico" && histAtivo && (
        <Modal titulo={`Histórico — ${histAtivo.tipo === "os" ? "OS" : "Atividade"} #${histAtivo.id}`} onFechar={() => setModal(null)}>
          {historico === null ? (
            <p className="py-6 text-center text-sm text-zinc-400">Carregando...</p>
          ) : historico.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-400">Nenhuma alteração registrada.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {historico.map((h) => (
                <li key={String(h.id)} className="py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-zinc-700">{String(h.usuario_nome || h.usuario_id || "Sistema")}</span>
                    <span className="text-xs text-zinc-400">{String(h.criado_em || "").slice(0, 16)}</span>
                  </div>
                  <p className="mt-0.5 text-zinc-600">
                    <span className="font-semibold">{String(h.campo).toUpperCase()}:</span>{" "}
                    <span className="text-zinc-400">{String(h.valor_anterior ?? "—")}</span> →{" "}
                    <span className="font-medium">{String(h.valor_novo ?? "—")}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}

      {modal === "conflito" && pendencia && (
        <Modal titulo="Conflito de agenda detectado" onFechar={() => setModal(null)}>
          <p className="mb-3 text-sm text-zinc-600">
            O horário escolhido sobrepõe outros agendamentos do mesmo técnico ou equipe. Confira abaixo antes de confirmar.
          </p>
          <ul className="mb-4 space-y-2">
            {pendencia.conflitos.map((c, i) => (
              <li key={i} className="rounded-md border border-red-200 bg-red-50 p-2 text-sm">
                <span className="font-semibold text-red-700">{c.referencia} — {c.titulo}</span>
                <span className="ml-1 text-red-600">({c.motivo === "tecnico" ? "técnico" : "equipe"}{c.tecnico_nome ? `: ${c.tecnico_nome}` : ""}{c.equipe_nome ? `: ${c.equipe_nome}` : ""})</span>
                <p className="text-xs text-red-500">Ocupado em {c.horario}</p>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Botao variante="perigo" onClick={() => { forcarRef.current = true; setModal(null); pendencia.enviar(); }}>Salvar mesmo assim</Botao>
            <Botao variante="secundario" onClick={() => setModal(null)}>Voltar e ajustar</Botao>
          </div>
        </Modal>
      )}
    </div>
  );
}