"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, EstadoVazio, LinksMapa, Loading, PageHeader, Prioridade } from "@/components/ui";

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
  os_id?: number | null;
  observacoes?: string | null;
}

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

function fmtData(d: string | null): string {
  if (!d) return "-";
  const [a, m, di] = d.split("-");
  const hoje = new Date();
  const hj = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  if (d === hj) return `Hoje (${di}/${m})`;
  return `${di}/${m}/${a}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COR[status] || "bg-zinc-100 text-zinc-700"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export default function MinhaAgendaPage() {
  const router = useRouter();
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalhe, setDetalhe] = useState<AgendaItem | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [iniciando, setIniciando] = useState<number | null>(null);

  const carregar = useCallback(() => {
    api.get<{ agenda: AgendaItem[] }>(`/api/tecnico/agenda?data_inicio=${data}&data_fim=${data}`)
      .then((r) => setAgenda(r.agenda))
      .catch(() => setAgenda([]));
  }, [data]);

  useEffect(carregar, [carregar]);

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

  const grupos = new Map<string, AgendaItem[]>();
  for (const item of agenda || []) {
    const chave = item.data || "sem-data";
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(item);
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader titulo="Minha Agenda" descricao="Suas ordens de serviço e atividades programadas" />

      <Card title="Dia exibido">
        <div className="max-w-xs">
          <Campo label="Data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
      </Card>

      {agenda === null ? (
        <Loading />
      ) : agenda.length === 0 ? (
        <Card title="Minha Agenda">
          <EstadoVazio texto="Nenhuma OS ou atividade agendada." />
        </Card>
      ) : (
        <div className="space-y-4">
          {Array.from(grupos.entries()).map(([data, itens]) => (
            <div key={data}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{fmtData(data)}</p>
              <div className="space-y-2">
                {itens.map((item) => {
                  const podeIniciar = item.kind === "os" && ["pendente", "em_andamento"].includes(item.status);
                  const continuar = item.kind === "os" && item.status === "em_andamento";
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      onClick={() => setDetalhe(item)}
                      className={`w-full cursor-pointer rounded-xl border bg-white p-3 text-left shadow-sm transition-colors ${
                        item.status === "atrasada" ? "border-red-200 bg-red-50 hover:border-red-300" : "border-zinc-200 hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${item.kind === "os" ? "bg-blue-500" : "bg-emerald-500"}`} />
                          <span className="truncate font-semibold text-blue-700">{item.referencia}</span>
                        </div>
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-1 text-sm font-medium">{item.titulo}</p>
                      <p className="text-xs text-zinc-500">
                        {item.hora_inicio ? `${item.hora_inicio}${item.hora_fim ? `–${item.hora_fim}` : ""}` : "Dia inteiro"}
                        {item.cliente_nome ? ` · ${item.cliente_nome}` : ""}
                        {item.local_nome ? ` · ${item.local_nome}` : ""}
                      </p>
                      {item.local_endereco_completo || item.local_endereco && (
                        <p className="mt-0.5 text-xs text-zinc-600">
                          {item.local_endereco_completo || item.local_endereco}
                          <LinksMapa endereco={item.local_endereco_completo || item.local_endereco} pararPropagacao />
                        </p>
                      )}
                      {item.prioridade && (
                        <div className="mt-1.5"><Prioridade p={item.prioridade} /></div>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        {item.kind === "os" && (
                          podeIniciar ? (
                            <Botao
                              variante={continuar ? "primario" : "sucesso"}
                              disabled={iniciando === item.id}
                              onClick={() => iniciarAtendimento(item)}
                            >
                              {iniciando === item.id ? "Iniciando..." : continuar ? "Continuar atendimento" : "Iniciar atendimento"}
                            </Botao>
                          ) : (
                            <Botao onClick={() => router.push(`/app/tecnico/os/${item.id}`)}>Abrir OS</Botao>
                          )
                        )}
                        <Botao variante="secundario" onClick={() => setDetalhe(item)}>Ver detalhes</Botao>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {detalhe && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setDetalhe(null)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">{detalhe.referencia}</h3>
              <button onClick={() => setDetalhe(null)} className="rounded p-1 text-zinc-400 hover:bg-zinc-100">×</button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <StatusBadge status={detalhe.status} />
              {detalhe.prioridade && <Prioridade p={detalhe.prioridade} />}
            </div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Data</dt><dd>{fmtData(detalhe.data)}</dd>
              <dt className="text-zinc-500">Horário</dt>
              <dd>{detalhe.hora_inicio ? `${detalhe.hora_inicio}${detalhe.hora_fim ? `–${detalhe.hora_fim}` : ""}` : "Dia inteiro"}</dd>
              <dt className="text-zinc-500">Cliente</dt><dd>{detalhe.cliente_nome || "-"}</dd>
              <dt className="text-zinc-500">Local</dt><dd>{detalhe.local_nome || "-"}</dd>
              <dt className="text-zinc-500">Endereço</dt>
              <dd>
                {detalhe.local_endereco_completo || detalhe.local_endereco || "-"}
                {detalhe.local_endereco_completo || detalhe.local_endereco && (
                  <LinksMapa endereco={detalhe.local_endereco_completo || detalhe.local_endereco} />
                )}
              </dd>
              <dt className="text-zinc-500">Equipamento</dt><dd>{detalhe.equipamento_nome || "-"}</dd>
              {detalhe.descricao && <dt className="text-zinc-500">Tipo</dt>}
              {detalhe.descricao && <dd>{detalhe.descricao}</dd>}
            </dl>
            {detalhe.observacoes && <p className="mt-3 text-sm text-zinc-600">{detalhe.observacoes}</p>}
            <div className="mt-4 flex flex-col gap-2">
              {detalhe.kind === "os" && (
                <Botao
                  onClick={() => {
                    setDetalhe(null);
                    router.push(`/app/tecnico/os/${detalhe.id}`);
                  }}
                >
                  Abrir OS
                </Botao>
              )}
              <Botao variante="secundario" onClick={() => setDetalhe(null)}>Fechar</Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}