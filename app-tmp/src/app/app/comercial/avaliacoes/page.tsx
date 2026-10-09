"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Badge, Card, LinhaVazia, PageHeader, Tabela } from "@/components/ui";

interface Avaliacao {
  id: number;
  os_id: number;
  cliente_id: number;
  status: "pendente" | "respondida";
  nota: number | null;
  resolveu_necessidade: string | null;
  comentario: string | null;
  respondida_em: string | null;
  os_numero: string;
  servico: string;
  data_agendada: string | null;
  cliente_nome: string;
  equipe_nome: string | null;
  executor_nome: string | null;
}

interface ClienteAvaliacao {
  id: number;
  nome: string;
  nota_media: number;
  total: number;
  positivas: number;
  negativas: number;
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

export default function AvaliacoesComercialPage() {
  const [clientes, setClientes] = useState<ClienteAvaliacao[] | null>(null);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [clienteSel, setClienteSel] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    api
      .get<{ clientes: ClienteAvaliacao[]; avaliacoes: Avaliacao[] }>("/api/comercial/avaliacoes")
      .then((r) => {
        setClientes(r.clientes);
        setAvaliacoes(r.avaliacoes);
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  const visiveis = clienteSel ? avaliacoes.filter((a) => a.cliente_id === clienteSel) : avaliacoes;

  return (
    <div className="space-y-4">
      <PageHeader titulo="Avaliações do cliente" descricao="Satisfação por cliente e histórico de avaliações" />
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />

      {clientes === null ? (
        <p className="py-8 text-center text-sm text-zinc-400">Carregando...</p>
      ) : clientes.length === 0 ? (
        <Card title="Clientes"><LinhaVazia texto="Nenhuma avaliação recebida ainda." /></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clientes.map((c) => (
              <button
                key={c.id}
                onClick={() => setClienteSel(clienteSel === c.id ? null : c.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  clienteSel === c.id ? "border-blue-500 bg-blue-50" : "border-zinc-200 bg-white hover:border-blue-300"
                }`}
              >
                <p className="font-semibold text-zinc-900">{c.nome}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Estrelas valor={Math.round(c.nota_media)} />
                  <span className="text-sm font-bold text-zinc-700">{c.nota_media.toFixed(2).replace(".", ",")}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {c.total} avaliação(ões) · {c.positivas} positivas · <span className={c.negativas > 0 ? "font-semibold text-red-600" : ""}>{c.negativas} negativas</span>
                  {c.pendentes > 0 && ` · ${c.pendentes} aguardando`}
                </p>
              </button>
            ))}
          </div>

          <Card title={clienteSel ? "Avaliações do cliente selecionado" : "Histórico de avaliações"}>
            {visiveis.length === 0 ? (
              <LinhaVazia texto="Nenhuma avaliação recebida ainda." />
            ) : (
              <div className="overflow-x-auto">
                <Tabela cabecalhos={["OS", "Cliente", "Equipe", "Status", "Nota", "Resolveu necessidade", "Comentário", "Respondida em"]}>
                  {visiveis.map((a) => (
                    <tr key={a.id}>
                      <td className="font-semibold text-blue-700">{a.os_numero}</td>
                      <td className="font-medium">{a.cliente_nome}</td>
                      <td>{a.equipe_nome || "-"}</td>
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
        </>
      )}
    </div>
  );
}