

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api, mediaUrl, API_URL, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alerta, Badge, Botao, Campo, Card, GaleriaFotos, LinksMapa, Select, Textarea } from "@/components/ui";

interface Oportunidade {
  id: number;
  status: string;
  descricao: string;
  valor_estimado: number | null;
  data_contato: string | null;
  resultado_contato: string | null;
  proposta_vinculada: string | null;
  previsao_fechamento: string | null;
  responsavel: string | null;
}

interface Relatorio {
  id: number;
  token?: string | null;
  status: string;
  data_validacao: string | null;
  recomendacoes: string | null;
  enviado_comercial: number;
  enviado_comercial_em: string | null;
  aberto_por: number | null;
  aberto_em: string | null;
  os_numero: string;
  os_servico: string;
  os_descricao: string | null;
  os_prioridade: string;
  data_agendada: string | null;
  responsavel_local: string | null;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_responsavel: string | null;
  local_responsavel_telefone: string | null;
  local_responsavel_email?: string | null;
  equipamento_nome: string | null;
  equipamento_modelo: string | null;
  equipamento_serie: string | null;
  equipamento_capacidade: string | null;
  equipamento_patrimonio: string | null;
  diagnostico: string | null;
  causa: string | null;
  servico_executado: string | null;
  observacoes: string | null;
  condicao_sintomas: string | null;
  condicao_equipamento: string | null;
  condicao_observacoes: string | null;
  pendencias: string | null;
  recomendacoes_tecnico: string | null;
  resultado: string | null;
  medicoes: Array<{ tipo: string; unidade: string; valor: string; observacao: string }>;
  atividades_executadas: Array<{ titulo: string; resultado: string; observacao: string }>;
  assinatura: string | null;
  assinatura_nome: string | null;
  assinatura_cargo: string | null;
  assinaturas?: Array<{ id: number; nome: string; cargo: string; arquivo: string; criado_em?: string | null }> | null;
  tecnico_nome: string | null;
  gestor_nome: string | null;
  atendimento_concluido_em: string | null;
  necessidade_adicional: string | null;
  necessidade_descricao: string | null;
  tipo_necessidade_label: string | null;
  fotos: string[];
  anexos: Array<{ id: number; categoria: string; arquivo: string; nome_original: string | null }>;
  conteudo: unknown;
  oportunidade: Oportunidade | null;
}

const RESULTADO_LABEL: Record<string, string> = {
  funcionando: "Equipamento funcionando",
  com_restricao: "Funcionando com restrição",
  indisponivel: "Equipamento indisponível",
  necessita_retorno: "Necessita retorno",
  necessita_orcamento: "Necessita orçamento"
};

interface HistoricoItem {
  id: number;
  tipo: string;
  usuario_nome: string | null;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  criado_em: string;
}

const STATUS_COMERCIAL = [
  { v: "novo", l: "Novo relatório" },
  { v: "em_analise", l: "Em análise" },
  { v: "necessita_contato", l: "Necessita contato" },
  { v: "necessita_informacao", l: "Necessita informação adicional" },
  { v: "proposta_elaboracao", l: "Proposta em elaboração" },
  { v: "proposta_enviada", l: "Proposta enviada" },
  { v: "em_negociacao", l: "Em negociação" },
  { v: "aprovado", l: "Aprovado" },
  { v: "perdido", l: "Perdido" },
  { v: "sem_oportunidade", l: "Sem oportunidade" }
];

const CAMPO_LABEL: Record<string, string> = {
  status: "Status comercial",
  descricao: "Observações comerciais",
  valor_estimado: "Valor da oportunidade",
  data_contato: "Data do contato",
  resultado_contato: "Resultado do contato",
  proposta_vinculada: "Proposta vinculada",
  previsao_fechamento: "Previsão de fechamento",
  finalizacao_tecnico: "Finalização do técnico",
  validacao: "Validação do gestor",
  envio_comercial: "Envio ao comercial",
  complemento: "Complemento solicitado",
  criacao_automatica: "Oportunidade criada automaticamente",
  criacao: "Criação",
  exclusao: "Exclusão"
};

function formatarData(d: string | null | undefined): string {
  if (!d) return "-";
  return d.slice(0, 16).replace("T", " ");
}

export default function RelatorioDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { usuario } = useAuth();
  const ehComercial = usuario?.perfil === "comercial";
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ status: "novo", valor_estimado: "", data_contato: "", resultado_contato: "", proposta_vinculada: "", previsao_fechamento: "", descricao: "" });
  const [salvando, setSalvando] = useState(false);
  const [linkRelatorio, setLinkRelatorio] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);

  const caminhoRelatorio = linkRelatorio || (relatorio?.token ? `/relatorio/${relatorio.token}` : null);

  function urlRelatorio(): string {
    return `${window.location.origin}${caminhoRelatorio || ""}`;
  }

  async function gerarLinkRelatorio() {
    if (!relatorio) return;
    setErro("");
    setMsg("");
    setGerandoLink(true);
    try {
      const r = await api.post<{ relatorio: { link: string } }>(`/api/comercial/relatorios/${relatorio.id}/link`);
      setLinkRelatorio(r.relatorio.link);
      setMsg("Link do relatório pronto para envio ao responsável do local.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setGerandoLink(false);
    }
  }

  async function copiarLinkRelatorio() {
    try {
      await navigator.clipboard.writeText(urlRelatorio());
      setMsg("Link do relatório copiado para a área de transferência.");
    } catch {
      setErro("Não foi possível copiar o link automaticamente.");
    }
  }

  function linkWhatsAppRelatorio(): string {
    const telRaw = (relatorio?.local_responsavel_telefone || relatorio?.cliente_telefone || "").replace(/\D/g, "");
    const tel = telRaw ? (telRaw.length <= 11 ? `55${telRaw}` : telRaw) : "";
    const resp = relatorio?.local_responsavel || relatorio?.responsavel_local || relatorio?.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const texto = encodeURIComponent(`${saudacao} Segue o relatório técnico do atendimento da OS ${relatorio?.os_numero} (${relatorio?.local_nome || relatorio?.cliente_nome || "Thermo Control"}): ${urlRelatorio()}`);
    return tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  }

  function linkEmailRelatorio(): string {
    const email = relatorio?.local_responsavel_email || relatorio?.cliente_email || "";
    const resp = relatorio?.local_responsavel || relatorio?.responsavel_local || relatorio?.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const assunto = encodeURIComponent(`Relatório Técnico - OS ${relatorio?.os_numero}`);
    const corpo = encodeURIComponent(`${saudacao}\n\nSegue o link para acessar e baixar o relatório técnico da OS ${relatorio?.os_numero} (${relatorio?.os_servico || ""}):\n${urlRelatorio()}`);
    return `mailto:${email}?subject=${assunto}&body=${corpo}`;
  }

  async function enviarEmailRelatorio() {
    if (!relatorio) return;
    setErro("");
    setMsg("");
    try {
      const r = await api.post<{ ok: boolean; destinatarios: string[]; remetente: string }>(
        `/api/comercial/relatorios/${relatorio.id}/enviar-email`,
        { base_url: window.location.origin }
      );
      setMsg(`Relatório técnico enviado automaticamente por e-mail (${r.remetente}) para ${r.destinatarios.join(", ")}.`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const carregar = useCallback(() => {
    params.then(({ id }) =>
      api.get<{ relatorio: Relatorio; historico: HistoricoItem[] }>(`/api/comercial/relatorios/${id}`)
        .then((r) => {
          setRelatorio(r.relatorio);
          setHistorico(r.historico);
          const op = r.relatorio.oportunidade;
          if (op) {
            setForm({
              status: op.status,
              valor_estimado: op.valor_estimado?.toString() || "",
              data_contato: op.data_contato || "",
              resultado_contato: op.resultado_contato || "",
              proposta_vinculada: op.proposta_vinculada || "",
              previsao_fechamento: op.previsao_fechamento || "",
              descricao: op.descricao || ""
            });
          }
        })
        .catch((e) => setErro(e.message))
    );
  }, [params]);

  useEffect(carregar, [carregar]);

  async function salvarComercial(e: React.FormEvent) {
    e.preventDefault();
    const op = relatorio?.oportunidade;
    if (!op) return;
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      await api.put(`/api/comercial/oportunidades/${op.id}`, {
        status: form.status,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : undefined,
        data_contato: form.data_contato || undefined,
        resultado_contato: form.resultado_contato || undefined,
        proposta_vinculada: form.proposta_vinculada || undefined,
        previsao_fechamento: form.previsao_fechamento || undefined,
        descricao: form.descricao || undefined
      });
      setMsg("Registro comercial salvo.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function baixarPdf() {
    if (!relatorio) return;
    setErro("");
    try {
      const res = await fetch(`${API_URL}/api/comercial/relatorios/${relatorio.id}/pdf`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
      });
      if (!res.ok) {
        throw new Error("Não foi possível gerar o PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  if (erro && !relatorio) return <Card title="Erro"><p className="text-sm text-red-600">{erro}</p></Card>;
  if (!relatorio) return <p className="py-8 text-center text-sm text-zinc-400">Carregando...</p>;

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-bold text-slate-900 md:text-xl">Relatório {relatorio.os_numero}</h1>
          <Badge status="aprovado" />
          {relatorio.oportunidade && <Badge status={relatorio.oportunidade.status} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="secundario" onClick={baixarPdf}>Imprimir / PDF</Botao>
          <Botao variante="secundario" onClick={() => router.push("/app/comercial/relatorios")}>Voltar</Botao>
        </div>
      </div>

      <Card title="Envio ao responsável do local">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Destinatário: </span>
            <span>{relatorio.local_responsavel || relatorio.responsavel_local || relatorio.cliente_nome}</span>
            {(relatorio.local_responsavel_telefone || relatorio.cliente_telefone) && (
              <span className="ml-2 text-slate-500">• {relatorio.local_responsavel_telefone || relatorio.cliente_telefone}</span>
            )}
            {(relatorio.local_responsavel_email || relatorio.cliente_email) && (
              <span className="ml-2 text-slate-500">• {relatorio.local_responsavel_email || relatorio.cliente_email}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {caminhoRelatorio ? (
              <>
                <input
                  type="text"
                  readOnly
                  value={urlRelatorio()}
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 sm:w-64"
                />
                <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={copiarLinkRelatorio}>Copiar link</Botao>
                <Botao variante="sucesso" className="px-3 py-1.5 text-xs" onClick={enviarEmailRelatorio}>{/*
                  WhatsApp
                </Botao>
                */}
                  E-mail
                </Botao>
                <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => window.open(urlRelatorio(), "_blank")}>
                  Abrir
                </Botao>
              </>
            ) : (
              <Botao onClick={gerarLinkRelatorio} disabled={gerandoLink}>
                {gerandoLink ? "Gerando..." : "Gerar link de compartilhamento"}
              </Botao>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Identificação">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">OS</dt><dd className="font-medium">{relatorio.os_numero}</dd>
            <dt className="text-zinc-500">Cliente</dt><dd className="font-medium">{relatorio.cliente_nome}</dd>
            <dt className="text-zinc-500">Email</dt><dd>{relatorio.cliente_email || "-"}</dd>
            <dt className="text-zinc-500">Telefone</dt><dd>{relatorio.cliente_telefone || "-"}</dd>
            <dt className="text-zinc-500">Localização/unidade</dt><dd>{relatorio.local_nome || "-"}</dd>
            <dt className="text-zinc-500">Endereço</dt>
              <dd>
                {relatorio.local_endereco || "-"}
                {relatorio.local_endereco && (
                  <LinksMapa endereco={relatorio.local_endereco} />
                )}
              </dd>
            <dt className="text-zinc-500">Responsável local</dt><dd>{relatorio.local_responsavel || relatorio.responsavel_local || "-"}</dd>
            <dt className="text-zinc-500">Contato resp.</dt><dd>{relatorio.local_responsavel_telefone || "-"}</dd>
          </dl>
        </Card>

        <Card title="Atendimento técnico">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">Serviço solicitado</dt><dd>{relatorio.os_servico}</dd>
            <dt className="text-zinc-500">Prioridade</dt><dd className="capitalize">{relatorio.os_prioridade}</dd>
            <dt className="text-zinc-500">Data do atendimento</dt><dd>{relatorio.data_agendada || "-"}</dd>
            <dt className="text-zinc-500">Técnico responsável</dt><dd>{relatorio.tecnico_nome || "-"}</dd>
            <dt className="text-zinc-500">Concluído em</dt><dd>{formatarData(relatorio.atendimento_concluido_em)}</dd>
            <dt className="text-zinc-500">Gestor responsável</dt><dd>{relatorio.gestor_nome || "-"}</dd>
            {relatorio.resultado && <dt className="text-zinc-500">Resultado do atendimento</dt>}
            {relatorio.resultado && <dd>{RESULTADO_LABEL[relatorio.resultado] || relatorio.resultado}</dd>}
            <dt className="text-zinc-500">Problema identificado</dt><dd>{relatorio.os_descricao || "-"}</dd>
            {relatorio.tipo_necessidade_label && (
              <>
                <dt className="text-zinc-500">Necessidade adicional</dt>
                <dd>{relatorio.tipo_necessidade_label}{relatorio.necessidade_descricao ? ` — ${relatorio.necessidade_descricao}` : ""}</dd>
              </>
            )}
          </dl>
        </Card>
      </div>

      {relatorio.servico_executado && (
        <Card title="Descrição do serviço realizado">
          <p className="whitespace-pre-wrap text-sm">{relatorio.servico_executado}</p>
        </Card>
      )}

      {relatorio.condicao_sintomas && (
        <Card title="Condição encontrada">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {relatorio.condicao_sintomas && (
              <>
                <dt className="text-zinc-500">Sintomas observados</dt><dd>{relatorio.condicao_sintomas}</dd>
              </>
            )}
            {relatorio.condicao_equipamento && (
              <>
                <dt className="text-zinc-500">Condição do equipamento</dt><dd>{relatorio.condicao_equipamento}</dd>
              </>
            )}
          </dl>
          {relatorio.condicao_observacoes && <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600"><strong className="text-zinc-500">Observações:</strong> {relatorio.condicao_observacoes}</p>}
        </Card>
      )}

      {relatorio.diagnostico && (
        <Card title="Diagnóstico técnico">
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500">Diagnóstico</dt><dd>{relatorio.diagnostico}</dd>
            {relatorio.causa && (
              <>
                <dt className="text-zinc-500">Causa identificada/provável</dt><dd>{relatorio.causa}</dd>
              </>
            )}
          </dl>
          {relatorio.medicoes.length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="mb-1 text-xs font-medium text-zinc-500">Medições realizadas</p>
              <ul className="space-y-0.5 text-sm">
                {relatorio.medicoes.map((m, i) => (
                  <li key={i} className="text-zinc-700">{m.tipo || "Medição"}: {m.valor}{m.unidade ? ` ${m.unidade}` : ""}{m.observacao ? ` (${m.observacao})` : ""}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {relatorio.atividades_executadas.length > 0 && (
        <Card title={`Atividades executadas (${relatorio.atividades_executadas.length})`}>
          <ul className="divide-y divide-zinc-100">
            {relatorio.atividades_executadas.map((a, i) => (
              <li key={i} className="py-2 text-sm">
                <span className="font-medium">{a.titulo}</span>
                {a.resultado && <span className="text-zinc-500"> — {a.resultado}</span>}
                {a.observacao && <p className="mt-0.5 text-xs text-zinc-400">{a.observacao}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(relatorio.pendencias || relatorio.observacoes || relatorio.recomendacoes || relatorio.recomendacoes_tecnico) && (
        <Card title="Observações">
          <p className="whitespace-pre-wrap text-sm">
            {[relatorio.observacoes, relatorio.pendencias ? `Pendências: ${relatorio.pendencias}` : "", relatorio.recomendacoes || relatorio.recomendacoes_tecnico ? `Recomendações: ${relatorio.recomendacoes || relatorio.recomendacoes_tecnico}` : ""].filter(Boolean).join("\n\n")}
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`Fotos e evidências (${relatorio.fotos.length})`}>
          {relatorio.fotos.length > 0 ? (
            <GaleriaFotos
              fotos={relatorio.fotos.map((f, idx) => ({
                src: mediaUrl(f),
                legenda: `Foto ${idx + 1}`
              }))}
            />
          ) : (
            <p className="text-sm text-zinc-400">Nenhuma foto.</p>
          )}
          {relatorio.anexos && relatorio.anexos.filter((a) => a.categoria === "documento").length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="mb-1 text-xs font-medium text-zinc-500">Documentos vinculados</p>
              <ul className="space-y-0.5">
                {relatorio.anexos.filter((a) => a.categoria === "documento").map((d) => (
                  <li key={d.id} className="text-sm">
                    <a href={mediaUrl(d.arquivo)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline hover:text-blue-800">
                      {d.nome_original || d.arquivo.split("/").pop()}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <Card title="Assinaturas dos responsáveis pelo atendimento">
          {Array.isArray(relatorio.assinaturas) && relatorio.assinaturas.length > 0 ? (
            <div className="space-y-3">
              {relatorio.assinaturas.map((ass, idx) => (
                <div key={ass.id || idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={600} height={212} className="h-20 w-auto rounded-md border border-zinc-200 bg-white" />
                  <p className="mt-2 text-sm font-medium text-zinc-800">
                    {ass.nome || relatorio.assinatura_nome || `Responsável #${idx + 1}`}
                    {(ass.cargo || (idx === 0 ? relatorio.assinatura_cargo : "")) ? ` (${ass.cargo || relatorio.assinatura_cargo})` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : relatorio.assinatura ? (
            <>
              <Image src={mediaUrl(relatorio.assinatura)} alt="Assinatura" width={600} height={212} className="h-20 w-auto rounded-md border border-zinc-200" />
              {relatorio.assinatura_nome && <p className="mt-2 text-sm">{relatorio.assinatura_nome}{relatorio.assinatura_cargo ? ` (${relatorio.assinatura_cargo})` : ""}</p>}
            </>
          ) : (
            <p className="text-sm text-zinc-400">Nenhuma assinatura registrada.</p>
          )}
        </Card>
      </div>

      {relatorio.oportunidade ? (
        <Card title="Registro comercial (informações separadas do relatório técnico)">
          {ehComercial ? (
            <form onSubmit={salvarComercial} className="grid gap-3 md:grid-cols-3">
            <Select label="Status comercial" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_COMERCIAL.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </Select>
            <Campo label="Valor da oportunidade (R$)" type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} />
            <Campo label="Previsão de fechamento" type="date" value={form.previsao_fechamento} onChange={(e) => setForm({ ...form, previsao_fechamento: e.target.value })} />
            <Campo label="Data do contato" type="date" value={form.data_contato} onChange={(e) => setForm({ ...form, data_contato: e.target.value })} />
            <Campo label="Proposta vinculada" value={form.proposta_vinculada} onChange={(e) => setForm({ ...form, proposta_vinculada: e.target.value })} placeholder="Ex.: PRO-2026-001" />
            <Campo label="Resultado do contato" value={form.resultado_contato} onChange={(e) => setForm({ ...form, resultado_contato: e.target.value })} placeholder="Ex.: Cliente solicitou orçamento" />
            <div className="md:col-span-3">
              <Textarea label="Observações comerciais" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
            </div>
            <div className="md:col-span-3 flex items-center gap-3">
              <Botao tipo="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar registro comercial"}</Botao>
              {relatorio.oportunidade.responsavel && <span className="text-xs text-zinc-500">Responsável comercial: {relatorio.oportunidade.responsavel}</span>}
            </div>
          </form>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Status comercial</dt><dd><Badge status={relatorio.oportunidade.status} /></dd>
              <dt className="text-zinc-500">Responsável comercial</dt><dd>{relatorio.oportunidade.responsavel || "-"}</dd>
              <dt className="text-zinc-500">Valor da oportunidade</dt><dd>{relatorio.oportunidade.valor_estimado ? `R$ ${Number(relatorio.oportunidade.valor_estimado).toFixed(2)}` : "-"}</dd>
              <dt className="text-zinc-500">Previsão de fechamento</dt><dd>{relatorio.oportunidade.previsao_fechamento || "-"}</dd>
              <dt className="text-zinc-500">Data do contato</dt><dd>{relatorio.oportunidade.data_contato || "-"}</dd>
              <dt className="text-zinc-500">Proposta vinculada</dt><dd>{relatorio.oportunidade.proposta_vinculada || "-"}</dd>
              <dt className="text-zinc-500">Resultado do contato</dt><dd>{relatorio.oportunidade.resultado_contato || "-"}</dd>
              <dt className="text-zinc-500">Observações comerciais</dt><dd>{relatorio.oportunidade.descricao || "-"}</dd>
            </dl>
          )}
        </Card>
      ) : (
        <Card title="Registro comercial">
          <p className="text-sm text-zinc-500">Nenhuma oportunidade vinculada a este relatório.</p>
        </Card>
      )}

      <Card title="Histórico e rastreabilidade">
        {historico === null ? (
          <p className="py-4 text-center text-sm text-zinc-400">Carregando...</p>
        ) : historico.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">Nenhum registro de rastreabilidade.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {historico.map((h) => (
              <li key={h.id} className="py-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-zinc-700">{h.usuario_nome || "Sistema"}</span>
                  <span className="text-xs text-zinc-400">{formatarData(h.criado_em)}</span>
                </div>
                <p className="mt-0.5 text-zinc-600">
                  <span className="font-semibold">{CAMPO_LABEL[h.campo] || h.campo}:</span>{" "}
                  {h.campo === "status" ? (
                    <>
                      <span className="text-zinc-400">{h.valor_anterior || "—"}</span> → <span className="font-medium">{h.valor_novo || "—"}</span>
                    </>
                  ) : (
                    <span className="font-medium">{h.valor_novo ?? "registrado"}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}