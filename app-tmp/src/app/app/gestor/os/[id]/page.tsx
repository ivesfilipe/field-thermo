"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api, mediaUrl, API_URL, getToken } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, GaleriaFotos, LinksMapa, Modal, PageHeader, Prioridade, Select, Textarea } from "@/components/ui";
import { getModelo, camposPreenchidos, valorRotulo } from "@/lib/modelos";

interface Execucao {
  id: number;
  condicao_sintomas: string | null;
  condicao_equipamento: string | null;
  condicao_observacoes: string | null;
  diagnostico: string | null;
  causa: string | null;
  medicoes: Array<{ tipo: string; unidade: string; valor: string; observacao: string }> | null;
  servico_executado: string | null;
  atividades_executadas: Array<{ titulo: string; resultado: string; observacao: string }> | null;
  resultado: string | null;
  pendencias: string | null;
  recomendacoes: string | null;
  observacoes: string | null;
  fotos: string | null;
  assinatura: string | null;
  assinatura_nome: string | null;
  assinatura_cargo: string | null;
  assinaturas?: Array<{ id: number; nome: string; cargo: string; arquivo: string; criado_em?: string | null }> | null;
  relatorio_ia: unknown;
  iniciada_em: string | null;
  concluida_em: string | null;
  executor_nome: string | null;
  concluida_por_nome: string | null;
  necessidade_adicional: string | null;
  necessidade_descricao: string | null;
  complemento_solicitado: string | null;
  dados_modelo: Record<string, string> | null;
}

interface Anexo {
  id: number;
  categoria: string;
  arquivo: string;
  nome_original: string | null;
  criado_em: string;
}

interface Relatorio {
  id: number;
  token?: string | null;
  status: string;
  recomendacoes: string | null;
  data_validacao: string | null;
  enviado_comercial: number;
  complemento_motivo: string | null;
  conteudo: unknown;
}

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
}

interface RelatorioConteudo {
  cabecalho: string;
  identificacao: Record<string, string | null>;
  solicitacao: Record<string, string | null>;
  condicao_encontrada: string[];
  diagnostico_tecnico: string[];
  atividades_executadas: string[];
  resultado: string | null;
  pendencias: string | null;
  recomendacoes: string | null;
  evidencia_fotografica: string[];
  necessidade_adicional: { tipo: string; descricao: string | null } | null;
  assinatura: { nome: string | null; cargo: string | null; data_hora: string | null };
  tecnico: string | null;
  lacunas: string[];
  oportunidade: { tipo: string; descricao: string } | null;
  observacao_ia: string;
}

const NECESSIDADE_LABEL: Record<string, string> = {
  nao: "Não",
  nova_manutencao: "Sim — nova manutenção",
  substituicao_equipamento: "Sim — substituição de equipamento",
  fornecimento_peca: "Sim — fornecimento de peça",
  instalacao: "Sim — instalação",
  adequacao: "Sim — adequação",
  outro_servico: "Sim — outro serviço"
};

const RESULTADO_LABEL: Record<string, string> = {
  funcionando: "Equipamento funcionando",
  com_restricao: "Funcionando com restrição",
  indisponivel: "Equipamento indisponível",
  necessita_retorno: "Necessita retorno",
  necessita_orcamento: "Necessita orçamento"
};

const CATEGORIA_LABEL: Record<string, string> = {
  antes: "Antes", durante: "Durante", depois: "Depois",
  defeito: "Defeito / evidência", equipamento: "Equipamento",
  documento: "Documento", outros: "Outros"
};

interface OS {
  id: number;
  numero: string;
  cliente_id: number;
  cliente_nome: string;
  cliente_email: string | null;
  cliente_telefone: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  local_responsavel: string | null;
  local_responsavel_telefone?: string | null;
  local_responsavel_email?: string | null;
  responsavel_local: string | null;
  equipamento_nome: string | null;
  equipamento_modelo: string | null;
  equipamento_capacidade: string | null;
  equipamento_patrimonio: string | null;
  equipamento_codigo_mt: string | null;
  equipamento_tipo: string | null;
  equipamento_fabricante: string | null;
  equipamento_gas: string | null;
  equipamento_tensao: string | null;
  equipamento_local: string | null;
  equipamento_ambiente: string | null;
  equipamento_serie: string | null;
  equipamento_status: string | null;
  equipamento_id: number | null;
  servico: string;
  descricao: string | null;
  prioridade: string;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  confirmada: number;
  equipe_nome: string | null;
  tecnico_nome: string | null;
  status: string;
  criado_em: string;
  tipo_atendimento: string | null;
  execucao: Execucao | null;
  relatorio: Relatorio | null;
  avaliacao: Avaliacao | null;
  anexos: Anexo[] | null;
}

interface Atividade {
  id: number;
  titulo: string;
  tipo: string;
  data: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  observacoes: string | null;
  status: string;
  tecnico_nome: string | null;
  equipe_nome: string | null;
}

interface Historico {
  id: number;
  usuario_nome: string | null;
  campo: string;
  valor_anterior: string | null;
  valor_novo: string | null;
  criado_em: string;
}

const TIPOS_ATIVIDADE = ["visita_tecnica", "levantamento", "inspecao", "reuniao", "retorno_cliente", "preventiva", "acompanhamento", "outro"];
const TIPO_LABEL: Record<string, string> = {
  visita_tecnica: "Visita técnica", levantamento: "Levantamento", inspecao: "Inspeção", reuniao: "Reunião",
  retorno_cliente: "Retorno ao cliente", preventiva: "Preventiva programada", acompanhamento: "Acompanhamento de serviço", outro: "Outra atividade"
};

function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="font-medium text-zinc-800">{valor}</dd>
    </>
  );
}

export default function OsDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [os, setOs] = useState<OS | null>(null);
  const [atividades, setAtividades] = useState<Atividade[] | null>(null);
  const [historico, setHistorico] = useState<Historico[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [recomendacoes, setRecomendacoes] = useState("");
  const [complementoMotivo, setComplementoMotivo] = useState("");
  const [enviarComercial, setEnviarComercial] = useState(false);
  const [mostrarAtividade, setMostrarAtividade] = useState(false);
  const [atvForm, setAtvForm] = useState({ titulo: "", tipo: "outro", data: "", hora_inicio: "", hora_fim: "", observacoes: "" });
  const [conflictos, setConflicts] = useState<string[] | null>(null);
  const [salvandoAtv, setSalvandoAtv] = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState("");
  const [mostrarRelatorio, setMostrarRelatorio] = useState(false);
  const [linkAvaliacao, setLinkAvaliacao] = useState<string | null>(null);
  const [gerandoLink, setGerandoLink] = useState(false);
  const [linkRelatorio, setLinkRelatorio] = useState<string | null>(null);
  const [gerandoLinkRelatorio, setGerandoLinkRelatorio] = useState(false);

  const RESOLVEU_LABEL: Record<string, string> = { sim: "Sim", parcialmente: "Parcialmente", nao: "Não" };

  const caminhoAvaliacao = linkAvaliacao || (os?.avaliacao?.token ? `/avaliacao/${os.avaliacao.token}` : null);
  const caminhoRelatorio = linkRelatorio || (os?.relatorio?.token ? `/relatorio/${os.relatorio.token}` : null);

  function urlAvaliacao(): string {
    return `${window.location.origin}${caminhoAvaliacao || ""}`;
  }

  function urlRelatorio(): string {
    return `${window.location.origin}${caminhoRelatorio || ""}`;
  }

  async function gerarLinkAvaliacao() {
    setErro("");
    setMsg("");
    setGerandoLink(true);
    try {
      const r = await api.post<{ avaliacao: { link: string } }>(`/api/gestor/os/${id}/avaliacao/link`);
      setLinkAvaliacao(r.avaliacao.link);
      setMsg("Link de avaliação pronto para envio.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setGerandoLink(false);
    }
  }

  async function gerarLinkRelatorio() {
    setErro("");
    setMsg("");
    setGerandoLinkRelatorio(true);
    try {
      const r = await api.post<{ relatorio: { link: string } }>(`/api/gestor/os/${id}/relatorio/link`);
      setLinkRelatorio(r.relatorio.link);
      setMsg("Link do relatório técnico pronto para envio ao responsável do local.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setGerandoLinkRelatorio(false);
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(urlAvaliacao());
      setMsg("Link de avaliação copiado para a área de transferência.");
    } catch {
      setErro("Não foi possível copiar o link automaticamente.");
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

  function linkWhatsApp(): string {
    const telRaw = (os?.local_responsavel_telefone || os?.cliente_telefone || "").replace(/\D/g, "");
    const tel = telRaw ? (telRaw.length <= 11 ? `55${telRaw}` : telRaw) : "";
    const resp = os?.local_responsavel || os?.responsavel_local || os?.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const texto = encodeURIComponent(`${saudacao} Concluímos o atendimento da OS ${os?.numero}. Gostaríamos de saber sua opinião: ${urlAvaliacao()}`);
    return tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  }

  function linkEmail(): string {
    const email = os?.local_responsavel_email || os?.cliente_email || "";
    const assunto = encodeURIComponent(`Avalie o atendimento da OS ${os?.numero}`);
    const corpo = encodeURIComponent(`Olá! Concluímos o atendimento da OS ${os?.numero}. Gostaríamos de saber sua opinião: ${urlAvaliacao()}`);
    return `mailto:${email}?subject=${assunto}&body=${corpo}`;
  }

  function linkWhatsAppRelatorio(): string {
    const telRaw = (os?.local_responsavel_telefone || os?.cliente_telefone || "").replace(/\D/g, "");
    const tel = telRaw ? (telRaw.length <= 11 ? `55${telRaw}` : telRaw) : "";
    const resp = os?.local_responsavel || os?.responsavel_local || os?.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const texto = encodeURIComponent(`${saudacao} Segue o relatório técnico do atendimento da OS ${os?.numero} (${os?.local_nome || os?.cliente_nome || "Thermo Control"}): ${urlRelatorio()}`);
    return tel ? `https://wa.me/${tel}?text=${texto}` : `https://wa.me/?text=${texto}`;
  }

  function linkEmailRelatorio(): string {
    const email = os?.local_responsavel_email || os?.cliente_email || "";
    const resp = os?.local_responsavel || os?.responsavel_local || os?.cliente_nome || "";
    const saudacao = resp ? `Olá, ${resp}!` : "Olá!";
    const assunto = encodeURIComponent(`Relatório Técnico - OS ${os?.numero}`);
    const corpo = encodeURIComponent(`${saudacao}\n\nSegue o link para acessar e baixar o relatório técnico da OS ${os?.numero} (${os?.servico || ""}):\n${urlRelatorio()}`);
    return `mailto:${email}?subject=${assunto}&body=${corpo}`;
  }

  async function baixarPdf() {
    if (!os?.relatorio) return;
    setErro("");
    try {
      const res = await fetch(`${API_URL}/api/comercial/relatorios/${os.relatorio.id}/pdf`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
      });
      if (!res.ok) {
        throw new Error("Não foi possível gerar o PDF do relatório");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const carregar = useCallback(() => {
    api.get<{ os: OS }>(`/api/gestor/os/${id}`).then((r) => setOs(r.os)).catch((e) => setErro(e.message));
    api.get<{ atividades: Atividade[] }>(`/api/gestor/atividades?os_id=${id}`).then((r) => setAtividades(r.atividades)).catch(() => setAtividades([]));
    api.get<{ historico: Historico[] }>(`/api/gestor/historico?tipo=os&registro_id=${id}`).then((r) => setHistorico(r.historico)).catch(() => setHistorico([]));
  }, [id]);

  useEffect(carregar, [carregar]);

  async function validar(aprovado: boolean) {
    setErro("");
    setMsg("");
    try {
      const body: Record<string, unknown> = { aprovado, recomendacoes: recomendacoes || undefined };
      if (!aprovado) {
        const motivo = complementoMotivo.trim();
        if (!motivo) {
          setErro("Informe o motivo do complemento solicitado.");
          return;
        }
        body.complemento_motivo = motivo;
      } else {
        body.enviar_comercial = enviarComercial;
      }
      await api.patch(`/api/gestor/os/${id}/validar`, body);
      setMsg(aprovado ? "Atendimento aprovado." : "Complemento solicitado — a OS voltou para o técnico.");
      setRecomendacoes("");
      setComplementoMotivo("");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function cancelar() {
    setErro("");
    if (!confirm("Cancelar esta OS?")) return;
    try {
      await api.patch(`/api/gestor/os/${id}/cancelar`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function confirmarOS() {
    setErro("");
    try {
      await api.patch(`/api/gestor/os/${id}/confirmar`, { confirmada: os?.confirmada ? false : true });
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function reabrirOS(motivo?: string) {
    setErro("");
    setMsg("");
    const m = (motivo ?? motivoReabrir).trim();
    if (!m) {
      setErro("Informe o motivo da reabertura.");
      return;
    }
    try {
      await api.patch(`/api/gestor/os/${id}/reabrir`, { motivo: m });
      setMotivoReabrir("");
      setMsg("OS reaberta — retornou para o técnico com histórico.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function criarAtividade(ignorarConflitos = false) {
    setErro("");
    setConflicts(null);
    setSalvandoAtv(true);
    try {
      await api.post("/api/gestor/atividades", {
        titulo: atvForm.titulo,
        tipo: atvForm.tipo,
        os_id: Number(id),
        cliente_id: os?.cliente_id,
        data: atvForm.data || undefined,
        hora_inicio: atvForm.hora_inicio || undefined,
        hora_fim: atvForm.hora_fim || undefined,
        observacoes: atvForm.observacoes || undefined,
        ignorar_conflitos: ignorarConflitos || undefined
      });
      setMsg("Atividade adicionada à OS.");
      setMostrarAtividade(false);
      setAtvForm({ titulo: "", tipo: "outro", data: "", hora_inicio: "", hora_fim: "", observacoes: "" });
      carregar();
    } catch (err) {
      const e = err as { status?: number; conflitos?: Array<{ referencia: string; horario: string }>; message?: string };
      if (e?.status === 409 && Array.isArray(e?.conflitos)) {
        setConflicts(e.conflitos.map((c) => `${c.referencia} — ocupado em ${c.horario}`));
      } else {
        setErro(e?.message || "Erro ao criar atividade");
      }
    } finally {
      setSalvandoAtv(false);
    }
  }

  if (!os) {
    return <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />;
  }

  const exec = os.execucao;
  const fotos: Anexo[] = (os.anexos || []).filter((a) => a.categoria !== "documento");

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo={os.numero}
        descricao={os.servico}
        acoes={
          <>
            {os.status === "pendente" && (
              <Botao variante="sucesso" onClick={confirmarOS}>{os.confirmada ? "Desconfirmar" : "Confirmar"}</Botao>
            )}
            {(os.status === "pendente" || os.status === "em_andamento") && (
              <Botao variante="perigo" onClick={cancelar}>Cancelar OS</Botao>
            )}
            {os.relatorio && os.relatorio.status === "aprovado" && (
              <Botao variante="secundario" onClick={baixarPdf}>Baixar Relatório (PDF)</Botao>
            )}
            {["concluida", "cancelada"].includes(os.status) && (
              <Botao variante="secundario" onClick={() => {
                const motivo = window.prompt("Motivo da reabertura da OS:");
                if (motivo) reabrirOS(motivo);
              }}>Reabrir OS</Botao>
            )}
            <Botao variante="secundario" onClick={() => router.back()}>Voltar</Botao>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge status={os.status} />
        <Prioridade p={os.prioridade} />
        {getModelo(os.tipo_atendimento) && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            Modelo: {getModelo(os.tipo_atendimento)!.rotulo}
          </span>
        )}
        {os.status === "pendente" && (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${os.confirmada ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-100 text-zinc-600"}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${os.confirmada ? "bg-emerald-500" : "bg-zinc-400"}`} />
            {os.confirmada ? "Confirmada" : "Agendada"}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Identificação">
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
            <Item rotulo="Cliente" valor={os.cliente_nome} />
            <Item rotulo="Local" valor={os.local_nome || "-"} />
            <Item rotulo="Endereço" valor={
              <span>
                {os.local_endereco || "-"}
                {os.local_endereco && (
                  <LinksMapa endereco={os.local_endereco_completo || os.local_endereco} />
                )}
              </span>
            } />
            <Item rotulo="Responsável local" valor={os.local_responsavel || os.responsavel_local || "-"} />
            <Item rotulo="Criado em" valor={os.criado_em?.slice(0, 16) || "-"} />
          </dl>
          {os.descricao && <p className="mt-3 border-t border-zinc-100 pt-3 text-sm text-zinc-600">{os.descricao}</p>}
        </Card>

        {os.equipamento_id && (
          <Card title="Equipamento">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-blue-700 px-2 py-0.5 font-mono text-sm font-bold text-white">{os.equipamento_codigo_mt}</span>
              <span className="font-medium text-zinc-800">{os.equipamento_nome}</span>
            </div>
            <dl className="grid grid-cols-2 gap-y-2.5 text-sm md:grid-cols-3">
              {os.equipamento_patrimonio && <Item rotulo="Patrimônio" valor={os.equipamento_patrimonio} />}
              {os.equipamento_tipo && <Item rotulo="Tipo" valor={os.equipamento_tipo} />}
              {os.equipamento_fabricante && <Item rotulo="Fabricante" valor={os.equipamento_fabricante} />}
              {os.equipamento_modelo && <Item rotulo="Modelo" valor={os.equipamento_modelo} />}
              {os.equipamento_capacidade && <Item rotulo="Capacidade" valor={os.equipamento_capacidade} />}
              {os.equipamento_gas && <Item rotulo="Gás / fluido" valor={os.equipamento_gas} />}
              {os.equipamento_tensao && <Item rotulo="Tensão" valor={os.equipamento_tensao} />}
              {os.equipamento_local && <Item rotulo="Local" valor={os.equipamento_local} />}
              {os.equipamento_ambiente && <Item rotulo="Ambiente" valor={os.equipamento_ambiente} />}
              {os.equipamento_serie && <Item rotulo="Nº de série" valor={os.equipamento_serie} />}
              {os.equipamento_status && <Item rotulo="Status" valor={os.equipamento_status} />}
            </dl>
          </Card>
        )}

        <Card title="Agenda">
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm">
            <Item rotulo="Data agendada" valor={os.data_agendada || "-"} />
            <Item rotulo="Horário" valor={os.hora_inicio ? `${os.hora_inicio}${os.hora_fim ? `–${os.hora_fim}` : ""}` : "-"} />
            <Item rotulo="Equipe" valor={os.equipe_nome || "-"} />
          </dl>
        </Card>
      </div>

      {exec && (
        <Card title="Execução do técnico">
          {(() => {
            const m = getModelo(os.tipo_atendimento);
            const tipo = os.tipo_atendimento || "";
            const preenchidos = m ? camposPreenchidos(tipo, exec.dados_modelo || {}) : [];
            if (!m || !preenchidos.length) return null;
            return (
              <div className="mb-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">{m.rotulo}</p>
                <dl className="grid grid-cols-1 gap-y-2.5 text-sm sm:grid-cols-2">
                  {preenchidos.map((c) => (
                    <div key={c.chave} className="sm:col-span-2">
                      <dt className="text-zinc-500">{c.rotulo}</dt>
                      <dd className="whitespace-pre-wrap font-medium text-zinc-800">{valorRotulo(tipo, c.chave, c.valor)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}
          {exec.servico_executado && (
            <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Descrição do serviço realizado</p>
              <p className="whitespace-pre-wrap text-sm text-blue-900">{exec.servico_executado}</p>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm md:grid-cols-3">
            <Item rotulo="Assumida por" valor={exec.executor_nome || "-"} />
            <Item rotulo="Iniciada em" valor={exec.iniciada_em?.slice(0, 16) || "-"} />
            <Item rotulo="Concluída em" valor={exec.concluida_em?.slice(0, 16) || "-"} />
            {exec.concluida_por_nome && <Item rotulo="Concluída por" valor={exec.concluida_por_nome} />}
            {exec.resultado && <Item rotulo="Resultado" valor={RESULTADO_LABEL[exec.resultado] || exec.resultado} />}
            {exec.condicao_sintomas && (
              <>
                <dt className="text-zinc-500">Sintomas observados</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">{exec.condicao_sintomas}</dd>
              </>
            )}
            {exec.condicao_equipamento && (
              <>
                <dt className="text-zinc-500">Condição do equipamento</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">{exec.condicao_equipamento}</dd>
              </>
            )}
            {exec.condicao_observacoes && (
              <>
                <dt className="text-zinc-500">Observações da condição</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">{exec.condicao_observacoes}</dd>
              </>
            )}
            {exec.diagnostico && (
              <>
                <dt className="text-zinc-500">Diagnóstico</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">{exec.diagnostico}</dd>
              </>
            )}
            {exec.causa && (
              <>
                <dt className="text-zinc-500">Causa identificada/provável</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">{exec.causa}</dd>
              </>
            )}
            {exec.necessidade_adicional && exec.necessidade_adicional !== "nao" && (
              <>
                <dt className="text-zinc-500">Necessidade adicional</dt>
                <dd className="col-span-1 font-medium text-zinc-800 md:col-span-2">
                  {NECESSIDADE_LABEL[exec.necessidade_adicional] || exec.necessidade_adicional}
                  {exec.necessidade_descricao ? ` — ${exec.necessidade_descricao}` : ""}
                </dd>
              </>
            )}
          </dl>
          {Array.isArray(exec.medicoes) && exec.medicoes.filter((m) => m.tipo || m.valor).length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="mb-1 text-xs font-medium text-zinc-500">Medições realizadas</p>
              <ul className="space-y-0.5 text-sm">
                {exec.medicoes.filter((m) => m.tipo || m.valor).map((m, i) => (
                  <li key={i} className="text-zinc-700">
                    {m.tipo || "Medição"}: {m.valor}{m.unidade ? ` ${m.unidade}` : ""}{m.observacao ? ` (${m.observacao})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(exec.atividades_executadas) && exec.atividades_executadas.filter((a) => a.titulo).length > 0 && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="mb-1 text-xs font-medium text-zinc-500">Atividades executadas</p>
              <ul className="space-y-0.5 text-sm">
                {exec.atividades_executadas.filter((a) => a.titulo).map((a, i) => (
                  <li key={i} className="text-zinc-700">
                    • {a.titulo}{a.resultado ? ` — ${a.resultado}` : ""}{a.observacao ? ` (${a.observacao})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {exec.pendencias && <p className="mt-3 text-sm text-zinc-600"><strong className="text-zinc-500">Pendências:</strong> {exec.pendencias}</p>}
          {exec.recomendacoes && <p className="mt-2 text-sm text-zinc-600"><strong className="text-zinc-500">Recomendações:</strong> {exec.recomendacoes}</p>}
          {exec.observacoes && <p className="mt-2 text-sm text-zinc-600"><strong className="text-zinc-500">Observações:</strong> {exec.observacoes}</p>}
          {fotos.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-semibold text-zinc-600">Fotos anexadas ({fotos.length}) — clique para abrir:</p>
              <GaleriaFotos
                fotos={fotos.map((f, idx) => ({
                  src: mediaUrl(f.arquivo),
                  legenda: `${CATEGORIA_LABEL[f.categoria] || "Foto"} #${idx + 1}`
                }))}
              />
            </div>
          )}
          {os.anexos && os.anexos.filter((a) => a.categoria === "documento").length > 0 && (
            <ul className="mt-2 space-y-1">
              {os.anexos.filter((a) => a.categoria === "documento").map((d) => (
                <li key={d.id} className="text-sm">
                  <a href={mediaUrl(d.arquivo)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline hover:text-blue-800">
                    📄 {d.nome_original || d.arquivo.split("/").pop()}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {Array.isArray(exec.assinaturas) && exec.assinaturas.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-medium text-zinc-500">Assinaturas registradas ({exec.assinaturas.length})</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {exec.assinaturas.map((ass, idx) => (
                  <div key={ass.id || idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                    <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={600} height={212} className="h-16 w-auto rounded-lg border border-zinc-200 bg-white" />
                    <p className="mt-1.5 text-sm font-medium text-zinc-800">
                      {ass.nome || exec.assinatura_nome || `Responsável #${idx + 1}`}
                      {(ass.cargo || (idx === 0 ? exec.assinatura_cargo : "")) ? ` (${ass.cargo || exec.assinatura_cargo})` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {exec.assinatura_nome && (
                <p className="mt-3 text-sm text-zinc-600">
                  <strong className="text-zinc-500">Responsável pela assinatura:</strong> {exec.assinatura_nome}{exec.assinatura_cargo ? ` (${exec.assinatura_cargo})` : ""}
                </p>
              )}
              {exec.assinatura && (
                <div className="mt-3">
                  <p className="mb-1 text-xs text-zinc-500">Assinatura</p>
                  <Image src={mediaUrl(exec.assinatura)} alt="Assinatura" width={600} height={212} className="h-16 w-auto rounded-lg border border-zinc-200" />
                </div>
              )}
            </>
          )}
        </Card>
      )}

      <Card
        title="Atividades da OS"
        acao={<Botao variante="secundario" onClick={() => setMostrarAtividade(!mostrarAtividade)}>+ Adicionar atividade</Botao>}
      >
        {mostrarAtividade && (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            {conflictos && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm">
                <p className="font-medium text-red-700">Conflito de agenda detectado:</p>
                <ul className="mt-1 list-inside list-disc text-red-600">{conflictos.map((c, i) => <li key={i}>{c}</li>)}</ul>
                <div className="mt-2 flex gap-2">
                  <Botao variante="perigo" disabled={salvandoAtv} onClick={() => criarAtividade(true)}>Salvar mesmo assim</Botao>
                  <Botao variante="secundario" onClick={() => setConflicts(null)}>Voltar e ajustar</Botao>
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); criarAtividade(); }}
              className="grid gap-2 md:grid-cols-6"
            >
              <Campo label="Título" value={atvForm.titulo} onChange={(e) => setAtvForm({ ...atvForm, titulo: e.target.value })} />
              <Select label="Tipo" value={atvForm.tipo} onChange={(e) => setAtvForm({ ...atvForm, tipo: e.target.value })}>
                {TIPOS_ATIVIDADE.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </Select>
              <Campo label="Data" type="date" value={atvForm.data} onChange={(e) => setAtvForm({ ...atvForm, data: e.target.value })} />
              <Campo label="Início" type="time" value={atvForm.hora_inicio} onChange={(e) => setAtvForm({ ...atvForm, hora_inicio: e.target.value })} />
              <Campo label="Fim" type="time" value={atvForm.hora_fim} onChange={(e) => setAtvForm({ ...atvForm, hora_fim: e.target.value })} />
              <div className="flex items-end">
                <Botao tipo="submit" disabled={salvandoAtv}>{salvandoAtv ? "Salvando..." : "Salvar"}</Botao>
              </div>
              <div className="md:col-span-6">
                <Textarea label="Observações" rows={2} value={atvForm.observacoes} onChange={(e) => setAtvForm({ ...atvForm, observacoes: e.target.value })} />
              </div>
            </form>
          </div>
        )}
        {atividades === null ? (
          <p className="py-4 text-center text-sm text-zinc-400">Carregando...</p>
        ) : atividades.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">Nenhuma atividade vinculada a esta OS.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {atividades.map((a) => (
              <li key={a.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.titulo}</span>
                  <span className="text-xs text-zinc-400">{TIPO_LABEL[a.tipo] || a.tipo}</span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {a.data || "-"} {a.hora_inicio ? ` ${a.hora_inicio}${a.hora_fim ? `–${a.hora_fim}` : ""}` : ""}
                  {a.equipe_nome ? ` · Equipe: ${a.equipe_nome}` : ""}
                  {a.tecnico_nome ? ` · Técnico: ${a.tecnico_nome}` : ""}
                  <Badge status={a.status} />
                </p>
                {a.observacoes && <p className="mt-0.5 text-xs text-zinc-600">{a.observacoes}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Histórico da OS">
        {historico === null ? (
          <p className="py-4 text-center text-sm text-zinc-400">Carregando...</p>
        ) : historico.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">Nenhuma alteração registrada.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {historico.map((h) => (
              <li key={h.id} className="py-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-zinc-700">{h.usuario_nome || "Sistema"}</span>
                  <span className="text-xs text-zinc-400">{h.criado_em?.slice(0, 16)}</span>
                </div>
                <p className="mt-0.5 text-zinc-600">
                  <span className="font-semibold">{h.campo}:</span>{" "}
                  <span className="text-zinc-400">{h.valor_anterior ?? "—"}</span> →{" "}
                  <span className="font-medium">{h.valor_novo ?? "—"}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {os.status === "aguardando_validacao" && (
        <Card title="Validar atendimento">
          <div className="space-y-3">
            <Textarea label="Recomendações para o comercial" value={recomendacoes} onChange={(e) => setRecomendacoes(e.target.value)} rows={3} placeholder="Ex.: Recomenda-se substituir a peça em 6 meses" />
            <Textarea label="Motivo do complemento (ao solicitar)" value={complementoMotivo} onChange={(e) => setComplementoMotivo(e.target.value)} rows={2} placeholder="Ex.: Faltam fotos do equipamento e a assinatura do responsável" />
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700">
              <input type="checkbox" checked={enviarComercial} onChange={(e) => setEnviarComercial(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Enviar ao comercial — existe necessidade de proposta/orçamento
            </label>
            <div className="flex flex-wrap gap-2">
              <Botao variante="sucesso" onClick={() => validar(true)}>Aprovar</Botao>
              <Botao variante="perigo" onClick={() => validar(false)}>Solicitar complemento ao técnico</Botao>
            </div>
          </div>
        </Card>
      )}

      {os.relatorio && (
        <Card
          title="Relatório técnico"
          acao={
            <div className="flex flex-wrap gap-2">
              {os.relatorio.status === "aprovado" && (
                <Botao variante="secundario" className="px-3 py-1 text-xs" onClick={baixarPdf}>Imprimir / PDF</Botao>
              )}
              {Boolean(os.relatorio.conteudo) && (
                <Botao variante="secundario" className="px-3 py-1 text-xs" onClick={() => setMostrarRelatorio(true)}>Ver laudo</Botao>
              )}
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge status={os.relatorio.status} />
                <span className="text-xs text-slate-500">Validado em {os.relatorio.data_validacao?.slice(0, 16) || "-"}</span>
                {os.relatorio.enviado_comercial === 1 && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Enviado ao comercial</span>}
                {os.relatorio.status === "reprovado" && os.relatorio.complemento_motivo && (
                  <span className="text-xs text-red-600">Complemento: {os.relatorio.complemento_motivo}</span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Destinatário: </span>
                {os.local_responsavel || os.responsavel_local || os.cliente_nome}
                {(os.local_responsavel_telefone || os.cliente_telefone) && ` • ${os.local_responsavel_telefone || os.cliente_telefone}`}
              </div>
            </div>
            {os.relatorio.recomendacoes && <p className="text-sm text-slate-600">{os.relatorio.recomendacoes}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
              {caminhoRelatorio ? (
                <>
                  <input
                    type="text"
                    readOnly
                    value={urlRelatorio()}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 sm:w-72"
                  />
                  <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={copiarLinkRelatorio}>Copiar link</Botao>
                  <Botao variante="sucesso" className="px-3 py-1.5 text-xs" onClick={() => window.open(linkWhatsAppRelatorio(), "_blank")}>
                    WhatsApp
                  </Botao>
                  <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => window.open(linkEmailRelatorio(), "_blank")}>
                    E-mail
                  </Botao>
                  <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => window.open(urlRelatorio(), "_blank")}>
                    Abrir
                  </Botao>
                </>
              ) : (
                <Botao onClick={gerarLinkRelatorio} disabled={gerandoLinkRelatorio}>
                  {gerandoLinkRelatorio ? "Gerando..." : "Gerar link do relatório"}
                </Botao>
              )}
            </div>
          </div>
        </Card>
      )}

      {os.status === "concluida" && (
        <Card title="Avaliação de atendimento">
          {os.avaliacao?.status === "respondida" ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Badge status="concluida" />
                <span className="text-zinc-500">Respondida em {os.avaliacao.respondida_em?.slice(0, 16)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <svg key={n} viewBox="0 0 24 24" className={`h-5 w-5 ${n <= (os.avaliacao?.nota || 0) ? "fill-amber-400" : "fill-zinc-300"}`}>
                      <path d="M12 2l2.9 6.26L21.5 9.27l-4.75 4.53 1.13 6.7L12 17.02l-5.88 3.48 1.13-6.7L2.5 9.27l6.6-1.01L12 2z" />
                    </svg>
                  ))}
                </div>
                <span className="font-semibold text-zinc-800">{os.avaliacao.nota}/5</span>
              </div>
              {os.avaliacao.resolveu_necessidade && (
                <p className="text-zinc-600">
                  O serviço resolveu a necessidade? <span className="font-medium text-zinc-800">{RESOLVEU_LABEL[os.avaliacao.resolveu_necessidade]}</span>
                </p>
              )}
              {os.avaliacao.comentario && (
                <p className="rounded-lg bg-zinc-50 p-3 italic text-zinc-600">“{os.avaliacao.comentario}”</p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <Badge status="pendente" />
                <span className="text-xs text-slate-500">Aguardando resposta do cliente</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {caminhoAvaliacao ? (
                  <>
                    <input
                      type="text"
                      readOnly
                      value={urlAvaliacao()}
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700 sm:w-72"
                    />
                    <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={copiarLink}>Copiar link</Botao>
                    <Botao variante="sucesso" className="px-3 py-1.5 text-xs" onClick={() => window.open(linkWhatsApp(), "_blank")}>
                      WhatsApp
                    </Botao>
                    <Botao variante="secundario" className="px-3 py-1.5 text-xs" onClick={() => window.open(linkEmail(), "_blank")}>
                      E-mail
                    </Botao>
                  </>
                ) : (
                  <Botao onClick={gerarLinkAvaliacao} disabled={gerandoLink}>
                    {gerandoLink ? "Gerando..." : "Gerar link de avaliação"}
                  </Botao>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {mostrarAtividade && (
        <Modal titulo="Adicionar atividade" onFechar={() => setMostrarAtividade(false)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Campo label="Título" value={atvForm.titulo} onChange={(e) => setAtvForm({ ...atvForm, titulo: e.target.value })} />
            <Select label="Tipo" value={atvForm.tipo} onChange={(e) => setAtvForm({ ...atvForm, tipo: e.target.value })}>
              {TIPOS_ATIVIDADE.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
            </Select>
            <Campo label="Data" type="date" value={atvForm.data} onChange={(e) => setAtvForm({ ...atvForm, data: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Início" type="time" value={atvForm.hora_inicio} onChange={(e) => setAtvForm({ ...atvForm, hora_inicio: e.target.value })} />
              <Campo label="Fim" type="time" value={atvForm.hora_fim} onChange={(e) => setAtvForm({ ...atvForm, hora_fim: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Textarea label="Observações" rows={2} value={atvForm.observacoes} onChange={(e) => setAtvForm({ ...atvForm, observacoes: e.target.value })} />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Botao disabled={salvandoAtv} onClick={() => criarAtividade()}>{salvandoAtv ? "Salvando..." : "Salvar atividade"}</Botao>
              <Botao variante="secundario" onClick={() => setMostrarAtividade(false)}>Cancelar</Botao>
            </div>
          </div>
        </Modal>
      )}

      {mostrarRelatorio && Boolean(os.relatorio?.conteudo) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-start sm:p-6 sm:pt-16" onClick={() => setMostrarRelatorio(false)}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:rounded-xl sm:max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-3.5">
              <h3 className="text-base font-semibold text-zinc-900">Relatório técnico completo</h3>
              <button onClick={() => setMostrarRelatorio(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">✕</button>
            </div>
            {(() => {
              const c = os.relatorio!.conteudo as RelatorioConteudo;
              return (
                <div className="space-y-4 p-5 text-sm text-zinc-700">
                  <div>
                    <h4 className="text-base font-bold text-blue-800">{c.cabecalho}</h4>
                    <p className="mt-1 font-medium">OS: {c.identificacao.os}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-zinc-500">Cliente</span><span className="font-medium">{c.identificacao.cliente}</span>
                    <span className="text-zinc-500">Local</span><span className="font-medium">{c.identificacao.local || "-"}</span>
                    <span className="text-zinc-500">Responsável</span><span className="font-medium">{c.identificacao.responsavel_local || "-"}</span>
                    <span className="text-zinc-500">Equipamento</span><span className="font-medium">{c.identificacao.equipamento || "-"}</span>
                    <span className="text-zinc-500">Modelo</span><span className="font-medium">{c.identificacao.modelo || "-"}</span>
                    <span className="text-zinc-500">Capacidade</span><span className="font-medium">{c.identificacao.capacidade || "-"}</span>
                    <span className="text-zinc-500">Patrimônio</span><span className="font-medium">{c.identificacao.patrimonio || "-"}</span>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3">
                    <h5 className="mb-1 font-semibold text-blue-900">Solicitação original (gestor)</h5>
                    <p className="text-blue-800">{c.solicitacao.servico}</p>
                    {c.solicitacao.descricao && <p className="mt-0.5 text-blue-700">{c.solicitacao.descricao}</p>}
                  </div>
                  {c.condicao_encontrada.length > 0 && (
                    <div><h5 className="mb-1 font-semibold text-zinc-900">Condição encontrada</h5><ul className="list-inside list-disc space-y-0.5">{c.condicao_encontrada.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  )}
                  {c.diagnostico_tecnico.length > 0 && (
                    <div><h5 className="mb-1 font-semibold text-zinc-900">Diagnóstico técnico</h5><ul className="list-inside list-disc space-y-0.5">{c.diagnostico_tecnico.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  )}
                  {c.atividades_executadas.length > 0 && (
                    <div><h5 className="mb-1 font-semibold text-zinc-900">Atividades executadas</h5><ul className="list-inside list-disc space-y-0.5">{c.atividades_executadas.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  )}
                  {c.resultado && <div><h5 className="mb-1 font-semibold text-zinc-900">Resultado</h5><p>{c.resultado}</p></div>}
                  {c.pendencias && <div><h5 className="mb-1 font-semibold text-zinc-900">Pendências</h5><p>{c.pendencias}</p></div>}
                  {c.recomendacoes && <div><h5 className="mb-1 font-semibold text-zinc-900">Recomendações</h5><p>{c.recomendacoes}</p></div>}
                  {c.necessidade_adicional && (
                    <div><h5 className="mb-1 font-semibold text-zinc-900">Necessidade adicional</h5><p>{c.necessidade_adicional.tipo}{c.necessidade_adicional.descricao ? ` — ${c.necessidade_adicional.descricao}` : ""}</p></div>
                  )}
                  {(c.evidencia_fotografica.length > 0 || fotos.length > 0) && (
                    <div>
                      <h5 className="mb-1.5 font-semibold text-zinc-900">Evidências fotográficas ({fotos.length})</h5>
                      {fotos.length > 0 ? (
                        <GaleriaFotos
                          fotos={fotos.map((f, idx) => ({
                            src: mediaUrl(f.arquivo),
                            legenda: `${CATEGORIA_LABEL[f.categoria] || "Foto"} #${idx + 1}`
                          }))}
                        />
                      ) : (
                        <ul className="list-inside list-disc">{c.evidencia_fotografica.map((x, i) => <li key={i}>{x}</li>)}</ul>
                      )}
                    </div>
                  )}
                  {c.assinatura.nome && (
                    <div><h5 className="mb-1 font-semibold text-zinc-900">Assinatura do responsável</h5><p>{c.assinatura.nome}{c.assinatura.cargo ? ` (${c.assinatura.cargo})` : ""}{c.assinatura.data_hora ? ` — ${c.assinatura.data_hora}` : ""}</p></div>
                  )}
                  {c.tecnico && <p className="text-xs text-zinc-500">Técnico responsável: {c.tecnico}</p>}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}