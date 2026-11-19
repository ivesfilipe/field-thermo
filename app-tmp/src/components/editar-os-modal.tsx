"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Modal, Select, Textarea } from "@/components/ui";
import SelecionarCliente, { ClienteOpcao } from "@/components/selecionar-cliente";
import { MODELOS } from "@/lib/modelos";

interface Local { id: number; cliente_id: number; nome: string; endereco: string | null; cidade: string | null; responsavel_nome: string | null }
interface Equipe { id: number; nome: string }
interface Equipamento { id: number; codigo_mt: string | null; nome: string | null; status: string }

export interface OsEditavel {
  id: number;
  numero: string;
  status: string;
  cliente_id: number;
  local_id?: number | null;
  responsavel_local: string | null;
  equipamento_id: number | null;
  equipe_id?: number | null;
  servico: string;
  descricao: string | null;
  prioridade: string;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  tipo_atendimento: string | null;
  execucao?: {
    diagnostico?: string | null;
    servico_executado?: string | null;
    solucao?: string | null;
    observacoes?: string | null;
  } | null;
}

export default function EditarOsModal({ os, onFechar, onSalvo }: { os: OsEditavel; onFechar: () => void; onSalvo: (msg: string) => void }) {
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [erro, setErro] = useState("");
  const [conflitos, setConflitos] = useState<Array<{ referencia: string; motivo: string; horario: string }> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    cliente_id: String(os.cliente_id || ""),
    local_id: os.local_id ? String(os.local_id) : "",
    responsavel_local: os.responsavel_local || "",
    equipamento_id: os.equipamento_id ? String(os.equipamento_id) : "",
    equipe_id: os.equipe_id ? String(os.equipe_id) : "",
    servico: os.servico || "",
    descricao: os.descricao || "",
    prioridade: os.prioridade || "media",
    data_agendada: os.data_agendada || "",
    hora_inicio: os.hora_inicio || "",
    hora_fim: os.hora_fim || "",
    tipo_atendimento: os.tipo_atendimento || "",
    diagnostico: os.execucao?.diagnostico || "",
    servico_executado: os.execucao?.servico_executado || "",
    solucao: os.execucao?.solucao || "",
    observacoes_equipe: os.execucao?.observacoes || ""
  });

  useEffect(() => {
    api.get<{ clientes: ClienteOpcao[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch((e) => setErro(e.message));
    api.get<{ locais: Local[] }>("/api/gestor/locais").then((r) => setLocais(r.locais)).catch(() => {});
    api.get<{ equipes: Equipe[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  const clienteId = form.cliente_id ? Number(form.cliente_id) : null;
  const locaisFiltrados = locais.filter((l) => !clienteId || l.cliente_id === clienteId);

  useEffect(() => {
    if (!clienteId) {
      setEquipamentos([]);
      return;
    }
    api.get<{ equipamentos: Equipamento[] }>(`/api/gestor/equipamentos?cliente_id=${clienteId}`)
      .then((r) => setEquipamentos(r.equipamentos))
      .catch(() => setEquipamentos([]));
  }, [clienteId]);

  const equipamentosVisiveis = equipamentos.filter((e) => e.status !== "desativado" || String(e.id) === form.equipamento_id);

  async function salvar(ignorarConflitos = false) {
    setErro("");
    setConflitos(null);
    if (!form.cliente_id) return setErro("Selecione o cliente.");
    if (!form.equipe_id) return setErro("Selecione a equipe.");
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        cliente_id: Number(form.cliente_id),
        local_id: form.local_id ? Number(form.local_id) : null,
        responsavel_local: form.responsavel_local || null,
        equipamento_id: form.equipamento_id ? Number(form.equipamento_id) : null,
        equipe_id: Number(form.equipe_id),
        servico: form.servico.trim() || os.servico,
        descricao: form.descricao || null,
        prioridade: form.prioridade,
        data_agendada: form.data_agendada || null,
        hora_inicio: form.hora_inicio || null,
        hora_fim: form.hora_fim || null,
        tipo_atendimento: form.tipo_atendimento || null,
        ignorar_conflitos: ignorarConflitos || undefined
      };
      if (os.execucao) {
        payload.diagnostico = form.diagnostico;
        payload.servico_executado = form.servico_executado;
        payload.solucao = form.solucao;
        payload.observacoes_equipe = form.observacoes_equipe;
      }
      await api.put(`/api/gestor/os/${os.id}`, payload);
      onSalvo("OS atualizada.");
    } catch (err) {
      const e = err as { status?: number; conflitos?: Array<{ referencia: string; motivo: string; horario: string }>; message?: string };
      if (e?.status === 409 && Array.isArray(e?.conflitos)) setConflitos(e.conflitos);
      else setErro(e?.message || "Erro ao salvar a OS");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={`Editar ${os.numero}`} onFechar={onFechar} largura="max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="space-y-3">
        <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
        {conflitos && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
            <p className="font-medium text-red-700">Conflito de agenda detectado</p>
            <ul className="mt-1 list-inside list-disc text-red-600">
              {conflitos.map((c, i) => <li key={i}>{c.referencia} — {c.motivo === "tecnico" ? "técnico" : "equipe"} ocupado em {c.horario}</li>)}
            </ul>
            <div className="mt-2 flex gap-2">
              <Botao variante="perigo" disabled={salvando} onClick={() => salvar(true)}>Salvar mesmo assim</Botao>
              <Botao variante="secundario" onClick={() => setConflitos(null)}>Ajustar</Botao>
            </div>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          <SelecionarCliente
            clientes={clientes}
            value={form.cliente_id}
            onChange={(v) => setForm({ ...form, cliente_id: v, local_id: v === form.cliente_id ? form.local_id : "", equipamento_id: v === form.cliente_id ? form.equipamento_id : "" })}
          />
          <Select label="Equipamento (MT)" value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })}>
            <option value="">Sem equipamento</option>
            {equipamentosVisiveis.map((eq) => <option key={eq.id} value={eq.id}>{eq.codigo_mt || eq.nome}{eq.nome && eq.codigo_mt ? ` - ${eq.nome}` : ""}</option>)}
          </Select>
          <Select label="Endereço / Local" value={form.local_id} onChange={(e) => {
            const local = locaisFiltrados.find((l) => String(l.id) === e.target.value);
            setForm({ ...form, local_id: e.target.value, responsavel_local: local?.responsavel_nome || form.responsavel_local });
          }}>
            <option value="">Sem endereço</option>
            {locaisFiltrados.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.endereco ? ` — ${l.endereco}` : ""}{l.cidade ? ` (${l.cidade})` : ""}</option>)}
          </Select>
          <Campo label="Responsável pelo local" value={form.responsavel_local} onChange={(e) => setForm({ ...form, responsavel_local: e.target.value })} />
          <Campo label="Serviço" value={form.servico} onChange={(e) => setForm({ ...form, servico: e.target.value })} />
          <Select label="Tipo de atendimento" value={form.tipo_atendimento} onChange={(e) => setForm({ ...form, tipo_atendimento: e.target.value })}>
            <option value="">Padrão (sem modelo)</option>
            {Object.entries(MODELOS).map(([v, m]) => <option key={v} value={v}>{m.rotulo}</option>)}
          </Select>
          <Campo label="Data" type="date" value={form.data_agendada} onChange={(e) => setForm({ ...form, data_agendada: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Horário inicial" type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            <Campo label="Horário final" type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
          </div>
          <Select label="Equipe responsável" value={form.equipe_id} onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}>
            <option value="">Selecione a equipe...</option>
            {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
          </Select>
          <Select label="Prioridade" value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value })}>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </Select>
          <div className="md:col-span-2">
            <Textarea label="Descrição / Observações do Gestor" rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
        </div>

        {os.execucao && (
          <div className="space-y-3 border-t border-zinc-200 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Execução / Relatório</p>
            <Textarea label="Diagnóstico" rows={2} value={form.diagnostico} onChange={(e) => setForm({ ...form, diagnostico: e.target.value })} />
            <Textarea label="Serviço executado" rows={3} value={form.servico_executado} onChange={(e) => setForm({ ...form, servico_executado: e.target.value })} />
            <Textarea label="Solução" rows={2} value={form.solucao} onChange={(e) => setForm({ ...form, solucao: e.target.value })} />
            <Textarea label="Observações da equipe" rows={2} value={form.observacoes_equipe} onChange={(e) => setForm({ ...form, observacoes_equipe: e.target.value })} />
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-3">
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao tipo="submit" disabled={salvando}>{salvando ? "Salvando..." : "Salvar alterações"}</Botao>
        </div>
      </form>
    </Modal>
  );
}
