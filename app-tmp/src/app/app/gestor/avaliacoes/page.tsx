"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Badge, Card, LinhaVazia, PageHeader, Tabela } from "@/components/ui";

interface Avaliacao {
  id: number;
  os_id: number;
  token: string;
  status: "pendente" | "respondida";
  nota: number | null;
  resolveu_necessidade: "sim" | "parcialmente" | "nao" | null;
  comentario: string | null;
  respondida_em: string | null;
  criado_em: string;
  os_numero: string;
  servico: string;
  data_agendada: string | null;
  cliente_nome: string;
  equipe_nome: string | null;
  executor_nome: string | null;
  atendimento_concluido_em: string | null;
}

interface Indicadores {
  nota_media: number;
  total: number;
  n5: number;
  n4: number;
  n3: number;
  n12: number;
  pendentes: number;
}

const RESOLVEU_LABEL: Record<string, string> = { sim: "Sim", parcialmente: "Parcialmente", nao: "Não" };

function Estrelas({ valor }: { valor: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <svg key={n} viewBox="0 0 24 24" className={`h-4 w-4 ${n <= valor ? "fill-amber-400" : "fill-zinc-300"}`}>
          <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.53 1.13 6.7L12 17.02l-5.88 3.48 1.13-6.7L2.5 9.27l6.6-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function CartaoIndicador({ rotulo, valor, destaque }: { rotulo: string; valor: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
      <p className="text-xs font-medium text-zinc-500">{rotulo}</p>
      <p className={`mt-1 text-2xl font-bold ${destaque ? "text-red-600" : "text-zinc-900"}`}>{valor}</p>
    </div>
  );
}

export default function AvaliacoesGestorPage() {
  const router = useRouter();
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[] | null>(null);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api
      .get<{ avaliacoes: Avaliacao[]; indicadores: Indicadores }>(`/api/gestor/avaliacoes${filtro ? `?status=${filtro}` : ""}`)
      .then((r) => {
        setAvaliacoes(r.avaliacoes);
        setIndicadores(r.indicadores);
      })
      .catch((e) => setErro(e.message));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  return (
    <div className="space-y-4">
      <PageHeader titulo="Avaliações do cliente" descricao="Acompanhe as avaliações vinculadas a cada ordem de serviço" />
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />

      {indicadores && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <CartaoIndicador rotulo="Nota média" valor={indicadores.nota_media.toFixed(2).replace(".", ",")} />
          <CartaoIndicador rotulo="Total" valor={indicadores.total} />
          <CartaoIndicador rotulo="5 estrelas" valor={indicadores.n5} />
          <CartaoIndicador rotulo="4 estrelas" valor={indicadores.n4} />
          <CartaoIndicador rotulo="3 estrelas" valor={indicadores.n3} />
          <CartaoIndicador rotulo="1–2 estrelas" valor={indicadores.n12} destaque={indicadores.n12 > 0} />
        </div>
      )}

      <Card title="Avaliações">
        <div className="mb-3 flex gap-2">
          {[
            { v: "", l: "Todas" },
            { v: "pendente", l: "Aguardando" },
            { v: "respondida", l: "Respondidas" }
          ].map((op) => (
            <button
              key={op.v}
              onClick={() => setFiltro(op.v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filtro === op.v ? "border-blue-600 bg-blue-600 text-white" : "border-zinc-300 text-zinc-600 hover:border-blue-400"
              }`}
            >
              {op.l}
            </button>
          ))}
        </div>
        {avaliacoes === null ? (
          <p className="py-8 text-center text-sm text-zinc-400">Carregando...</p>
        ) : avaliacoes.length === 0 ? (
          <LinhaVazia texto="Nenhuma avaliação encontrada." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela cabecalhos={["OS", "Cliente", "Equipe", "Executor", "Status", "Nota", "Resolveu necessidade", "Comentário", "Respondida em"]}>
              {avaliacoes.map((a) => (
                <tr key={a.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/gestor/os/${a.os_id}`)}>
                  <td className="font-semibold text-blue-700">{a.os_numero}</td>
                  <td className="font-medium">{a.cliente_nome}</td>
                  <td>{a.equipe_nome || "-"}</td>
                  <td>{a.executor_nome || "-"}</td>
                  <td><Badge status={a.status} /></td>
                  <td>
                    {a.status === "respondida" && a.nota !== null ? (
                      <span className="flex items-center gap-1.5">
                        <Estrelas valor={a.nota} />
                        <span className={`text-xs font-bold ${a.nota <= 2 ? "text-red-600" : "text-zinc-700"}`}>{a.nota}/5</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td>{a.status === "respondida" && a.resolveu_necessidade ? RESOLVEU_LABEL[a.resolveu_necessidade] : "—"}</td>
                  <td className="max-w-[220px] truncate text-zinc-500">{a.comentario || "—"}</td>
                  <td className="text-xs text-zinc-500">{a.respondida_em?.slice(0, 16) || "—"}</td>
                </tr>
              ))}
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  );
}