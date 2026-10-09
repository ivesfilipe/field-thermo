"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, LinhaVazia, Modal, PageHeader, Tabela } from "@/components/ui";

interface Veiculo {
  id: number;
  placa: string;
  descricao: string | null;
  ativo: number;
  criado_em: string;
}

const FORM_VAZIO = { placa: "", descricao: "" };

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(FORM_VAZIO);
  const [editando, setEditando] = useState<Veiculo | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    api.get<{ veiculos: Veiculo[] }>("/api/admin/veiculos").then((r) => setVeiculos(r.veiculos)).catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNova() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEdicao(v: Veiculo) {
    setEditando(v);
    setForm({ placa: v.placa, descricao: v.descricao || "" });
    setModalAberto(true);
  }

  async function salvar() {
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/api/admin/veiculos/${editando.id}`, form);
        setMsg("Veículo atualizado.");
      } else {
        await api.post("/api/admin/veiculos", form);
        setMsg("Veículo cadastrado.");
      }
      setModalAberto(false);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao salvar veículo");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(v: Veiculo) {
    setErro("");
    try {
      await api.put(`/api/admin/veiculos/${v.id}`, { placa: v.placa, descricao: v.descricao || "", ativo: v.ativo === 1 ? false : true });
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao atualizar veículo");
    }
  }

  async function excluir(v: Veiculo) {
    setErro("");
    setMsg("");
    try {
      await api.del(`/api/admin/veiculos/${v.id}`);
      setMsg("Veículo excluído.");
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao excluir veículo");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader titulo="Veículos" descricao="Cadastro de veículos utilizados no controle de quilometragem" acoes={<Botao onClick={abrirNova}>+ Novo veículo</Botao>} />
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <Card title="Veículos">
        {veiculos === null ? (
          <p className="py-8 text-center text-sm text-zinc-400">Carregando...</p>
        ) : veiculos.length === 0 ? (
          <LinhaVazia texto="Nenhum veículo cadastrado." />
        ) : (
          <div className="overflow-x-auto">
            <Tabela cabecalhos={["Placa", "Descrição", "Status", "Cadastrado em", "Ações"]}>
              {veiculos.map((v) => (
                <tr key={v.id}>
                  <td className="font-bold text-blue-700">{v.placa}</td>
                  <td>{v.descricao || "-"}</td>
                  <td><Badge status={v.ativo === 1 ? "concluida" : "cancelada"} /></td>
                  <td className="text-xs text-zinc-500">{v.criado_em?.slice(0, 10)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button onClick={() => abrirEdicao(v)} className="text-xs font-semibold text-blue-600 hover:underline">Editar</button>
                      <button onClick={() => alternarAtivo(v)} className="text-xs font-semibold text-amber-600 hover:underline">
                        {v.ativo === 1 ? "Desativar" : "Ativar"}
                      </button>
                      <button onClick={() => excluir(v)} className="text-xs font-semibold text-red-600 hover:underline">Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </Tabela>
          </div>
        )}
      </Card>

      {modalAberto && (
        <Modal titulo={editando ? "Editar veículo" : "Novo veículo"} onFechar={() => setModalAberto(false)}>
          <div className="grid gap-3">
            <Campo label="Placa" required value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })} placeholder="Ex.: ABC-1234" />
            <Campo label="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Fiorino branco" />
            <div className="flex gap-2">
              <Botao disabled={salvando || !form.placa.trim()} onClick={salvar}>
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar"}
              </Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}