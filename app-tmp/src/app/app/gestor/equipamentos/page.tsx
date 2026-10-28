"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, Modal, PageHeader, Select, Tabela } from "@/components/ui";

interface Equipamento {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  local_id: number | null;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  nome: string;
  modelo: string | null;
  fabricante: string | null;
  numero_serie: string | null;
  capacidade: string | null;
  patrimonio: string | null;
  data_instalacao: string | null;
  garantia_ate: string | null;
}

interface LocalOpt { id: number; cliente_id: number; nome: string }

export default function EquipamentosPage() {
  const [equipamentos, setEquipamentos] = useState<Equipamento[] | null>(null);
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([]);
  const [locais, setLocais] = useState<LocalOpt[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Partial<Equipamento>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ equipamentos: Equipamento[] }>(`/api/gestor/equipamentos${busca ? `?busca=${encodeURIComponent(busca)}` : ""}`).then((r) => setEquipamentos(r.equipamentos)).catch((e) => setErro(e.message));
    api.get<{ clientes: { id: number; nome: string }[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch(() => {});
    api.get<{ locais: LocalOpt[] }>("/api/gestor/locais").then((r) => setLocais(r.locais)).catch(() => {});
  }, [busca]);

  useEffect(carregar, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({});
    setModalAberto(true);
  }

  function abrirEdicao(eq: Equipamento) {
    setEditando(eq.id);
    setForm({ ...eq });
    setModalAberto(true);
  }

  const locaisDoCliente = locais.filter((l) => l.cliente_id === (form.cliente_id ?? -1));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      if (editando === null) await api.post("/api/gestor/equipamentos", form);
      else await api.put(`/api/gestor/equipamentos/${editando}`, form);
      setMsg("Equipamento salvo.");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(eq: Equipamento) {
    setErro("");
    if (!confirm(`Excluir o equipamento "${eq.nome}"?`)) return;
    try {
      await api.del(`/api/gestor/equipamentos/${eq.id}`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Equipamentos"
        descricao="Cadastre e consulte os equipamentos por cliente e local"
        acoes={<Botao onClick={abrirNovo}>+ Novo equipamento</Botao>}
      />

      <Card title={`Equipamentos (${equipamentos?.length ?? "..."})`}>
        <div className="mb-3 max-w-md">
          <Campo label="" placeholder="Buscar por nome, série ou fabricante..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Tabela cabecalhos={["Nome", "Modelo", "Fabricante", "Série", "Cliente", "Local", "Ações"]}>
          {equipamentos === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : equipamentos.length === 0 ? (
            <LinhaVazia texto="Nenhum equipamento encontrado." />
          ) : (
            equipamentos.map((eq) => (
              <tr key={eq.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-3 py-2 font-medium">{eq.nome}</td>
                <td className="px-3 py-2">{eq.modelo || "-"}</td>
                <td className="hidden px-3 py-2 md:table-cell">{eq.fabricante || "-"}</td>
                <td className="px-3 py-2">{eq.numero_serie || "-"}</td>
                <td className="hidden px-3 py-2 lg:table-cell">{eq.cliente_nome}</td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  {eq.local_nome || "-"}
                  {eq.local_endereco_completo || eq.local_endereco && (
                    <span className="block text-xs text-zinc-500">
                      {eq.local_endereco_completo || eq.local_endereco}
                      <LinksMapa endereco={eq.local_endereco_completo || eq.local_endereco} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Botao variante="secundario" onClick={() => abrirEdicao(eq)}>Editar</Botao>
                    <Botao variante="perigo" onClick={() => excluir(eq)}>Excluir</Botao>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>

      {modalAberto && (
        <Modal titulo={editando === null ? "Novo equipamento" : `Editar equipamento #${editando}`} onFechar={() => setModalAberto(false)} largura="max-w-2xl">
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-2">
            <Select label="Cliente" value={form.cliente_id ?? ""} onChange={(e) => { const v = Number(e.target.value); setForm({ ...form, cliente_id: v, local_id: undefined }); }}>
              <option value="">Selecione...</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select label="Local" value={form.local_id ?? ""} onChange={(e) => setForm({ ...form, local_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem local</option>
              {locaisDoCliente.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </Select>
            <Campo label="Nome" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Campo label="Modelo" value={form.modelo || ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
            <Campo label="Fabricante" value={form.fabricante || ""} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} />
            <Campo label="Nº de série" value={form.numero_serie || ""} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} />
            <Campo label="Capacidade" value={form.capacidade || ""} onChange={(e) => setForm({ ...form, capacidade: e.target.value })} placeholder="Ex.: 48.000 BTU/h" />
            <Campo label="Patrimônio / identificação" value={form.patrimonio || ""} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} />
            <Campo label="Data de instalação" type="date" value={form.data_instalacao || ""} onChange={(e) => setForm({ ...form, data_instalacao: e.target.value })} />
            <Campo label="Garantia até" type="date" value={form.garantia_ate || ""} onChange={(e) => setForm({ ...form, garantia_ate: e.target.value })} />
            <div className="flex gap-2 md:col-span-2">
              <Botao tipo="submit">{editando === null ? "Criar" : "Salvar"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}