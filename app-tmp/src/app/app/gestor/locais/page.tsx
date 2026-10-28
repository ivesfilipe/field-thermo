"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, Modal, PageHeader, Select, Tabela } from "@/components/ui";

interface Local {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  nome: string;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  responsavel_telefone: string | null;
  total_equipamentos: number;
}

export default function LocaisPage() {
  const [locais, setLocais] = useState<Local[] | null>(null);
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Partial<Local>>({});
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ locais: Local[] }>("/api/gestor/locais").then((r) => setLocais(r.locais)).catch((e) => setErro(e.message));
    api.get<{ clientes: { id: number; nome: string }[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({});
    setModalAberto(true);
  }

  function abrirEdicao(l: Local) {
    setEditando(l.id);
    setForm({ cliente_id: l.cliente_id, nome: l.nome, endereco: l.endereco || "", cidade: l.cidade || "", estado: l.estado || "", cep: l.cep || "", latitude: l.latitude ?? ("" as unknown as number), longitude: l.longitude ?? ("" as unknown as number), responsavel_nome: l.responsavel_nome || "", responsavel_email: l.responsavel_email || "", responsavel_telefone: l.responsavel_telefone || "" });
    setModalAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      if (editando === null) await api.post("/api/gestor/locais", form);
      else await api.put(`/api/gestor/locais/${editando}`, form);
      setMsg("Local salvo.");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(l: Local) {
    setErro("");
    if (!confirm(`Excluir o local "${l.nome}"?`)) return;
    try {
      await api.del(`/api/gestor/locais/${l.id}`);
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
        titulo="Locais"
        descricao="Unidades e endereços de atendimento por cliente"
        acoes={<Botao onClick={abrirNovo}>+ Novo local</Botao>}
      />

      <Card title={`Locais (${locais?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nome", "Cliente", "Endereço", "Responsável", "Contato", "Equip.", "Ações"]}>
          {locais === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : locais.length === 0 ? (
            <LinhaVazia texto="Nenhum local cadastrado." />
          ) : (
            locais.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-3 py-2 font-medium">{l.nome}</td>
                <td className="px-3 py-2">{l.cliente_nome}</td>
                <td className="hidden px-3 py-2 lg:table-cell">
                  {l.endereco || "-"}
                  {l.endereco && (
                    <LinksMapa endereco={l.endereco} />
                  )}
                </td>
                <td className="px-3 py-2">{l.responsavel_nome || "-"}</td>
                <td className="hidden px-3 py-2 md:table-cell">{l.responsavel_telefone || l.responsavel_email || "-"}</td>
                <td className="px-3 py-2">{l.total_equipamentos}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Botao variante="secundario" onClick={() => abrirEdicao(l)}>Editar</Botao>
                    <Botao variante="perigo" onClick={() => excluir(l)}>Excluir</Botao>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>

      {modalAberto && (
        <Modal titulo={editando === null ? "Novo local" : `Editar local #${editando}`} onFechar={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-2">
            <Select label="Cliente" value={form.cliente_id ?? ""} onChange={(e) => setForm({ ...form, cliente_id: Number(e.target.value) })}>
              <option value="">Selecione...</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Campo label="Nome do local" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <div className="md:col-span-2">
              <Campo label="Endereço" value={form.endereco || ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </div>
            <Campo label="Cidade" value={form.cidade || ""} onChange={(e) => setForm({ ...form, cidade: e.target.value })} />
            <Campo label="Estado (UF)" value={form.estado || ""} onChange={(e) => setForm({ ...form, estado: e.target.value })} />
            <Campo label="CEP" value={form.cep || ""} onChange={(e) => setForm({ ...form, cep: e.target.value })} />
            <Campo label="Latitude" value={form.latitude === null || form.latitude === undefined ? "" : String(form.latitude)} onChange={(e) => setForm({ ...form, latitude: e.target.value === "" ? null : Number(e.target.value) })} />
            <Campo label="Longitude" value={form.longitude === null || form.longitude === undefined ? "" : String(form.longitude)} onChange={(e) => setForm({ ...form, longitude: e.target.value === "" ? null : Number(e.target.value) })} />
            <div className="md:col-span-2 text-xs text-zinc-500">
              Latitude e longitude são usadas para exibir o local no Mapa das Equipes. Se não souber as coordenadas, deixe em branco — a OS aparecerá como &quot;sem localização disponível&quot;.
            </div>
            <Campo label="Responsável" value={form.responsavel_nome || ""} onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })} />
            <Campo label="Email do responsável" type="email" value={form.responsavel_email || ""} onChange={(e) => setForm({ ...form, responsavel_email: e.target.value })} />
            <Campo label="Telefone do responsável" value={form.responsavel_telefone || ""} onChange={(e) => setForm({ ...form, responsavel_telefone: e.target.value })} />
            <div className="flex gap-2 md:col-span-2">
              <Botao tipo="submit">{editando === null ? "Criar local" : "Salvar"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}