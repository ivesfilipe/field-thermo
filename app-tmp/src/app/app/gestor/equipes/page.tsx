"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Badge, Card, EstadoVazio, Loading, PageHeader } from "@/components/ui";

interface Tecnico {
  id: number;
  nome: string;
  email: string;
}

interface Stats {
  os_total: number;
  os_pendentes: number;
  os_em_andamento: number;
  os_aguardando_validacao: number;
  os_concluidas: number;
  os_atrasadas: number;
  atv_total: number;
  atv_agendadas: number;
  atv_em_andamento: number;
  atv_concluidas: number;
}

interface HistoricoItem {
  tipo: string;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  usuario_nome: string | null;
  criado_em: string;
}

interface Equipe {
  id: number;
  nome: string;
  descricao: string | null;
  total_tecnicos: number;
  tecnicos: Tecnico[];
  stats: Stats;
  ultimasAtividades: HistoricoItem[];
}

const TIPO_LABEL: Record<string, string> = {
  os: "Ordem de serviço",
  atividade: "Atividade",
  relatorio: "Relatório",
  oportunidade: "Oportunidade",
  execucao: "Execução"
};

function fmtDataHora(iso: string): string {
  if (!iso) return "-";
  const partes = iso.replace("T", " ").split(/[ :]/);
  if (partes.length >= 3) {
    const [a, m, d, h, mi] = partes;
    return `${d}/${m}/${a} ${h}:${mi}`;
  }
  return iso;
}

function StatChip({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
      <span className={`text-lg font-bold ${cor}`}>{valor}</span>
      <span className="text-[11px] text-zinc-500">{rotulo}</span>
    </div>
  );
}

export default function GestorEquipesPage() {
  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [erro, setErro] = useState("");
  const [equipeSelecionada, setEquipeSelecionada] = useState<Equipe | null>(null);

  const carregar = useCallback(() => {
    api
      .get<{ equipes: Equipe[] }>("/api/gestor/equipes/atividades")
      .then((r) => setEquipes(r.equipes))
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <PageHeader titulo="Equipes" descricao="Acompanhe as atividades e o desempenho de cada equipe" />

      {equipes === null ? (
        <Loading />
      ) : equipes.length === 0 ? (
        <Card title="Equipes">
          <EstadoVazio texto="Nenhuma equipe cadastrada. Crie equipes para acompanhar as atividades dos técnicos." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {equipes.map((eq) => (
            <Card
              key={eq.id}
              title={eq.nome}
              acao={
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                  {eq.total_tecnicos} técnico{eq.total_tecnicos === 1 ? "" : "s"}
                </span>
              }
            >
              <div className="space-y-3">
                {eq.descricao && <p className="text-sm text-zinc-500">{eq.descricao}</p>}

                <div className="grid grid-cols-3 gap-2">
                  <StatChip valor={eq.stats.os_pendentes} rotulo="OS pendentes" cor="text-amber-600" />
                  <StatChip valor={eq.stats.os_em_andamento} rotulo="OS em andamento" cor="text-blue-600" />
                  <StatChip valor={eq.stats.os_aguardando_validacao} rotulo="Aguardando validação" cor="text-violet-600" />
                  <StatChip valor={eq.stats.os_atrasadas} rotulo="OS atrasadas" cor="text-red-600" />
                  <StatChip valor={eq.stats.os_concluidas} rotulo="OS concluídas" cor="text-emerald-600" />
                  <StatChip valor={eq.stats.atv_em_andamento} rotulo="Atividades em andamento" cor="text-blue-600" />
                </div>

                {eq.tecnicos.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Membros</p>
                    <div className="flex flex-wrap gap-1.5">
                      {eq.tecnicos.map((t) => (
                        <span key={t.id} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700">
                          {t.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setEquipeSelecionada(eq)}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  Ver atividades recentes
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {equipeSelecionada && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-start sm:p-6 sm:pt-16" onClick={() => setEquipeSelecionada(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-3.5">
              <h3 className="text-base font-semibold text-zinc-900">Atividades recentes - {equipeSelecionada.nome}</h3>
              <button onClick={() => setEquipeSelecionada(null)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              {equipeSelecionada.ultimasAtividades.length === 0 ? (
                <EstadoVazio texto="Nenhuma atividade registrada ainda." />
              ) : (
                <ol className="relative space-y-4 border-l border-zinc-200 pl-4">
                  {equipeSelecionada.ultimasAtividades.map((h, i) => (
                    <li key={i} className="relative">
                      <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-blue-600" />
                      <div className="flex items-center gap-2">
                        <Badge status={h.campo === "status" ? h.valor_novo || "" : h.tipo} />
                        <span className="text-xs text-zinc-400">{fmtDataHora(h.criado_em)}</span>
                      </div>
                      <p className="mt-0.5 text-sm text-zinc-700">
                        <span className="font-medium">{h.usuario_nome || "Usuário"}</span> · {TIPO_LABEL[h.tipo] || h.tipo}
                        {h.campo && <> · {h.campo}</>}
                      </p>
                      {(h.valor_anterior || h.valor_novo) && (
                        <p className="text-xs text-zinc-500">
                          {h.valor_anterior && <span className="line-through opacity-60">{h.valor_anterior}</span>}
                          {h.valor_anterior && h.valor_novo && " → "}
                          {h.valor_novo}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
