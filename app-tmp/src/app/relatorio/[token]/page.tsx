"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { api, API_URL, mediaUrl, ApiError } from "@/lib/api";
import { Alerta, Badge, Botao, Card, GaleriaFotos } from "@/components/ui";

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
  funcionando: "Equipamento funcionando",
  com_restricao: "Funcionando com restrição",
  indisponivel: "Equipamento indisponível",
  necessita_retorno: "Necessita retorno",
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
    legenda: `Registro fotográfico #${idx + 1}`
  }));

  return (
    <div className="min-h-screen bg-zinc-50 pb-12 text-zinc-900">
      <div className="border-b border-blue-900 bg-blue-950 px-4 py-6 text-white shadow-sm">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image src="/logo.png" alt="Logo MedicalThermo Herzog" width={180} height={48} priority className="h-auto w-44 object-contain" />
            <div>
              <h1 className="text-lg font-bold text-white">Relatório Técnico de Atendimento</h1>
              <p className="text-xs text-blue-200">Thermo control — MedicalThermo Herzog</p>
            </div>
          </div>
          {relatorio && (
            <Botao onClick={abrirPdf} className="bg-white !text-blue-950 hover:bg-blue-50">
              Baixar / Imprimir Relatório (PDF)
            </Botao>
          )}
        </div>
      </div>

      <div className="mx-auto mt-6 max-w-3xl space-y-4 px-4">
        {erro && <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />}

        {!relatorio && !erro && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
            Carregando relatório técnico...
          </div>
        )}

        {relatorio && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-950">OS {relatorio.os_numero}</span>
                  <Badge status={relatorio.status || "aprovado"} />
                </div>
                <p className="mt-0.5 text-sm text-zinc-600">{relatorio.os_servico}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao onClick={abrirPdf}>Baixar / Imprimir PDF</Botao>
                {relatorio.avaliacao_token && relatorio.avaliacao_status === "pendente" && (
                  <Link
                    href={`/avaliacao/${relatorio.avaliacao_token}`}
                    className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
                  >
                    Avaliar atendimento
                  </Link>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Identificação do Cliente e Local">
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-zinc-500">Cliente</dt><dd className="font-medium">{relatorio.cliente_nome || "-"}</dd>
                  <dt className="text-zinc-500">Local / Unidade</dt><dd>{relatorio.local_nome || "-"}</dd>
                  <dt className="text-zinc-500">Endereço</dt><dd>{relatorio.local_endereco || "-"}</dd>
                  <dt className="text-zinc-500">Responsável no local</dt><dd className="font-medium">{relatorio.local_responsavel || relatorio.responsavel_local || "-"}</dd>
                  {relatorio.equipamento_nome && (
                    <>
                      <dt className="text-zinc-500">Equipamento</dt>
                      <dd>{relatorio.equipamento_codigo_mt ? `${relatorio.equipamento_codigo_mt} — ` : ""}{relatorio.equipamento_nome}</dd>
                    </>
                  )}
                  {relatorio.equipamento_modelo && (
                    <>
                      <dt className="text-zinc-500">Modelo / Série</dt>
                      <dd>{relatorio.equipamento_modelo}{relatorio.equipamento_serie ? ` (${relatorio.equipamento_serie})` : ""}</dd>
                    </>
                  )}
                </dl>
              </Card>

              <Card title="Dados da Execução">
                <dl className="grid grid-cols-2 gap-y-2 text-sm">
                  <dt className="text-zinc-500">Técnico responsável</dt><dd className="font-medium">{relatorio.tecnico_nome || "-"}</dd>
                  <dt className="text-zinc-500">Equipe</dt><dd>{relatorio.equipe_nome || "-"}</dd>
                  <dt className="text-zinc-500">Data do atendimento</dt><dd>{relatorio.atendimento_concluido_em?.slice(0, 16).replace("T", " ") || relatorio.data_agendada || "-"}</dd>
                  <dt className="text-zinc-500">Validado por</dt><dd>{relatorio.gestor_nome || "Gestão Técnica"}</dd>
                  {relatorio.resultado && (
                    <>
                      <dt className="text-zinc-500">Resultado</dt>
                      <dd className="font-medium">{RESULTADO_LABEL[relatorio.resultado] || relatorio.resultado}</dd>
                    </>
                  )}
                </dl>
              </Card>
            </div>

            <Card title="Descrição do Serviço Realizado">
              <p className="whitespace-pre-wrap text-sm text-zinc-800">
                {relatorio.servico_executado || relatorio.os_descricao || "Atendimento técnico executado conforme especificações."}
              </p>
              {relatorio.diagnostico && (
                <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
                  <strong>Diagnóstico:</strong> {relatorio.diagnostico}
                </p>
              )}
              {(relatorio.recomendacoes || relatorio.recomendacoes_tecnico) && (
                <p className="mt-2 text-sm text-zinc-700">
                  <strong>Recomendações:</strong> {relatorio.recomendacoes || relatorio.recomendacoes_tecnico}
                </p>
              )}
            </Card>

            {fotosLista.length > 0 && (
              <Card title={`Registro Fotográfico (${fotosLista.length}) — Clique na foto para abrir`}>
                <GaleriaFotos fotos={fotosLista} tamanho="lg" />
              </Card>
            )}

            <Card title="Assinaturas dos Responsáveis">
              {relatorio.assinaturas && relatorio.assinaturas.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {relatorio.assinaturas.map((ass, idx) => (
                    <div key={ass.id || idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={600} height={212} className="h-20 w-auto rounded-md border border-zinc-200 bg-white" />
                      <p className="mt-2 text-sm font-medium text-zinc-800">
                        {ass.nome || relatorio.assinatura_nome || `Responsável #${idx + 1}`}
                        {ass.cargo ? ` (${ass.cargo})` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : relatorio.assinatura ? (
                <div>
                  <Image src={mediaUrl(relatorio.assinatura)} alt="Assinatura" width={600} height={212} className="h-20 w-auto rounded-md border border-zinc-200 bg-white" />
                  {relatorio.assinatura_nome && <p className="mt-2 text-sm font-medium">{relatorio.assinatura_nome}</p>}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Sem assinatura anexada.</p>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

