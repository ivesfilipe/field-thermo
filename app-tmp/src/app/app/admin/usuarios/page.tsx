"use client";

import { useCallback, useEffect, useState } from "react";
import { api, PERFIS, type Perfil } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinhaVazia, Loading, Modal, PageHeader, Select, Tabela } from "@/components/ui";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  equipe_id: number | null;
  equipe_nome: string | null;
  equipes: Array<{ id: number; nome: string }>;
  ativo: number;
}

interface Equipe {
  id: number;
  nome: string;
  descricao: string | null;
  total_usuarios: number;
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Partial<Usuario> & { senha?: string }>({});
  const [novaEquipe, setNovaEquipe] = useState("");
  const [equipeIds, setEquipeIds] = useState<number[]>([]);
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ usuarios: Usuario[] }>("/api/admin/usuarios").then((r) => setUsuarios(r.usuarios)).catch((e) => setErro(e.message));
    api.get<{ equipes: Equipe[] }>("/api/admin/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({ ativo: 1 });
    setEquipeIds([]);
    setNovaEquipe("");
    setModalAberto(true);
  }

  function abrirEdicao(u: Usuario) {
    setEditando(u.id);
    setForm({ nome: u.nome, email: u.email, perfil: u.perfil, equipe_id: u.equipe_id, ativo: u.ativo });
    setEquipeIds(u.equipes?.map((eq) => eq.id) || []);
    setNovaEquipe("");
    setModalAberto(true);
  }

  function alternarEquipe(id: number, marcado: boolean) {
    setEquipeIds((prev) => (marcado ? [...new Set([...prev, id])] : prev.filter((e) => e !== id)));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      const nomeEquipe = novaEquipe.trim();
      let ids = [...equipeIds];
      if (nomeEquipe) {
        const existente = equipes.find((eq) => eq.nome.toLowerCase() === nomeEquipe.toLowerCase());
        const id = existente
          ? existente.id
          : (await api.post<{ equipe: { id: number } }>("/api/admin/equipes", { nome: nomeEquipe })).equipe.id;
        ids = [...new Set([...ids, id])];
        setEquipeIds(ids);
      }
      const payload = { ...form, equipe_ids: ids.length > 0 ? ids : null };
      if (editando === null) {
        await api.post("/api/admin/usuarios", payload);
      } else {
        await api.put(`/api/admin/usuarios/${editando}`, payload);
      }
      setMsg("Usuário salvo.");
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function alternarStatus(u: Usuario) {
    setErro("");
    try {
      await api.patch(`/api/admin/usuarios/${u.id}/status`, { ativo: u.ativo ? false : true });
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
        titulo="Usuários"
        descricao="Cadastre e gerencie os acessos ao sistema"
        acoes={<Botao onClick={abrirNovo}>+ Novo usuário</Botao>}
      />

      <Card title={`Usuários (${usuarios?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nome", "Email", "Perfil", "Equipes", "Status", "Ações"]}>
          {usuarios === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : usuarios.length === 0 ? (
            <LinhaVazia texto="Nenhum usuário cadastrado." />
          ) : (
            usuarios.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-blue-50/50">
                <td className="px-3 py-2 font-medium">{u.nome}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{PERFIS[u.perfil]}</td>
                <td className="px-3 py-2">
                  {u.equipes && u.equipes.length > 0
                    ? u.equipes.map((eq) => eq.nome).join(", ")
                    : "-"}
                </td>
                <td className="px-3 py-2">{u.ativo ? <Badge status="ativo" /> : <Badge status="inativo" />}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <Botao variante="secundario" onClick={() => abrirEdicao(u)}>Editar</Botao>
                    <Botao variante={u.ativo ? "perigo" : "sucesso"} onClick={() => alternarStatus(u)}>
                      {u.ativo ? "Desativar" : "Ativar"}
                    </Botao>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>

      {modalAberto && (
        <Modal titulo={editando === null ? "Novo usuário" : `Editar usuário #${editando}`} onFechar={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-2">
            <Campo label="Nome" value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Campo label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Campo
              label={editando === null ? "Senha" : "Nova senha (opcional)"}
              type="password"
              required={false}
              value={form.senha || ""}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
            />
            <Select label="Perfil" value={form.perfil || ""} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>
              <option value="">Selecione...</option>
              {(Object.keys(PERFIS) as Perfil[]).map((p) => (
                <option key={p} value={p}>{PERFIS[p]}</option>
              ))}
            </Select>
            <div className="md:col-span-2 space-y-2">
              <span className="text-sm font-medium text-zinc-600">Equipes (uma ou mais)</span>
              {equipes.length === 0 ? (
                <p className="text-xs text-zinc-400">Nenhuma equipe cadastrada.</p>
              ) : (
                <div className="grid max-h-44 gap-1 overflow-y-auto rounded-md border border-zinc-200 p-2 md:grid-cols-2">
                  {equipes.map((eq) => (
                    <label key={eq.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-blue-50">
                      <input
                        type="checkbox"
                        checked={equipeIds.includes(eq.id)}
                        onChange={(e) => alternarEquipe(eq.id, e.target.checked)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {eq.nome}
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Campo
                  label="Criar nova equipe"
                  value={novaEquipe}
                  onChange={(e) => setNovaEquipe(e.target.value)}
                  placeholder="Nome da equipe..."
                />
              </div>
              <p className="text-xs text-zinc-400">
                Marque as equipes que o usuário integra. A primeira marcada é a equipe principal. Digite um nome para criar uma nova equipe.
              </p>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Botao tipo="submit">{editando === null ? "Criar usuário" : "Salvar alterações"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
