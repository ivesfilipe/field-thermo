"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, LinhaVazia, Loading, Modal, PageHeader, Tabela, Textarea } from "@/components/ui";

interface Equipe {
  id: number;
  nome: string;
  descricao: string | null;
  total_usuarios: number;
}

export default function EquipesPage() {
  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<{ nome: string; descricao: string }>({ nome: "", descricao: "" });
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ equipes: Equipe[] }>("/api/admin/equipes").then((r) => setEquipes(r.equipes)).catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNova() {
    setEditando(null);
    setForm({ nome: "", descricao: "" });
    setModalAberto(true);
  }

  function abrirEdicao(eq: Equipe) {
    setEditando(eq.id);
    setForm({ nome: eq.nome, descricao: eq.descricao || "" });
    setModalAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      if (editando === null) await api.post("/api/admin/equipes", form);
      else await api.put(`/api/admin/equipes/${editando}`, form);
      setMsg("Equipe salva.");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(eq: Equipe) {
    setErro("");
    if (!confirm(`Excluir a equipe "${eq.nome}"?`)) return;
    try {
      await api.del(`/api/admin/equipes/${eq.id}`);
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
        titulo="Equipes"
        descricao="Organize os técnicos em equipes de trabalho"
        acoes={<Botao onClick={abrirNova}>+ Nova equipe</Botao>}
      />

      <Card title={`Equipes (${equipes?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nome", "Descrição", "Membros", "Ações"]}>
          {equipes === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : equipes.length === 0 ? (
            <LinhaVazia texto="Nenhuma equipe cadastrada." />
          ) : (
            equipes.map((eq) => (
              <tr key={eq.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-3 py-2 font-medium">{eq.nome}</td>
                <td className="px-3 py-2">{eq.descricao || "-"}</td>
                <td className="px-3 py-2">{eq.total_usuarios}</td>
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
        <Modal titulo={editando === null ? "Nova equipe" : `Editar equipe #${editando}`} onFechar={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="grid gap-3">
            <Campo label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Textarea label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
            <div className="flex gap-2">
              <Botao tipo="submit">{editando === null ? "Criar equipe" : "Salvar"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}