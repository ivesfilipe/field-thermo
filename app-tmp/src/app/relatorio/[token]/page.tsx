"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { api, API_URL, mediaUrl, ApiError } from "@/lib/api";
import { Alerta, Badge, Botao, GaleriaFotos } from "@/components/ui";

interface RelatorioPublico {
  id: number;
  token: string;
  status: string;
  data_validacao: string | null;
  recomendacoes: string | null;
  os_numero: string;
  os_servico: string;
  os_descricao: string | null;
  os_prioridade: string;
  data_agendada: string | null;
  responsavel_local: string | null;
  cliente_nome: string;
  local_nome: string | null;
  local_endereco: string | null;
  local_responsavel: string | null;
  equipamento_nome: string | null;
  equipamento_modelo: string | null;
  equipamento_codigo_mt: string | null;
  equipamento_serie: string | null;
  equipamento_patrimonio: string | null;
  diagnostico: string | null;
  causa: string | null;
  servico_executado: string | null;
  observacoes: string | null;
  pendencias: string | null;
  recomendacoes_tecnico: string | null;
  resultado: string | null;
  tecnico_nome: string | null;
  gestor_nome: string | null;
  equipe_nome: string | null;
  atendimento_concluido_em: string | null;
  assinatura: string | null;
  assinatura_nome: string | null;
  assinatura_cargo: string | null;
  assinaturas?: Array<{ id: number; nome: string; cargo: string; arquivo: string; criado_em?: string | null }> | null;
  fotos?: string[];
  anexos: Array<{ id: number; categoria: string; arquivo: string; nome_original: string | null }>;
  avaliacao_token?: string | null;
  avaliacao_status?: string | null;
}

const RESULTADO_LABEL: Record<string, string> = {
  funcionando: "Equipamento em funcionamento",
  com_restricao: "Funcionando com restrição",
  indisponivel: "Equipamento indisponível",
  necessita_retorno: "Necessita retorno técnico",
  necessita_orcamento: "Necessita orçamento"
};

export default function RelatorioPublicoPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [relatorio, setRelatorio] = useState<RelatorioPublico | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!token) return;
    api.get<{ relatorio: RelatorioPublico }>(`/api/comercial/relatorios/publico/${token}`)
      .then((r) => setRelatorio(r.relatorio))
      .catch((e) => setErro(e instanceof ApiError ? e.message : "Erro ao carregar o relatório técnico"));
  }, [token]);

  function abrirPdf() {
    if (!token) return;
    window.open(`${API_URL}/api/comercial/relatorios/publico/${token}/pdf`, "_blank");
  }

  const fotosLista = Array.from(
    new Set([
      ...(relatorio?.fotos || []),
      ...(relatorio?.anexos || []).filter((a) => a.categoria !== "documento").map((a) => a.arquivo)
    ])
  ).map((arq, idx) => ({
    src: mediaUrl(arq),
    legenda: `Foto ${idx + 1}`
  }));

  return (
    <div className="min-h-screen bg-slate-100 pb-12 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-blue-900 bg-blue-950 px-4 py-3 text-white shadow-sm">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="MedicalThermo Herzog" width={150} height={40} priority className="h-auto w-36 object-contain" />
            <div className="hidden border-l border-blue-800 pl-3 sm:block">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Relatório de Atendimento</p>
              {relatorio && <p className="text-sm font-bold text-white">OS {relatorio.os_numero}</p>}
            </div>
          </div>
          {relatorio && (
            <div className="flex items-center gap-2">
              {relatorio.avaliacao_token && relatorio.avaliacao_status === "pendente" && (
                <Link
                  href={`/avaliacao/${relatorio.avaliacao_token}`}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Avaliar Atendimento
                </Link>
              )}
              <Botao onClick={abrirPdf} className="bg-white px-3 py-1.5 text-xs !text-blue-950 hover:bg-blue-50">
                Imprimir / PDF
              </Botao>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto mt-5 max-w-4xl px-4">
        {erro && <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />}

        {!relatorio && !erro && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Carregando documento...
          </div>
        )}

        {relatorio && (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            {/* Cabeçalho do Documento */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-base font-bold text-slate-900">Ordem de Serviço Nº {relatorio.os_numero}</span>
                  <Badge status={relatorio.status || "aprovado"} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{relatorio.os_servico}</p>
              </div>
              <div className="text-right text-xs text-slate-500">
                <p>Data de conclusão: <strong className="text-slate-700">{relatorio.atendimento_concluido_em?.slice(0, 16).replace("T", " ") || relatorio.data_agendada || "-"}</strong></p>
                {relatorio.resultado && (
                  <p className="mt-0.5">Status final: <strong className="text-slate-800">{RESULTADO_LABEL[relatorio.resultado] || relatorio.resultado}</strong></p>
                )}
              </div>
            </div>

            {/* Grade de Identificação */}
            <div className="grid divide-y divide-slate-200 border-b border-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
              <div className="p-4">
                <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">01. Cliente e Local</h2>
                <dl className="grid grid-cols-3 gap-y-1.5 text-xs">
                  <dt className="text-slate-500">Cliente</dt>
                  <dd className="col-span-2 font-semibold text-slate-900">{relatorio.cliente_nome || "-"}</dd>
                  <dt className="text-slate-500">Unidade</dt>
                  <dd className="col-span-2 text-slate-800">{relatorio.local_nome || "-"}</dd>
                  <dt className="text-slate-500">Endereço</dt>
                  <dd className="col-span-2 text-slate-800">{relatorio.local_endereco || "-"}</dd>
                  <dt className="text-slate-500">Responsável</dt>
                  <dd className="col-span-2 font-medium text-slate-900">{relatorio.local_responsavel || relatorio.responsavel_local || "-"}</dd>
                </dl>
              </div>

              <div className="p-4">
                <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">02. Equipamento e Equipe</h2>
                <dl className="grid grid-cols-3 gap-y-1.5 text-xs">
                  <dt className="text-slate-500">Equipamento</dt>
                  <dd className="col-span-2 font-semibold text-slate-900">
                    {relatorio.equipamento_nome ? `${relatorio.equipamento_codigo_mt ? `${relatorio.equipamento_codigo_mt} — ` : ""}${relatorio.equipamento_nome}` : "-"}
                  </dd>
                  <dt className="text-slate-500">Modelo / Série</dt>
                  <dd className="col-span-2 text-slate-800">
                    {relatorio.equipamento_modelo || "-"}{relatorio.equipamento_serie ? ` (Série: ${relatorio.equipamento_serie})` : ""}
                  </dd>
                  <dt className="text-slate-500">Técnico</dt>
                  <dd className="col-span-2 font-medium text-slate-900">{relatorio.tecnico_nome || "-"}</dd>
                  <dt className="text-slate-500">Equipe</dt>
                  <dd className="col-span-2 text-slate-800">{relatorio.equipe_nome || "-"}</dd>
                </dl>
              </div>
            </div>

            {/* Descrição Técnica */}
            <div className="border-b border-slate-200 p-4">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">03. Serviço Executado e Parecer Técnico</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {relatorio.servico_executado || relatorio.os_descricao || "Atendimento técnico executado conforme especificações."}
              </p>
              {(relatorio.diagnostico || relatorio.causa || relatorio.recomendacoes || relatorio.recomendacoes_tecnico || relatorio.pendencias) && (
                <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
                  {relatorio.diagnostico && (
                    <div>
                      <span className="font-semibold text-slate-600">Diagnóstico: </span>
                      <span className="text-slate-800">{relatorio.diagnostico}</span>
                    </div>
                  )}
                  {relatorio.causa && (
                    <div>
                      <span className="font-semibold text-slate-600">Causa: </span>
                      <span className="text-slate-800">{relatorio.causa}</span>
                    </div>
                  )}
                  {(relatorio.recomendacoes || relatorio.recomendacoes_tecnico) && (
                    <div className="sm:col-span-2">
                      <span className="font-semibold text-slate-600">Recomendações: </span>
                      <span className="text-slate-800">{relatorio.recomendacoes || relatorio.recomendacoes_tecnico}</span>
                    </div>
                  )}
                  {relatorio.pendencias && (
                    <div className="sm:col-span-2">
                      <span className="font-semibold text-slate-600">Pendências: </span>
                      <span className="text-slate-800">{relatorio.pendencias}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Registro Fotográfico */}
            {fotosLista.length > 0 && (
              <div className="border-b border-slate-200 p-4">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  04. Registro Fotográfico ({fotosLista.length})
                </h2>
                <GaleriaFotos fotos={fotosLista} tamanho="lg" />
              </div>
            )}

            {/* Assinaturas */}
            <div className="p-4">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {fotosLista.length > 0 ? "05." : "04."} Assinaturas Registradas
              </h2>
              {relatorio.assinaturas && relatorio.assinaturas.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {relatorio.assinaturas.map((ass, idx) => (
                    <div key={ass.id || idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={400} height={140} className="h-16 w-auto rounded border border-slate-200 bg-white" />
                      <p className="mt-2 text-xs font-semibold text-slate-900">
                        {ass.nome || relatorio.assinatura_nome || `Responsável #${idx + 1}`}
                      </p>
                      {ass.cargo && <p className="text-[11px] text-slate-500">{ass.cargo}</p>}
                    </div>
                  ))}
                </div>
              ) : relatorio.assinatura ? (
                <div className="inline-block rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <Image src={mediaUrl(relatorio.assinatura)} alt="Assinatura" width={400} height={140} className="h-16 w-auto rounded border border-slate-200 bg-white" />
                  {relatorio.assinatura_nome && <p className="mt-2 text-xs font-semibold text-slate-900">{relatorio.assinatura_nome}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nenhuma assinatura registrada neste atendimento.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
