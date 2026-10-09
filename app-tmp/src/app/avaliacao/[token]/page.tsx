"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { Alerta, Botao } from "@/components/ui";

interface AvaliacaoPendente {
  status: "pendente";
  os: {
    numero: string;
    servico: string;
    descricao: string | null;
    data_agendada: string | null;
    cliente_nome: string;
    equipe_nome: string | null;
  };
  resposta: null;
}

interface AvaliacaoRespondida {
  status: "respondida";
  os: {
    numero: string;
    servico: string;
    descricao: string | null;
    data_agendada: string | null;
    cliente_nome: string;
    equipe_nome: string | null;
  };
  resposta: {
    nota: number;
    resolveu_necessidade: string;
    comentario: string | null;
    respondida_em: string;
  };
}

type Avaliacao = AvaliacaoPendente | AvaliacaoRespondida;

const RESOLVEU_LABEL: Record<string, string> = { sim: "Sim", parcialmente: "Parcialmente", nao: "Não" };

function Estrelas({ valor, aoClicar, tamanho }: { valor: number; aoClicar?: (n: number) => void; tamanho?: string }) {
  const size = tamanho || "h-10 w-10";
  return (
    <div className="flex items-center justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!aoClicar}
          onClick={() => aoClicar?.(n)}
          className={aoClicar ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
        >
          <svg viewBox="0 0 24 24" className={`${size} ${n <= valor ? "fill-amber-400" : "fill-zinc-300"}`}>
            <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.53 1.13 6.7L12 17.02l-5.88 3.48 1.13-6.7L2.5 9.27l6.6-1.01L12 2z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function AvaliacaoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState(0);
  const [resolveu, setResolveu] = useState("");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.get<{ avaliacao: Avaliacao }>(`/api/avaliacao/${token}`)
      .then((r) => setAvaliacao(r.avaliacao))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Erro ao carregar a avaliação"));
  }, [token]);

  async function enviar() {
    setErro("");
    setEnviando(true);
    try {
      const r = await api.post<{ avaliacao: Avaliacao }>(`/api/avaliacao/${token}`, {
        nota,
        resolveu_necessidade: resolveu,
        comentario: comentario.trim() || undefined
      });
      setAvaliacao(r.avaliacao);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao enviar a avaliação");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-blue-950 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Image src="/logo.png" alt="Logo MedicalThermo Herzog" width={224} height={59} priority className="h-auto w-56 max-w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">Thermo control</h1>
          <p className="mt-1 text-sm text-blue-100/80">MedicalThermo Herzog</p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          {erro && <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />}

          {!avaliacao && !erro && (
            <p className="py-8 text-center text-sm text-zinc-500">Carregando avaliação...</p>
          )}

          {avaliacao?.status === "respondida" && (
            <div className="space-y-4 text-center">
              <h2 className="text-lg font-bold text-zinc-900">Avaliação registrada</h2>
              <p className="text-sm text-zinc-500">
                Obrigado por avaliar o atendimento da OS {avaliacao.os.numero}.
              </p>
              <div className="inline-flex flex-col items-center gap-1 rounded-xl bg-amber-50 px-6 py-4">
                <Estrelas valor={avaliacao.resposta.nota} tamanho="h-8 w-8" />
                <span className="text-xs text-zinc-600">
                  {avaliacao.resposta.resolveu_necessidade === "sim" ? "O serviço resolveu a necessidade" : `Resolveu a necessidade: ${RESOLVEU_LABEL[avaliacao.resposta.resolveu_necessidade]}`}
                </span>
              </div>
              {avaliacao.resposta.comentario && (
                <p className="rounded-lg bg-zinc-50 p-3 text-sm italic text-zinc-600">“{avaliacao.resposta.comentario}”</p>
              )}
            </div>
          )}

          {avaliacao?.status === "pendente" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Avalie o atendimento</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  OS {avaliacao.os.numero} — {avaliacao.os.cliente_nome}
                </p>
                <p className="text-sm font-medium text-zinc-700">{avaliacao.os.servico}</p>
                {avaliacao.os.descricao && <p className="mt-1 text-xs text-zinc-400">{avaliacao.os.descricao}</p>}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-700">Como você avalia o serviço?</p>
                <Estrelas valor={nota} aoClicar={setNota} />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-700">O serviço resolveu sua necessidade?</p>
                <div className="flex flex-wrap gap-2">
                  {["sim", "parcialmente", "nao"].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setResolveu(op)}
                      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                        resolveu === op
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-zinc-300 text-zinc-700 hover:border-blue-400"
                      }`}
                    >
                      {RESOLVEU_LABEL[op]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-zinc-700">Comentário (opcional)</label>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Conte como foi o atendimento..."
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <Botao
                className="w-full py-2.5"
                disabled={enviando || nota === 0 || !resolveu}
                onClick={enviar}
              >
                {enviando ? "Enviando..." : "Enviar avaliação"}
              </Botao>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-blue-200/60">Avaliação vinculada à ordem de serviço — Thermo control</p>
      </div>
    </div>
  );
}