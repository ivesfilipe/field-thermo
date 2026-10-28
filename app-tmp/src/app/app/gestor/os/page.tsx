"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Select, Tabela } from "@/components/ui";

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
  prioridade: string;
  status: string;
}

interface Cliente { id: number; nome: string }
interface Equipe { id: number; nome: string }

const ABAS_STATUS = [
  { v: "", l: "Todas" },
  { v: "pendente", l: "Pendentes" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "aguardando_validacao", l: "Aguardando validação" },
  { v: "concluida", l: "Concluídas" },
  { v: "cancelada", l: "Canceladas" }
];

export default function OsPage() {
  const router = useRouter();
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtro, setFiltro] = useState({
    busca: "", status: "", cliente_id: "", equipe_id: "", prioridade: "", data_inicio: "", data_fim: ""
  });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro.busca) params.set("busca", filtro.busca);
    if (filtro.status) params.set("status", filtro.status);
    if (filtro.cliente_id) params.set("cliente_id", filtro.cliente_id);
    if (filtro.equipe_id) params.set("equipe_id", filtro.equipe_id);
    if (filtro.prioridade) params.set("prioridade", filtro.prioridade);
    if (filtro.data_inicio) params.set("data_inicio", filtro.data_inicio);
    if (filtro.data_fim) params.set("data_fim", filtro.data_fim);
    const qs = params.toString();
    api.get<{ ordens: OS[] }>(`/api/gestor/os${qs ? `?${qs}` : ""}`).then((r) => setOrdens(r.ordens)).catch(() => setOrdens([]));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    api.get<{ clientes: Cliente[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch(() => {});
    api.get<{ equipes: Equipe[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  const temFiltro = Object.values(filtro).some((v) => v !== "");

  const excluir = async (o: OS) => {
    const permitido = ["pendente", "cancelada", "aguardando_validacao", "concluida"].includes(o.status);
    const bloqueado = o.status === "em_andamento" ? " Esta OS está em andamento: cancele-a antes de excluir." : "";
    if (!window.confirm(`Excluir a OS ${o.numero} (${o.servico})?\nEsta ação apaga execução, anexos, relatório e histórico.${bloqueado}`)) return;
    if (!permitido) return;
    try {
      await api.del(`/api/gestor/os/${o.id}`);
      setOrdens((atual) => (atual ? atual.filter((x) => x.id !== o.id) : atual));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Erro ao excluir a OS");
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Ordens de Serviço"
        descricao="Acompanhe, filtre por status e gerencie as ordens de serviço"
        acoes={<Botao onClick={() => router.push("/app/gestor/os/nova")}>+ Nova OS</Botao>}
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
                onClick={() => setFiltro({ busca: "", status: "", cliente_id: "", equipe_id: "", prioridade: "", data_inicio: "", data_fim: "" })}
              >
                Limpar
              </Botao>
            )}
          </div>
        </div>

        {mostrarFiltros && (
          <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 md:grid-cols-5">
            <Select label="Prioridade" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
              <option value="">Todas</option>
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </Select>
            <Select label="Cliente" value={filtro.cliente_id} onChange={(e) => setFiltro({ ...filtro, cliente_id: e.target.value })}>
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Equipe" value={filtro.equipe_id} onChange={(e) => setFiltro({ ...filtro, equipe_id: e.target.value })}>
              <option value="">Todas</option>
              {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
            </Select>
            <Campo label="Período (de)" type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} />
            <Campo label="Período (até)" type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} />
          </div>
        )}
      </div>

      <Card title={`Ordens encontradas (${ordens?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nº", "Cliente", "Local", "Serviço", "Equipe", "Data", "Prioridade", "Status", ""]}>
          {ordens === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : ordens.length === 0 ? (
            <LinhaVazia texto="Nenhuma ordem de serviço encontrada." />
          ) : (
            ordens.map((o) => (
              <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/gestor/os/${o.id}`)}>
                <td className="px-3 py-2 font-medium text-blue-700">{o.numero}</td>
                <td className="px-3 py-2">{o.cliente_nome}</td>
                <td className="hidden px-3 py-2 md:table-cell">
                  {o.local_nome || "-"}
                  {(o.local_endereco_completo || o.local_endereco) && (
                    <span className="block text-xs text-zinc-500">
                      {o.local_endereco_completo || o.local_endereco}
                      <LinksMapa endereco={(o.local_endereco_completo || o.local_endereco)!} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{o.servico}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{o.equipe_nome || "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">{o.data_agendada || "-"}</td>
                <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                <td className="px-3 py-2"><Badge status={o.status} /></td>
                <td className="px-3 py-2">
                  {o.status !== "em_andamento" && (
                    <span onClick={(e) => e.stopPropagation()}>
                      <Botao
                        variante="perigo"
                        className="px-2 py-1 text-xs"
                        onClick={() => excluir(o)}
                      >
                        Excluir
                      </Botao>
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>
    </div>
  );
}
