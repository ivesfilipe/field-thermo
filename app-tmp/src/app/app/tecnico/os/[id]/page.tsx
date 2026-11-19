"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api, mediaUrl } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, GaleriaFotos, LinksMapa, PageHeader, Prioridade, Select, Textarea } from "@/components/ui";
import { getModelo } from "@/lib/modelos";
import QrAvaliacao from "@/components/qr-avaliacao";

interface AssinaturaItem {
  id: number;
  nome: string;
  cargo: string;
  arquivo: string;
  criado_em?: string | null;
}

interface Execucao {
  id: number;
  diagnostico?: string | null;
  servico_executado: string | null;
  solucao?: string | null;
  observacoes: string | null;
  assinatura: string | null;
  assinatura_nome: string | null;
  assinatura_cargo: string | null;
  assinaturas?: AssinaturaItem[] | null;
  iniciada_em: string | null;
  concluida_em: string | null;
  complemento_solicitado: string | null;
  dados_modelo: Record<string, string> | null;
  assinatura_tecnico?: string | null;
  assinatura_tecnico_nome?: string | null;
  avaliacao_google_enviada_em?: string | null;
}

interface Anexo {
  id: number;
  categoria: string;
  arquivo: string;
  nome_original: string | null;
  legenda?: string | null;
  criado_em: string;
}

interface OS {
  id: number;
  numero: string;
  servico: string;
  descricao: string | null;
  prioridade: string;
  status: string;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  cliente_nome: string;
  cliente_telefone?: string | null;
  cliente_email?: string | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  local_responsavel: string | null;
  local_responsavel_telefone?: string | null;
  local_responsavel_email?: string | null;
  responsavel_local: string | null;
  equipamento_nome: string | null;
  equipamento_modelo: string | null;
  equipamento_serie: string | null;
  equipamento_capacidade: string | null;
  equipamento_patrimonio: string | null;
  equipamento_codigo_mt: string | null;
  equipamento_tipo: string | null;
  equipamento_fabricante: string | null;
  equipamento_gas: string | null;
  equipamento_tensao: string | null;
  equipamento_local: string | null;
  equipamento_ambiente: string | null;
  equipamento_status: string | null;
  equipamento_id: number | null;
  equipe_nome: string | null;
  tipo_atendimento: string | null;
  execucao: Execucao | null;
  anexos: Anexo[] | null;
  google_review_url?: string | null;
}

const CATEGORIAS_ANEXO = [
  { v: "antes", l: "Antes" },
  { v: "durante", l: "Durante" },
  { v: "depois", l: "Depois" },
  { v: "defeito", l: "Defeito / evidência" },
  { v: "equipamento", l: "Equipamento" },
  { v: "documento", l: "Documento / PDF" },
  { v: "outros", l: "Outros" }
];

const CATEGORIA_LABEL: Record<string, string> = Object.fromEntries(CATEGORIAS_ANEXO.map((c) => [c.v, c.l]));

function Item({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-slate-200/70 bg-slate-50/70 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</dt>
      <dd className="text-sm font-medium text-slate-900 break-words">{valor}</dd>
    </div>
  );
}

function PadAssinatura({
  onSalvar,
  extratorRef
}: {
  onSalvar: (blob: Blob) => Promise<void> | void;
  extratorRef?: React.MutableRefObject<(() => Promise<Blob | null>) | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const temDesenhoRef = useRef(false);
  const [temDesenho, setTemDesenho] = useState(false);

  const limpar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
    temDesenhoRef.current = false;
    setTemDesenho(false);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const largura = canvas.clientWidth;
    const altura = canvas.clientHeight;
    canvas.width = largura * dpr;
    canvas.height = altura * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1f2937";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, largura, altura);
  }, []);

  useEffect(() => {
    if (!extratorRef) return;
    extratorRef.current = () =>
      new Promise<Blob | null>((resolve) => {
        if (!temDesenhoRef.current || !canvasRef.current) {
          resolve(null);
          return;
        }
        canvasRef.current.toBlob((blob) => {
          limpar();
          resolve(blob || null);
        }, "image/png");
      });
  }, [extratorRef, limpar]);

  const posicao = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const iniciar = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    desenhando.current = true;
    const { x, y } = posicao(e);
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
    temDesenhoRef.current = true;
    setTemDesenho(true);
  };

  const mover = (e: React.PointerEvent) => {
    if (!desenhando.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = posicao(e);
    const ctx = canvas.getContext("2d")!;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const parar = (e?: React.PointerEvent) => {
    desenhando.current = false;
    if (e && canvasRef.current) {
      try {
        canvasRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <div>
      <div className="overflow-hidden rounded-lg border-2 border-dashed border-zinc-300 bg-white">
        <canvas
          ref={canvasRef}
          className="h-44 w-full touch-none"
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={parar}
          onPointerCancel={parar}
          onPointerLeave={() => { desenhando.current = false; }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Botao variante="secundario" className="px-3 py-1.5 text-sm" onClick={limpar} disabled={!temDesenho}>Limpar</Botao>
        <Botao
          className="px-3 py-1.5 text-sm"
          disabled={!temDesenho}
          onClick={async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (blob) {
              limpar();
              await onSalvar(blob);
            }
          }}
        >
          ✓ Adicionar assinatura
        </Botao>
      </div>
      <p className="mt-1 text-xs text-zinc-400">Peça para o cliente assinar com o dedo ou a caneta do dispositivo.</p>
    </div>
  );
}

export default function ExecucaoOsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [os, setOs] = useState<OS | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<"ordem" | "execucao">("ordem");
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoGoogle, setEnviandoGoogle] = useState(false);
  const [dispensouGoogle, setDispensouGoogle] = useState(false);

  const [form, setForm] = useState<{
    servico_executado: string;
    assinatura_nome: string;
    assinatura_cargo: string;
    assinaturas: AssinaturaItem[];
    dados_modelo: Record<string, string>;
  }>({
    servico_executado: "",
    assinatura_nome: "",
    assinatura_cargo: "",
    assinaturas: [],
    dados_modelo: {}
  });
  const [categoriaAnexo, setCategoriaAnexo] = useState("durante");
  const [legendaAnexo, setLegendaAnexo] = useState("");
  const [legendasEdit, setLegendasEdit] = useState<Record<number, string>>({});
  const [nomeTecnicoAssinatura, setNomeTecnicoAssinatura] = useState("");
  const [enviandoFotos, setEnviandoFotos] = useState(0);
  const extratorAssinaturaRef = useRef<(() => Promise<Blob | null>) | null>(null);

  const extrairListaAssinaturas = useCallback((ex: Execucao | null): AssinaturaItem[] => {
    return Array.isArray(ex?.assinaturas) && ex!.assinaturas.length > 0
      ? ex!.assinaturas
      : ex?.assinatura
      ? [{ id: 1, nome: ex.assinatura_nome || "", cargo: ex.assinatura_cargo || "", arquivo: ex.assinatura, criado_em: ex.concluida_em }]
      : [];
  }, []);

  const aplicarExecucao = useCallback((ex: Execucao | null, preservarCampos = false) => {
    const listaAss = extrairListaAssinaturas(ex);
    setNomeTecnicoAssinatura((atual) => (preservarCampos && atual ? atual : (ex?.assinatura_tecnico_nome || "")));
    setForm((atual) => ({
      servico_executado: preservarCampos ? atual.servico_executado : (ex?.servico_executado || ""),
      assinatura_nome: preservarCampos ? atual.assinatura_nome : "",
      assinatura_cargo: preservarCampos ? atual.assinatura_cargo : "",
      assinaturas: listaAss,
      dados_modelo: preservarCampos ? atual.dados_modelo : (ex?.dados_modelo || {})
    }));
  }, [extrairListaAssinaturas]);

  const carregar = useCallback((preservarCampos = false) => {
    api.get<{ os: OS }>(`/api/tecnico/os/${id}`).then((r) => {
      setOs(r.os);
      aplicarExecucao(r.os.execucao, preservarCampos);
    }).catch((e) => setErro(e.message));
  }, [id, aplicarExecucao]);

  useEffect(() => {
    carregar(false);
  }, [carregar]);

  const podeExecutar = os && ["em_andamento", "pendente", "em_deslocamento"].includes(os.status);
  const precisaComplemento = !!os?.execucao?.complemento_solicitado;

  async function iniciarDeslocamento() {
    setErro("");
    try {
      await api.post(`/api/tecnico/os/${id}/iniciar-deslocamento`);
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function iniciar() {
    setErro("");
    try {
      await api.post(`/api/tecnico/os/${id}/iniciar`);
      carregar(true);
      setAbaAtiva("execucao");
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const modelo = getModelo(os?.tipo_atendimento || null);

  function montarPayload() {
    const primeira = form.assinaturas[0];
    const payload: Record<string, unknown> = {
      assinatura_nome: primeira ? primeira.nome : form.assinatura_nome,
      assinatura_cargo: primeira ? primeira.cargo : form.assinatura_cargo
    };
    if (nomeTecnicoAssinatura.trim()) {
      payload.assinatura_tecnico_nome = nomeTecnicoAssinatura.trim();
    }
    if (form.assinaturas.length > 0) {
      payload.assinaturas = form.assinaturas;
    }
    const dm = form.dados_modelo || {};
    if (modelo) {
      payload.dados_modelo = dm;
      const instalacao = dm.descricao_instalacao;
      const preventiva = dm.descricao_servico;
      const corretiva = dm.diagnostico || dm.condicao_encontrada || dm.problema_relatado;
      const pmoc = [dm.condicao_geral ? `Condição geral: ${dm.condicao_geral}` : "", dm.estado_conservacao].filter(Boolean).join(". ");
      payload.servico_executado = [instalacao, preventiva, corretiva, pmoc].find((v) => v && String(v).trim()) || form.servico_executado;
      if (dm.recomendacoes) payload.recomendacoes = dm.recomendacoes;
      if (dm.condicao_equipamento) payload.condicao_equipamento = dm.condicao_equipamento;
      if (dm.diagnostico) payload.diagnostico = dm.diagnostico;
      if (dm.resultado) payload.resultado = dm.resultado;
      if (dm.necessidade_orcamento === "sim") payload.necessidade_adicional = "outro_servico";
    } else {
      payload.servico_executado = form.servico_executado;
    }
    return payload;
  }

  async function salvarAssinaturasPendentesNoPad() {
    if (extratorAssinaturaRef.current) {
      const blobPendente = await extratorAssinaturaRef.current();
      if (blobPendente) {
        const file = new File([blobPendente], "assinatura.png", { type: "image/png" });
        const fd = new FormData();
        fd.append("assinatura", file);
        fd.append("nome", form.assinatura_nome.trim());
        fd.append("cargo", form.assinatura_cargo.trim());
        await api.uploadForm(`/api/tecnico/os/${id}/assinatura`, fd);
        setForm((f) => ({ ...f, assinatura_nome: "", assinatura_cargo: "" }));
      }
    }
    if (extratorAssinaturaTecnicaRef.current) {
      const blobTec = await extratorAssinaturaTecnicaRef.current();
      if (blobTec) {
        const fileTec = new File([blobTec], "assinatura_tecnica.png", { type: "image/png" });
        const fdTec = new FormData();
        fdTec.append("assinatura", fileTec);
        fdTec.append("nome", nomeTecnicoAssinatura.trim() || os?.equipe_nome || "Técnico Responsável");
        await api.uploadForm(`/api/tecnico/os/${id}/assinatura-tecnica`, fdTec);
      }
    }
  }

  async function salvarRascunho() {
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      await salvarAssinaturasPendentesNoPad();
      setMsg("Rascunho salvo.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function comprimirImagem(file: File): Promise<File> {
    if (!file.type.startsWith("image/") || file.size < 220 * 1024) return file;
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1400;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) return resolve(file);
            const nomeBase = file.name.replace(/\.[^.]+$/, "") || "foto";
            resolve(new File([blob], `${nomeBase}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.78
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  }

  async function enviarAnexos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    e.target.value = "";
    setErro("");
    setEnviandoFotos(files.length);
    try {
      const comprimidos = await Promise.all(files.map(comprimirImagem));
      const fd = new FormData();
      fd.append("categoria", categoriaAnexo);
      if (legendaAnexo.trim()) fd.append("legenda", legendaAnexo.trim());
      for (const f of comprimidos) fd.append("arquivos", f);
      const resp = await api.uploadForm<{ anexos?: Anexo[] }>(`/api/tecnico/os/${id}/anexos`, fd);
      setLegendaAnexo("");
      if (resp?.anexos?.length) {
        setOs((atual) =>
          atual
            ? {
                ...atual,
                anexos: [
                  ...(atual.anexos || []),
                  ...resp.anexos!.map((a) => ({
                    id: a.id,
                    categoria: a.categoria || categoriaAnexo,
                    arquivo: a.arquivo,
                    nome_original: a.nome_original || null,
                    legenda: a.legenda || null,
                    criado_em: a.criado_em || new Date().toISOString()
                  }))
                ]
              }
            : atual
        );
      } else {
        carregar(true);
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviandoFotos(0);
    }
  }

  async function salvarLegendaAnexo(anexoId: number, legenda: string) {
    try {
      await api.patch(`/api/tecnico/os/${id}/anexos/${anexoId}`, { legenda });
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function removerAnexo(anexoId: number) {
    setErro("");
    try {
      await api.del(`/api/tecnico/os/${id}/anexos/${anexoId}`);
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function enviarAssinatura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro("");
    setMsg("");
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      const fd = new FormData();
      fd.append("assinatura", file);
      fd.append("nome", form.assinatura_nome.trim());
      fd.append("cargo", form.assinatura_cargo.trim());
      await api.uploadForm(`/api/tecnico/os/${id}/assinatura`, fd);
      setForm((f) => ({ ...f, assinatura_nome: "", assinatura_cargo: "" }));
      setMsg("Assinatura adicionada.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
    e.target.value = "";
  }

  async function salvarAssinaturaPad(blob: Blob) {
    setErro("");
    setMsg("");
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      const file = new File([blob], "assinatura.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("assinatura", file);
      fd.append("nome", form.assinatura_nome.trim());
      fd.append("cargo", form.assinatura_cargo.trim());
      await api.uploadForm(`/api/tecnico/os/${id}/assinatura`, fd);
      setForm((f) => ({ ...f, assinatura_nome: "", assinatura_cargo: "" }));
      setMsg("Assinatura adicionada.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const extratorAssinaturaTecnicaRef = useRef<(() => Promise<Blob | null>) | null>(null);

  async function salvarAssinaturaTecnicaPad(blob: Blob) {
    setErro("");
    setMsg("");
    try {
      const file = new File([blob], "assinatura_tecnica.png", { type: "image/png" });
      const fd = new FormData();
      fd.append("assinatura", file);
      fd.append("nome", nomeTecnicoAssinatura.trim() || os?.equipe_nome || "Técnico Responsável");
      await api.uploadForm(`/api/tecnico/os/${id}/assinatura-tecnica`, fd);
      setMsg("Assinatura técnica registrada com sucesso.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function enviarAssinaturaTecnica(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro("");
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("assinatura", file);
      fd.append("nome", nomeTecnicoAssinatura.trim() || os?.equipe_nome || "Técnico Responsável");
      await api.uploadForm(`/api/tecnico/os/${id}/assinatura-tecnica`, fd);
      setMsg("Assinatura técnica registrada com sucesso.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
    e.target.value = "";
  }

  async function removerAssinaturaTecnica() {
    setErro("");
    try {
      await api.del(`/api/tecnico/os/${id}/assinatura-tecnica`);
      setMsg("Assinatura técnica removida.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function removerAssinatura(assId: number) {
    setErro("");
    try {
      await api.del(`/api/tecnico/os/${id}/assinaturas/${assId}`);
      setMsg("Assinatura removida.");
      carregar(true);
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function concluir() {
    setErro("");
    setMsg("");
    const faltando = modelo
      ? modelo.campos.filter((c) => c.obrigatorio && !String(form.dados_modelo[c.chave] || "").trim()).map((c) => c.rotulo)
      : [];
    if (faltando.length) {
      setErro(`Preencha os campos obrigatórios: ${faltando.join(", ")}`);
      return;
    }
    setEnviando(true);
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      await salvarAssinaturasPendentesNoPad();
      await api.post(`/api/tecnico/os/${id}/concluir`);
      setDispensouGoogle(false);
      carregar(false);
      setMsg("OS concluída e relatório liberado automaticamente.");
      setAbaAtiva("execucao");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function enviarAvaliacaoGoogle(canal: "whatsapp" | "email", reenviar = false) {
    if (enviandoGoogle) return;
    setErro("");
    setMsg("");
    setEnviandoGoogle(true);
    try {
      const r = await api.post<{
        ok: boolean;
        canal: string;
        whatsapp_url?: string;
        destinatarios?: string[];
        remetente?: string;
        enviada_em: string;
      }>(
        `/api/tecnico/os/${id}/avaliacao-google`,
        { canal, reenviar }
      );
      if (r.ok) {
        if (r.canal === "email") {
          setMsg(`Avaliação do Google enviada automaticamente por e-mail (${r.remetente || "thermocontrol@medicalthermo.com"}) para ${(r.destinatarios || []).join(", ")}.`);
        } else if (r.whatsapp_url) {
          window.open(r.whatsapp_url, "_blank");
          setMsg("Link de avaliação do Google aberto no WhatsApp e registrado no histórico do atendimento.");
        }
        carregar(true);
      }
    } catch (err) {
      setErro((err as Error).message || "Não foi possível enviar o link de avaliação do Google.");
    } finally {
      setEnviandoGoogle(false);
    }
  }

  if (!os) {
    return <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />;
  }

  const anexos = os.anexos || [];
  const fotos = anexos.filter((a) => a.categoria !== "documento");
  const docs = anexos.filter((a) => a.categoria === "documento");

  return (
    <div className="space-y-4 pb-8">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo={os.numero}
        descricao={`${os.cliente_nome || "Sem cliente"} — ${os.equipe_nome || "Sem equipe"}`}
        acoes={<Botao variante="secundario" onClick={() => router.back()}>Voltar</Botao>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge status={os.status} />
        <Prioridade p={os.prioridade} />
        {modelo && (
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            Modelo: {modelo.rotulo}
          </span>
        )}
      </div>

      {/* Indicador de Etapas (mesmo padrão do Gestor) */}
      <div className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/90 bg-white p-3 text-xs sm:grid-cols-3">
        {[
          { k: "pendente", l: "1. Agendada / Pendente" },
          { k: "em_andamento", l: "2. Em Atendimento" },
          { k: "concluida", l: "3. Concluída e Relatório" }
        ].map((etapa, idx) => {
          const ordem = ["pendente", "em_andamento", "concluida"];
          const statusBase = os.status === "em_deslocamento" ? "em_andamento" : os.status === "aguardando_validacao" ? "concluida" : os.status;
          const atualIdx = ordem.indexOf(statusBase);
          const concluidaEtapa = atualIdx > idx || statusBase === "concluida";
          const ativa = atualIdx === idx && statusBase !== "concluida";
          return (
            <div
              key={etapa.k}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 font-semibold ${
                ativa
                  ? "border-blue-600 bg-blue-50 text-blue-900"
                  : concluidaEtapa
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-800"
                  : "border-slate-100 bg-slate-50 text-slate-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  ativa ? "bg-blue-700 text-white" : concluidaEtapa ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {concluidaEtapa ? "✓" : idx + 1}
              </span>
              <span className="truncate">{etapa.l}</span>
            </div>
          );
        })}
      </div>

      {/* SELETOR DE ABAS PRINCIPAL (OTIMIZADO MOBILE) */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => setAbaAtiva("ordem")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-center transition-all ${
            abaAtiva === "ordem"
              ? "bg-white font-bold text-blue-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900 font-medium"
          }`}
        >
          <span className="text-base">📋</span>
          <div className="text-left">
            <span className="block text-xs sm:text-sm leading-tight">1. Ordem de Serviço</span>
            <span className="block text-[10px] text-slate-500 font-normal">Consulta / Solicitação</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setAbaAtiva("execucao")}
          className={`flex items-center justify-center gap-2 rounded-lg py-2.5 px-3 text-center transition-all ${
            abaAtiva === "execucao"
              ? "bg-white font-bold text-blue-700 shadow-sm"
              : "text-slate-600 hover:text-slate-900 font-medium"
          }`}
        >
          <span className="text-base">✍️</span>
          <div className="text-left">
            <span className="block text-xs sm:text-sm leading-tight">2. Execução / Relatório</span>
            <span className="block text-[10px] text-slate-500 font-normal">Preenchimento de Campo</span>
          </div>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1 — ORDEM DE SERVIÇO (SOMENTE LEITURA PARA A EQUIPE CONSULTAR)        */}
      {/* ========================================================================= */}
      {abaAtiva === "ordem" && (
        <div className="space-y-4">
          {os.status === "pendente" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-center">
              <p className="text-sm font-semibold text-blue-900">Esta OS foi criada e solicitada pelo Gestor.</p>
              <p className="mt-1 text-xs text-blue-700">Verifique os dados abaixo antes de sair ou iniciar o atendimento.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Botao variante="secundario" className="py-3 text-sm sm:text-base font-semibold" onClick={iniciarDeslocamento}>
                  🚗 INICIAR DESLOCAMENTO
                </Botao>
                <Botao variante="sucesso" className="py-3 text-sm sm:text-base font-semibold" onClick={iniciar}>
                  ▶ INICIAR ATENDIMENTO
                </Botao>
              </div>
            </div>
          )}

          {os.status === "em_deslocamento" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
              <p className="text-sm font-semibold text-amber-900">Equipe em deslocamento para o local do atendimento.</p>
              <Botao variante="sucesso" className="mt-3 w-full py-3 text-base font-semibold" onClick={iniciar}>
                ▶ INICIAR ATENDIMENTO AGORA
              </Botao>
            </div>
          )}

          {precisaComplemento && (
            <Card title="Complemento solicitado pelo gestor">
              <p className="text-sm text-zinc-700">
                <strong className="text-zinc-900">Motivo:</strong> {os.execucao?.complemento_solicitado}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Acesse a aba &quot;Execução / Relatório&quot; para ajustar as informações e reenviar.</p>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="O que foi solicitado pelo Gestor (Demanda)">
              <dl className="grid grid-cols-2 gap-2.5 text-sm">
                <Item rotulo="Cliente" valor={os.cliente_nome} />
                <Item rotulo="Serviço" valor={os.servico} />
                <Item rotulo="Local" valor={os.local_nome || "-"} />
                <Item
                  rotulo="Endereço"
                  valor={
                    <span>
                      {os.local_endereco || "-"}
                      {os.local_endereco && (
                        <LinksMapa endereco={os.local_endereco_completo || os.local_endereco} />
                      )}
                    </span>
                  }
                />
                <Item rotulo="Responsável local" valor={os.local_responsavel || os.responsavel_local || "-"} />
                <Item rotulo="Equipe" valor={os.equipe_nome || "-"} />
              </dl>
              {os.descricao && (
                <div className="mt-3 border-t border-zinc-100 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Descrição / Observações do Gestor</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{os.descricao}</p>
                </div>
              )}
            </Card>

            <Card title="Agenda">
              <dl className="grid grid-cols-2 gap-2.5 text-sm">
                <Item
                  rotulo="Data agendada"
                  valor={os.data_agendada ? os.data_agendada.split("-").reverse().join("/") : "-"}
                />
                <Item
                  rotulo="Horário (Início / Fim)"
                  valor={os.hora_inicio || os.hora_fim ? `${os.hora_inicio || "--:--"} às ${os.hora_fim || "--:--"}` : "-"}
                />
                <Item rotulo="Equipe" valor={os.equipe_nome || "-"} />
                <Item rotulo="Prioridade" valor={<Prioridade p={os.prioridade} />} />
              </dl>
            </Card>

            {os.equipamento_id && (
              <div className="lg:col-span-2">
                <Card title="Equipamento">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-blue-700 px-2 py-0.5 font-mono text-sm font-bold text-white">
                      {os.equipamento_codigo_mt}
                    </span>
                    <span className="font-medium text-zinc-800">{os.equipamento_nome}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2.5 text-sm md:grid-cols-3">
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
              </div>
            )}
          </div>

          <div className="pt-2">
            <Botao
              variante="primario"
              className="w-full py-3 text-base flex items-center justify-center gap-2 shadow-sm font-semibold"
              onClick={() => {
                if (os.status === "pendente") {
                  iniciar();
                } else {
                  setAbaAtiva("execucao");
                }
              }}
            >
              <span>{os.status === "pendente" ? "▶ Iniciar Atendimento e Abrir Execução" : "Ir para Execução / Relatório"}</span>
              <span>→</span>
            </Botao>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2 — EXECUÇÃO / RELATÓRIO (FORMATO ORIGINAL DE FORMULÁRIO PRESERVADO) */}
      {/* ========================================================================= */}
      {abaAtiva === "execucao" && (
        <div className="space-y-4">
          {os.status === "pendente" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
              <p className="font-semibold text-blue-900">Atendimento ainda não iniciado</p>
              <p className="mt-1 text-sm text-blue-700">Para começar a preencher o formulário, fotos e assinaturas, inicie o atendimento.</p>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                <Botao variante="sucesso" className="py-3 px-6 text-base font-semibold" onClick={iniciar}>
                  ▶ INICIAR ATENDIMENTO AGORA
                </Botao>
                <Botao variante="secundario" className="py-3 px-6 text-base" onClick={() => setAbaAtiva("ordem")}>
                  ← Consultar Ordem de Serviço
                </Botao>
              </div>
            </div>
          )}

          {os.status === "em_deslocamento" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
              <p className="font-semibold text-amber-900">Equipe em deslocamento</p>
              <p className="mt-1 text-sm text-amber-700">Ao chegar no local, inicie o atendimento para preencher a execução.</p>
              <Botao variante="sucesso" className="mt-4 w-full py-3 text-base font-semibold" onClick={iniciar}>
                ▶ INICIAR ATENDIMENTO AGORA
              </Botao>
            </div>
          )}

          {precisaComplemento && (
            <Card title="Complemento solicitado pelo gestor">
              <p className="text-sm text-zinc-600">
                <strong className="text-zinc-800">Motivo:</strong> {os.execucao?.complemento_solicitado}
              </p>
              <p className="mt-1 text-xs text-zinc-500">Ajuste as informações abaixo e conclua novamente.</p>
            </Card>
          )}

          {/* FORMULÁRIO DE EXECUÇÃO EXATAMENTE NO FORMATO ORIGINAL */}
          {podeExecutar && os.status === "em_andamento" && (
            <>
              {modelo ? (
                <Card title={`1. ${modelo.rotulo}`}>
                  <p className="mb-3 text-sm text-zinc-500">Preencha somente as informações do atendimento — os dados do cliente e do equipamento já estão carregados.</p>
                  <div className="space-y-3">
                    {modelo.campos.map((campo) => (
                      <div key={campo.chave}>
                        {campo.tipo === "textarea" ? (
                          <Textarea
                            label={campo.rotulo}
                            rows={campo.chave === "descricao_instalacao" || campo.chave === "descricao_servico" || campo.chave === "atividades_realizadas" || campo.chave === "problema_relatado" || campo.chave === "diagnostico" ? 5 : 3}
                            value={form.dados_modelo[campo.chave] || ""}
                            onChange={(e) => setForm({ ...form, dados_modelo: { ...form.dados_modelo, [campo.chave]: e.target.value } })}
                          />
                        ) : campo.tipo === "select" ? (
                          <Select label={campo.rotulo} value={form.dados_modelo[campo.chave] || ""} onChange={(e) => setForm({ ...form, dados_modelo: { ...form.dados_modelo, [campo.chave]: e.target.value } })}>
                            <option value="">Selecione...</option>
                            {(campo.opcoes || []).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                          </Select>
                        ) : (
                          <Campo
                            label={campo.rotulo}
                            value={form.dados_modelo[campo.chave] || ""}
                            onChange={(e) => setForm({ ...form, dados_modelo: { ...form.dados_modelo, [campo.chave]: e.target.value } })}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <Card title="1. Descrição do serviço realizado">
                  <Textarea
                    label="Descreva o que foi feito no atendimento"
                    value={form.servico_executado}
                    onChange={(e) => setForm({ ...form, servico_executado: e.target.value })}
                    rows={6}
                    placeholder="Ex.: Realizada a limpeza dos filtros e a verificação geral do equipamento..."
                  />
                </Card>
              )}

              <Card title="2. Fotos">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {fotos.map((f) => {
                    const legendaAtual = legendasEdit[f.id] !== undefined ? legendasEdit[f.id] : (f.legenda || "");
                    return (
                      <div key={f.id} className="group relative rounded-lg border border-zinc-200 bg-zinc-50/70 p-2.5">
                        <a href={mediaUrl(f.arquivo)} target="_blank" rel="noopener noreferrer" title="Clique para abrir a foto" className="block">
                          <Image src={mediaUrl(f.arquivo)} alt={legendaAtual || `Anexo ${CATEGORIA_LABEL[f.categoria] || f.categoria}`} width={320} height={180} className="h-36 w-full rounded-md border border-zinc-200 object-cover transition hover:border-blue-600" />
                        </a>
                        <button type="button" onClick={() => removerAnexo(f.id)} className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow" title="Remover">×</button>
                        <textarea
                          rows={2}
                          value={legendaAtual}
                          onChange={(e) => setLegendasEdit((prev) => ({ ...prev, [f.id]: e.target.value }))}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== (f.legenda || "").trim()) {
                              salvarLegendaAnexo(f.id, e.target.value);
                            }
                          }}
                          placeholder="Escreva a legenda da foto..."
                          className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-blue-600 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
                {docs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                        <a href={mediaUrl(d.arquivo)} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline hover:text-blue-800">
                          📄 {d.nome_original || d.arquivo.split("/").pop()}
                        </a>
                        <button onClick={() => removerAnexo(d.id)} className="text-xs text-red-600 hover:underline">Remover</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3">
                  <label className={`inline-block rounded-md border border-blue-600 px-4 py-2 text-center text-sm font-semibold ${enviandoFotos > 0 ? "cursor-wait bg-blue-100 text-blue-600 opacity-80" : "cursor-pointer bg-blue-50 text-blue-800 hover:bg-blue-100"}`}>
                    {enviandoFotos > 0 ? `Enviando ${enviandoFotos} foto(s)...` : "+ Adicionar fotos da galeria"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={enviandoFotos > 0}
                      className="hidden"
                      onChange={enviarAnexos}
                    />
                  </label>
                </div>
              </Card>

              <Card title={`3. Assinaturas dos responsáveis (${form.assinaturas.length})`}>
                {form.assinaturas.length > 0 && (
                  <div className="mb-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assinaturas registradas</p>
                    {form.assinaturas.map((ass, idx) => (
                      <div key={ass.id || idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-zinc-700">Assinatura #{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removerAssinatura(ass.id)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            Remover assinatura
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Campo
                            label="Nome do responsável"
                            value={ass.nome}
                            onChange={(e) => {
                              const novas = [...form.assinaturas];
                              novas[idx] = { ...novas[idx], nome: e.target.value };
                              setForm({ ...form, assinaturas: novas });
                            }}
                            placeholder="Nome de quem assinou"
                          />
                          <Campo
                            label="Cargo / função (opcional)"
                            value={ass.cargo}
                            onChange={(e) => {
                              const novas = [...form.assinaturas];
                              novas[idx] = { ...novas[idx], cargo: e.target.value };
                              setForm({ ...form, assinaturas: novas });
                            }}
                            placeholder="Ex.: Supervisor de manutenção"
                          />
                        </div>
                        <div className="mt-2">
                          <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={600} height={212} className="h-20 w-auto rounded-md border border-zinc-200 bg-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                  <p className="mb-2 text-sm font-semibold text-zinc-800">
                    {form.assinaturas.length > 0 ? "+ Adicionar outra assinatura" : "Adicionar assinatura do responsável"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Nome do responsável pelo local" value={form.assinatura_nome} onChange={(e) => setForm({ ...form, assinatura_nome: e.target.value })} placeholder="Nome de quem recebeu o atendimento" />
                    <Campo label="Cargo / função (opcional)" value={form.assinatura_cargo} onChange={(e) => setForm({ ...form, assinatura_cargo: e.target.value })} placeholder="Ex.: Supervisor de manutenção" />
                  </div>
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium text-zinc-700">Desenhe a assinatura abaixo e clique em &ldquo;✓ Adicionar assinatura&rdquo;</p>
                    <div className="mt-2">
                      <PadAssinatura onSalvar={salvarAssinaturaPad} extratorRef={extratorAssinaturaRef} />
                    </div>
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <label className="cursor-pointer text-sm font-medium text-blue-600 underline hover:text-blue-800">
                        Enviar imagem de assinatura (alternativa)
                        <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={enviarAssinatura} />
                      </label>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">Você pode adicionar quantas assinaturas forem necessárias.</p>
                  </div>
                </div>
              </Card>

              <Card title="4. Assinatura Técnica (Executante)">
                <div className="mb-3">
                  <Campo
                    label="Nome do técnico"
                    value={nomeTecnicoAssinatura}
                    onChange={(e) => setNomeTecnicoAssinatura(e.target.value)}
                    placeholder="Digite o nome do técnico responsável pelo atendimento"
                  />
                </div>
                {os.execucao?.assinatura_tecnico ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Assinatura Técnica Homologada</span>
                        <p className="mt-1 text-sm font-bold text-zinc-900">{nomeTecnicoAssinatura.trim() || os.execucao.assinatura_tecnico_nome || "Técnico Responsável"}</p>
                        <p className="text-xs text-zinc-500">Execução técnica de campo registrada no laudo</p>
                      </div>
                      <button
                        type="button"
                        onClick={removerAssinaturaTecnica}
                        className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Alterar / Remover
                      </button>
                    </div>
                    <div className="mt-3">
                      <Image src={mediaUrl(os.execucao.assinatura_tecnico)} alt="Assinatura Técnica" width={600} height={212} className="h-20 w-auto rounded-md border border-blue-200 bg-white" />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                    <p className="mb-2 text-sm font-semibold text-zinc-800">
                      Assinatura do Técnico / Responsável Técnico
                    </p>
                    <p className="mb-3 text-xs text-zinc-500">
                      Registre a sua assinatura técnica digital para constar no termo de homologação do relatório técnico.
                    </p>
                    <PadAssinatura onSalvar={salvarAssinaturaTecnicaPad} extratorRef={extratorAssinaturaTecnicaRef} />
                    <div className="mt-3 border-t border-zinc-200 pt-3">
                      <label className="cursor-pointer text-sm font-medium text-blue-600 underline hover:text-blue-800">
                        Enviar imagem de assinatura técnica (alternativa)
                        <input type="file" accept="image/*" className="hidden" onChange={enviarAssinaturaTecnica} />
                      </label>
                    </div>
                  </div>
                )}
              </Card>

              <div className="flex flex-wrap gap-2">
                <Botao variante="secundario" onClick={salvarRascunho} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar rascunho"}
                </Botao>
                <Botao variante="sucesso" className="flex-1 py-3 text-base" onClick={concluir} disabled={enviando}>
                  {enviando ? "Enviando..." : precisaComplemento ? "Reenviar e concluir" : "Finalizar OS"}
                </Botao>
              </div>

              <Card title="Avaliação no Google (Opcional)">
                <div className="space-y-4">
                  <QrAvaliacao
                    url={os.google_review_url}
                    titulo="QR Code — Avaliação no Google"
                    subtitulo="Mostre a tela do celular para o cliente escanear e avaliar"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="text-slate-600">
                    <p>Envie o link de avaliação do Google apenas se considerar apropriado para este atendimento.</p>
                    <div className="mt-1 text-xs text-slate-500">
                      <span>E-mail destinatário: <strong>{os.local_responsavel_email || os.cliente_email || "Não cadastrado"}</strong></span>
                    </div>
                  </div>
                  {os.execucao?.avaliacao_google_enviada_em ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Enviado em {os.execucao.avaliacao_google_enviada_em.slice(0, 16)}
                      </span>
                      <Botao
                        variante="secundario"
                        className="px-3 py-1.5 text-xs"
                        disabled={enviandoGoogle}
                        onClick={() => enviarAvaliacaoGoogle("email", true)}
                      >
                        {enviandoGoogle ? "Enviando..." : "Reenviar avaliação do Google"}
                      </Botao>
                    </div>
                  ) : (
                    <Botao
                      variante="sucesso"
                      disabled={enviandoGoogle}
                      onClick={() => enviarAvaliacaoGoogle("email", false)}
                    >
                      {enviandoGoogle ? "Enviando..." : "Enviar avaliação do Google"}
                    </Botao>
                  )}
                </div>
                </div>
              </Card>
            </>
          )}

          {/* VISUALIZAÇÃO APÓS CONCLUSÃO DA OS (mesmo padrão do Gestor) */}
          {(os.status === "aguardando_validacao" || os.status === "concluida") && (
            <div className="space-y-4">
              {os.execucao && (
                <Card title="Execução realizada pela equipe (Relatório)">
                  {os.execucao.diagnostico && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Diagnóstico da equipe</p>
                      <p className="whitespace-pre-wrap text-sm text-amber-950">{os.execucao.diagnostico}</p>
                    </div>
                  )}
                  {os.execucao.servico_executado && (
                    <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700">Serviço executado</p>
                      <p className="whitespace-pre-wrap text-sm text-blue-900">{os.execucao.servico_executado}</p>
                    </div>
                  )}
                  {os.execucao.solucao && (
                    <div className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">Solução aplicada</p>
                      <p className="whitespace-pre-wrap text-sm text-emerald-950">{os.execucao.solucao}</p>
                    </div>
                  )}
                  {os.execucao.observacoes && (
                    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">Observações da equipe</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{os.execucao.observacoes}</p>
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-2.5 text-sm">
                    <Item rotulo="Início da execução" valor={os.execucao.iniciada_em?.slice(0, 16) || "-"} />
                    <Item rotulo="Conclusão da execução" valor={os.execucao.concluida_em?.slice(0, 16) || "-"} />
                  </dl>
                </Card>
              )}

              <Card title="Avaliação do Cliente no Google (Opcional)">
                <div className="mb-4">
                  <QrAvaliacao
                    url={os.google_review_url}
                    titulo="QR Code — Avaliação no Google"
                    subtitulo="Mostre a tela do celular para o cliente escanear e avaliar"
                  />
                </div>
                {os.execucao?.avaliacao_google_enviada_em ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 text-emerald-700">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold">✓</span>
                      <span>
                        Link de avaliação do Google enviado por e-mail em <strong>{os.execucao.avaliacao_google_enviada_em.slice(0, 16)}</strong>
                      </span>
                    </div>
                    <Botao
                      variante="secundario"
                      className="px-3 py-1.5 text-xs"
                      disabled={enviandoGoogle}
                      onClick={() => enviarAvaliacaoGoogle("email", true)}
                    >
                      {enviandoGoogle ? "Enviando..." : "Reenviar avaliação do Google"}
                    </Botao>
                  </div>
                ) : dispensouGoogle ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                    <span>Envio da avaliação do Google dispensado para este atendimento.</span>
                    <Botao
                      variante="secundario"
                      className="px-3 py-1.5 text-xs"
                      disabled={enviandoGoogle}
                      onClick={() => enviarAvaliacaoGoogle("email", false)}
                    >
                      {enviandoGoogle ? "Enviando..." : "Enviar avaliação do Google"}
                    </Botao>
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <p className="text-slate-700">
                      Atendimento concluído! Caso considere que o cliente ficou satisfeito e vale a pena solicitar uma avaliação no Google:
                    </p>
                    <div className="text-xs text-slate-500">
                      <span>E-mail destinatário: <strong>{os.local_responsavel_email || os.cliente_email || "Não cadastrado"}</strong></span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Botao
                        variante="sucesso"
                        disabled={enviandoGoogle}
                        onClick={() => enviarAvaliacaoGoogle("email", false)}
                      >
                        {enviandoGoogle ? "Enviando..." : "Enviar avaliação do Google"}
                      </Botao>
                      <Botao
                        variante="secundario"
                        disabled={enviandoGoogle}
                        onClick={() => setDispensouGoogle(true)}
                      >
                        Agora não
                      </Botao>
                    </div>
                  </div>
                )}
              </Card>

              {form.assinaturas.length > 0 && (
                <Card title={`Assinatura(s) do Responsável (${form.assinaturas.length})`}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {form.assinaturas.map((ass, idx) => (
                      <div key={ass.id || idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <Image src={mediaUrl(ass.arquivo)} alt={`Assinatura ${ass.nome || idx + 1}`} width={600} height={212} className="h-16 w-auto rounded border border-zinc-200 bg-white" />
                        <p className="mt-1 text-xs font-bold text-zinc-900">{ass.nome || "Responsável"}</p>
                        {ass.cargo && <p className="text-[11px] text-zinc-500">{ass.cargo}</p>}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {os.execucao?.assinatura_tecnico && (
                <Card title="Assinatura Técnica Registrada">
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">Técnico Responsável</span>
                    <div className="mt-2">
                      <Image src={mediaUrl(os.execucao.assinatura_tecnico)} alt="Assinatura Técnica" width={600} height={212} className="h-16 w-auto rounded border border-blue-200 bg-white" />
                    </div>
                    <p className="mt-1 text-xs font-bold text-zinc-900">{os.execucao.assinatura_tecnico_nome || "Técnico Executor"}</p>
                  </div>
                </Card>
              )}

              {fotos.length > 0 && (
                <Card title={`Fotos enviadas (${fotos.length}) — Clique na foto para abrir`}>
                  <GaleriaFotos
                    fotos={fotos.map((f, idx) => ({
                      src: mediaUrl(f.arquivo),
                      legenda: f.legenda || `${CATEGORIA_LABEL[f.categoria] || "Foto"} #${idx + 1}`
                    }))}
                  />
                </Card>
              )}

              {os.status === "concluida" && (
                <Card title="Status">
                  <p className="text-sm text-zinc-600">Atendimento concluído em {os.execucao?.concluida_em?.slice(0, 16) || "-"}. Relatório liberado automaticamente. A edição técnica está bloqueada.</p>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
