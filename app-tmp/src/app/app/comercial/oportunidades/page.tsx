"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinhaVazia, Loading, Modal, PageHeader, Select, Tabela, Textarea } from "@/components/ui";

interface Relatorio { id: number; os_numero: string; cliente_nome: string }

interface Oportunidade {
  id: number;
  relatorio_id: number;
  tipo: string;
  descricao: string;
  valor_estimado: number | null;
  status: string;
  data_contato: string | null;
  resultado_contato: string | null;
  proposta_vinculada: string | null;
  previsao_fechamento: string | null;
  os_numero: string;
  cliente_nome: string;
  responsavel_nome: string | null;
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

const FORM_VAZIO = {
  relatorio_id: "", descricao: "", valor_estimado: "", status: "novo", data_contato: "", resultado_contato: "", proposta_vinculada: "", previsao_fechamento: ""
};

export default function OportunidadesPage() {
  const [oportunidades, setOportunidades] = useState<Oportunidade[] | null>(null);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ oportunidades: Oportunidade[] }>("/api/comercial/oportunidades").then((r) => setOportunidades(r.oportunidades)).catch((e) => setErro(e.message));
    api.get<{ relatorios: Relatorio[] }>("/api/comercial/relatorios").then((r) => setRelatorios(r.relatorios)).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNova() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(op: Oportunidade) {
    setEditando(op.id);
    setForm({
      relatorio_id: String(op.relatorio_id),
      descricao: op.descricao,
      valor_estimado: op.valor_estimado?.toString() || "",
      status: op.status,
      data_contato: op.data_contato || "",
      resultado_contato: op.resultado_contato || "",
      proposta_vinculada: op.proposta_vinculada || "",
      previsao_fechamento: op.previsao_fechamento || ""
    });
    setModalAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      const payload = {
        relatorio_id: Number(form.relatorio_id),
        descricao: form.descricao,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : undefined,
        status: form.status,
        data_contato: form.data_contato || undefined,
        resultado_contato: form.resultado_contato || undefined,
        proposta_vinculada: form.proposta_vinculada || undefined,
        previsao_fechamento: form.previsao_fechamento || undefined
      };
      if (editando === null) await api.post("/api/comercial/oportunidades", payload);
      else await api.put(`/api/comercial/oportunidades/${editando}`, payload);
      setMsg("Oportunidade salva.");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(op: Oportunidade) {
    setErro("");
    if (!confirm("Excluir esta oportunidade?")) return;
    try {
      await api.del(`/api/comercial/oportunidades/${op.id}`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const abertas = (oportunidades || []).filter((o) => !["aprovado", "perdido", "sem_oportunidade"].includes(o.status)).length;
  const valorTotal = (oportunidades || []).reduce((acc, o) => acc + (o.valor_estimado || 0), 0);

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Oportunidades Técnicas"
        descricao="Acompanhe e gerencie as oportunidades geradas pelos relatórios"
        acoes={<Botao onClick={abrirNova}>+ Nova oportunidade</Botao>}
      />

      {oportunidades !== null && oportunidades.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-blue-700">{abertas}</p>
            <p className="text-xs text-zinc-500">Oportunidades em aberto</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-emerald-700">{valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
            <p className="text-xs text-zinc-500">Valor total estimado</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-violet-700">{(oportunidades || []).filter((o) => ["em_negociacao", "proposta_enviada"].includes(o.status)).length}</p>
            <p className="text-xs text-zinc-500">Em negociação / proposta</p>
          </div>
        </div>
      )}

      <Card title={`Oportunidades (${oportunidades?.length ?? "..."})`}>
        <Tabela cabecalhos={["OS", "Cliente", "Descrição", "Valor", "Status", "Contato", "Proposta", "Responsável", "Ações"]}>
          {oportunidades === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : oportunidades.length === 0 ? (
            <LinhaVazia texto="Nenhuma oportunidade registrada." />
          ) : (
            oportunidades.map((op) => (
              <tr key={op.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-3 py-2 font-medium text-blue-700">{op.os_numero}</td>
                <td className="px-3 py-2">{op.cliente_nome}</td>
                <td className="max-w-52 truncate px-3 py-2">{op.descricao}</td>
                <td className="whitespace-nowrap px-3 py-2">{op.valor_estimado != null ? `R$ ${op.valor_estimado.toLocaleString("pt-BR")}` : "-"}</td>
                <td className="px-3 py-2"><Badge status={op.status} /></td>
                <td className="hidden px-3 py-2 md:table-cell">{op.data_contato || "-"}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{op.proposta_vinculada || "-"}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{op.responsavel_nome || "-"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Botao variante="secundario" onClick={() => abrirEdicao(op)}>Editar</Botao>
                    <Botao variante="perigo" onClick={() => excluir(op)}>Excluir</Botao>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>

      {modalAberto && (
        <Modal titulo={editando === null ? "Nova oportunidade" : `Editar oportunidade #${editando}`} onFechar={() => setModalAberto(false)} largura="max-w-2xl">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-2">
            <Select label="Relatório técnico recebido" value={form.relatorio_id} onChange={(e) => setForm({ ...form, relatorio_id: e.target.value })}>
              <option value="">Selecione...</option>
              {relatorios.map((r) => <option key={r.id} value={r.id}>{r.os_numero} — {r.cliente_nome}</option>)}
            </Select>
            <Select label="Status comercial" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUS_COMERCIAL.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </Select>
            <Campo label="Valor da oportunidade (R$)" type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} />
            <Campo label="Previsão de fechamento" type="date" value={form.previsao_fechamento} onChange={(e) => setForm({ ...form, previsao_fechamento: e.target.value })} />
            <Campo label="Data do contato" type="date" value={form.data_contato} onChange={(e) => setForm({ ...form, data_contato: e.target.value })} />
            <Campo label="Proposta vinculada" value={form.proposta_vinculada} onChange={(e) => setForm({ ...form, proposta_vinculada: e.target.value })} placeholder="Ex.: PRO-2026-001" />
            <Campo label="Resultado do contato" value={form.resultado_contato} onChange={(e) => setForm({ ...form, resultado_contato: e.target.value })} />
            <div className="md:col-span-2">
              <Textarea label="Descrição / observações" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3} />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Botao tipo="submit">{editando === null ? "Criar oportunidade" : "Salvar"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}