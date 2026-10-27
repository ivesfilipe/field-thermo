"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { api, mediaUrl } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinksMapa, PageHeader, Prioridade, Select, Textarea } from "@/components/ui";
import { getModelo } from "@/lib/modelos";

interface Execucao {
  id: number;
  servico_executado: string | null;
  observacoes: string | null;
  assinatura: string | null;
  assinatura_nome: string | null;
  assinatura_cargo: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
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
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  local_responsavel: string | null;
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
    <>
      <dt className="text-zinc-500">{rotulo}</dt>
      <dd className="font-medium text-zinc-800">{valor}</dd>
    </>
  );
}

function PadAssinatura({ onSalvar }: { onSalvar: (blob: Blob) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const [temDesenho, setTemDesenho] = useState(false);

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

  const posicao = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const iniciar = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    desenhando.current = true;
    const { x, y } = posicao(e);
    const ctx = canvas.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(x, y);
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

  const parar = () => {
    desenhando.current = false;
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemDesenho(false);
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
          onPointerLeave={parar}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Botao variante="secundario" className="px-3 py-1.5 text-sm" onClick={limpar} disabled={!temDesenho}>Limpar</Botao>
        <Botao
          className="px-3 py-1.5 text-sm"
          disabled={!temDesenho}
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            canvas.toBlob((blob) => {
              if (blob) onSalvar(blob);
            }, "image/png");
          }}
        >
          ✓ Salvar assinatura
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
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState<{
    servico_executado: string;
    assinatura_nome: string;
    assinatura_cargo: string;
    dados_modelo: Record<string, string>;
  }>({
    servico_executado: "",
    assinatura_nome: "",
    assinatura_cargo: "",
    dados_modelo: {}
  });
  const [categoriaAnexo, setCategoriaAnexo] = useState("durante");

  const aplicarExecucao = useCallback((ex: Execucao | null) => {
    setForm({
      servico_executado: ex?.servico_executado || "",
      assinatura_nome: ex?.assinatura_nome || "",
      assinatura_cargo: ex?.assinatura_cargo || "",
      dados_modelo: ex?.dados_modelo || {}
    });
  }, []);

  const carregar = useCallback(() => {
    api.get<{ os: OS }>(`/api/tecnico/os/${id}`).then((r) => {
      setOs(r.os);
      aplicarExecucao(r.os.execucao);
    }).catch((e) => setErro(e.message));
  }, [id, aplicarExecucao]);

  useEffect(carregar, [carregar]);

  const podeExecutar = os && ["em_andamento", "pendente", "em_deslocamento"].includes(os.status);
  const precisaComplemento = !!os?.execucao?.complemento_solicitado;

  async function iniciarDeslocamento() {
    setErro("");
    try {
      await api.post(`/api/tecnico/os/${id}/iniciar-deslocamento`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function iniciar() {
    setErro("");
    try {
      await api.post(`/api/tecnico/os/${id}/iniciar`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const modelo = getModelo(os?.tipo_atendimento || null);

  function montarPayload() {
    const payload: Record<string, unknown> = {
      assinatura_nome: form.assinatura_nome,
      assinatura_cargo: form.assinatura_cargo
    };
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

  async function salvarRascunho() {
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      setMsg("Rascunho salvo.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function enviarAnexos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setErro("");
    try {
      const fd = new FormData();
      fd.append("categoria", categoriaAnexo);
      for (const f of files) fd.append("arquivos", f);
      await api.uploadForm(`/api/tecnico/os/${id}/anexos`, fd);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
    e.target.value = "";
  }

  async function removerAnexo(anexoId: number) {
    setErro("");
    if (!confirm("Remover este anexo?")) return;
    try {
      await api.del(`/api/tecnico/os/${id}/anexos/${anexoId}`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function enviarAssinatura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro("");
    try {
      await api.upload(`/api/tecnico/os/${id}/assinatura`, "assinatura", file);
      setMsg("Assinatura enviada.");
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
    e.target.value = "";
  }

  async function salvarAssinaturaPad(blob: Blob) {
    setErro("");
    setMsg("");
    try {
      const file = new File([blob], "assinatura.png", { type: "image/png" });
      await api.upload(`/api/tecnico/os/${id}/assinatura`, "assinatura", file);
      setMsg("Assinatura do cliente registrada.");
      carregar();
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
    if (!confirm("Concluir a execução e enviar para validação do gestor?")) return;
    setEnviando(true);
    try {
      await api.put(`/api/tecnico/os/${id}/execucao`, montarPayload());
      await api.post(`/api/tecnico/os/${id}/concluir`);
      carregar();
      setMsg("OS enviada para validação do gestor.");
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  if (!os) {
    return <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />;
  }

  const anexos = os.anexos || [];
  const fotos = anexos.filter((a) => a.categoria !== "documento");
  const docs = anexos.filter((a) => a.categoria === "documento");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo={os.numero}
        descricao={os.servico}
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

      <Card title="Dados da OS (preenchidos pelo gestor)">
        <dl className="grid grid-cols-2 gap-y-2.5 text-sm md:grid-cols-3">
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
          <Item rotulo="Responsável" valor={os.local_responsavel || os.responsavel_local || "-"} />
          <Item rotulo="Serviço a realizar" valor={os.servico} />
          <Item rotulo="Equipe" valor={os.equipe_nome || "-"} />
          <Item rotulo="Data / horário" valor={`${os.data_agendada || "-"}${os.hora_inicio ? ` ${os.hora_inicio}${os.hora_fim ? `–${os.hora_fim}` : ""}` : ""}`} />
        </dl>
      </Card>

      {os.equipamento_id && (
        <Card title="Equipamento a ser atendido">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <span className="rounded-md bg-blue-700 px-2 py-0.5 font-mono text-sm font-bold text-white">{os.equipamento_codigo_mt}</span>
            <span className="font-medium text-blue-900">{os.equipamento_nome}</span>
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
          </dl>
        </Card>
      )}

      {precisaComplemento && (
        <Card title="Complemento solicitado pelo gestor">
          <p className="text-sm text-zinc-600">
            <strong className="text-zinc-800">Motivo:</strong> {os.execucao?.complemento_solicitado}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Ajuste as informações abaixo e reenvie para validação.</p>
        </Card>
      )}

      {os.status === "pendente" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-center">
          <p className="text-sm text-blue-700">As informações foram preenchidas pelo gestor — você não precisa redigitá-las.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Botao variante="secundario" className="py-3 text-base" onClick={iniciarDeslocamento}>
              🚗 INICIAR DESLOCAMENTO
            </Botao>
            <Botao variante="sucesso" className="py-3 text-base" onClick={iniciar}>
              ▶ INICIAR ATENDIMENTO
            </Botao>
          </div>
          <p className="mt-2 text-xs text-blue-500">Registre o deslocamento quando sair para o local ou inicie diretamente o atendimento.</p>
        </div>
      )}

      {os.status === "em_deslocamento" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-700">Em deslocamento para o local do atendimento.</p>
          <Botao variante="sucesso" className="mt-4 w-full py-3 text-base" onClick={iniciar}>
            ▶ INICIAR ATENDIMENTO
          </Botao>
        </div>
      )}

      {podeExecutar && (
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
            <div className="flex flex-wrap gap-2">
              {fotos.map((f) => (
                <div key={f.id} className="group relative">
                  <Image src={mediaUrl(f.arquivo)} alt={`Anexo ${CATEGORIA_LABEL[f.categoria] || f.categoria}`} width={96} height={96} className="h-24 w-24 rounded-md border border-zinc-200 object-cover" />
                  <button onClick={() => removerAnexo(f.id)} className="absolute -top-1.5 -right-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex" title="Remover">×</button>
                  <p className="mt-0.5 text-center text-[10px] text-zinc-400">{CATEGORIA_LABEL[f.categoria] || f.categoria}</p>
                </div>
              ))}
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select label="" value={categoriaAnexo} onChange={(e) => setCategoriaAnexo(e.target.value)}>
                {CATEGORIAS_ANEXO.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
              </Select>
              <label className="cursor-pointer rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                + Adicionar fotos
                <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={enviarAnexos} />
              </label>
            </div>
            <p className="mt-2 text-xs text-zinc-400">Adicione múltiplas fotos do atendimento. Elas ficam vinculadas à OS.</p>
          </Card>

          <Card title="4. Assinatura do responsável pelo local">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo label="Nome do responsável pelo local" value={form.assinatura_nome} onChange={(e) => setForm({ ...form, assinatura_nome: e.target.value })} placeholder="Nome de quem recebeu o atendimento" />
              <Campo label="Cargo / função (opcional)" value={form.assinatura_cargo} onChange={(e) => setForm({ ...form, assinatura_cargo: e.target.value })} placeholder="Ex.: Supervisor de manutenção" />
            </div>
            <div className="mt-3">
              {os.execucao?.assinatura ? (
                <div>
                  <p className="mb-1 text-sm font-medium text-zinc-700">Assinatura registrada</p>
                  <Image src={mediaUrl(os.execucao.assinatura)} alt="Assinatura" width={600} height={212} className="h-24 w-auto rounded-md border border-zinc-200" />
                  <p className="mt-2 text-xs text-zinc-400">Se necessário, desenhe novamente abaixo ou envie outra imagem para substituir.</p>
                </div>
              ) : (
                <p className="mb-1 text-sm font-medium text-zinc-700">Assinatura do cliente na hora do atendimento</p>
              )}
              <div className="mt-2">
                <PadAssinatura onSalvar={salvarAssinaturaPad} />
              </div>
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <label className="cursor-pointer text-sm font-medium text-blue-600 underline hover:text-blue-800">
                  Enviar imagem de assinatura (alternativa)
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={enviarAssinatura} />
                </label>
              </div>
              <p className="mt-2 text-xs text-zinc-400">Data/hora registradas automaticamente na finalização.</p>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={salvarRascunho} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar rascunho"}
            </Botao>
            <Botao variante="sucesso" className="flex-1 py-3 text-base" onClick={concluir} disabled={enviando}>
              {enviando ? "Enviando..." : precisaComplemento ? "Reenviar para validação" : "Finalizar e enviar para validação"}
            </Botao>
          </div>
        </>
      )}

      {os.status === "aguardando_validacao" && (
        <Card title="Status">
          <p className="text-sm text-zinc-600">
            Execução finalizada em {os.execucao?.concluida_em?.slice(0, 16) || "-"}. Aguardando validação do gestor. A edição técnica está bloqueada.
          </p>
        </Card>
      )}

      {os.status === "concluida" && (
        <Card title="Status">
          <p className="text-sm text-zinc-600">Atendimento concluído e validado pelo gestor.</p>
        </Card>
      )}
    </div>
  );
}