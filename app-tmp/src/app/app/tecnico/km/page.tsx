"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Alerta, Badge, Botao, Campo, Card, EstadoVazio, LinksMapa, Modal, PageHeader, Select } from "@/components/ui";

interface Registro {
  id: number;
  equipe_id: number;
  equipe_nome: string;
  veiculo_id: number;
  veiculo_placa: string;
  veiculo_descricao: string | null;
  motorista_id: number;
  motorista_nome: string;
  os_id: number | null;
  os_numero: string | null;
  data: string;
  data_hora_inicio: string;
  km_inicial: number;
  local_inicial: string;
  data_hora_fim: string | null;
  km_final: number | null;
  local_final: string | null;
  km_percorrido: number | null;
  status: "em_utilizacao" | "finalizado";
}

interface Veiculo { id: number; placa: string; descricao: string | null }
interface Membro { id: number; nome: string; perfil: string }
interface Ordem { id: number; numero: string; servico: string }
interface Equipe { id: number; nome: string }

const FORM_VAZIO = { equipe_id: "", veiculo_id: "", motorista_id: "", motorista_nome: "", os_id: "", km_inicial: "", local_inicial: "" };

export default function KmTecnicoPage() {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [totalDia, setTotalDia] = useState(0);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [ordens, setOrdens] = useState<Ordem[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [mostrarIniciar, setMostrarIniciar] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [finalizandoId, setFinalizandoId] = useState<number | null>(null);
  const [finForm, setFinForm] = useState({ km_final: "", local_final: "" });

  const carregar = useCallback(() => {
    api
      .get<{ registros: Registro[]; total_dia: number; veiculos: Veiculo[]; equipes: Equipe[]; membros: Membro[]; ordens: Ordem[] }>("/api/tecnico/km")
      .then((r) => {
        setRegistros(r.registros);
        setTotalDia(r.total_dia);
        setVeiculos(r.veiculos);
        setEquipes(r.equipes);
        setMembros(r.membros);
        setOrdens(r.ordens);
        setForm((f) => ({ ...f, equipe_id: f.equipe_id || (r.equipes[0] ? String(r.equipes[0].id) : "") }));
      })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  async function sugerirKm(veiculoId: string) {
    if (!veiculoId) return;
    try {
      const r = await api.get<{ km: number | null }>(`/api/tecnico/km/ultimo?veiculo_id=${veiculoId}`);
      setForm((f) => ({ ...f, veiculo_id: veiculoId, km_inicial: r.km != null ? String(r.km) : "" }));
    } catch {
      setForm((f) => ({ ...f, veiculo_id: veiculoId }));
    }
  }

  async function iniciar() {
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      const motoristaId = form.motorista_id && form.motorista_id !== "custom" ? Number(form.motorista_id) : undefined;
      await api.post("/api/tecnico/km", {
        equipe_id: Number(form.equipe_id),
        veiculo_id: Number(form.veiculo_id),
        motorista_id: motoristaId,
        motorista_nome: form.motorista_id === "custom" ? form.motorista_nome : undefined,
        os_id: form.os_id ? Number(form.os_id) : undefined,
        km_inicial: Number(form.km_inicial),
        local_inicial: form.local_inicial
      });
      setMsg("Utilização iniciada.");
      setMostrarIniciar(false);
      setForm(FORM_VAZIO);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao iniciar utilização");
    } finally {
      setSalvando(false);
    }
  }

  async function finalizar(id: number) {
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      await api.post(`/api/tecnico/km/${id}/finalizar`, {
        km_final: Number(finForm.km_final),
        local_final: finForm.local_final
      });
      setMsg("Utilização finalizada.");
      setFinalizandoId(null);
setFinForm({ km_final: "", local_final: "" });
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao finalizar utilização");
    } finally {
      setSalvando(false);
    }
  }

  const emUtilizacao = (registros || []).filter((r) => r.status === "em_utilizacao");
  const finalizados = (registros || []).filter((r) => r.status === "finalizado");

  function abrirIniciar() {
    if (veiculos.length === 0) {
      setErro("Nenhum veículo cadastrado. Peça ao administrador para cadastrar veículos no menu Veículos.");
      return;
    }
    setForm(FORM_VAZIO);
    setMostrarIniciar(true);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Controle de Quilometragem"
        descricao="Registre a utilização diária dos veículos da sua equipe"
        acoes={
          <Botao onClick={abrirIniciar}>Iniciar utilização</Botao>
        }
      />
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">KM rodados hoje</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{totalDia.toLocaleString("pt-BR")} km</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Registros hoje</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{registros?.length || 0}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Em utilização</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{emUtilizacao.length}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Finalizados</p>
          <p className="mt-1 text-2xl font-bold text-zinc-900">{finalizados.length}</p>
        </div>
      </div>

      <Card title="Utilizações da equipe">
        {registros === null ? (
          <p className="py-8 text-center text-sm text-zinc-400">Carregando...</p>
        ) : registros.length === 0 ? (
          <EstadoVazio texto="Nenhuma utilização registrada hoje. Clique em [Iniciar utilização]." />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {registros.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900">{r.veiculo_placa}</span>
                    {r.veiculo_descricao && <span className="text-xs text-zinc-400">{r.veiculo_descricao}</span>}
                    <Badge status={r.status === "finalizado" ? "concluida" : "em_andamento"} />
                  </div>
                  <span className="text-xs text-zinc-400">
                    {r.data_hora_inicio?.slice(0, 16)} {r.data_hora_fim ? `→ ${r.data_hora_fim.slice(0, 16)}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">
                  <span className="font-medium">{r.motorista_nome}</span> · {r.equipe_nome}
                  {r.os_numero ? ` · OS ${r.os_numero}` : ""}
                </p>
                <p className="mt-0.5 text-sm text-zinc-500">
                  <span className="font-semibold text-zinc-700">{r.km_inicial.toLocaleString("pt-BR")}</span>
                  {" → "}
                  <span className="font-semibold text-zinc-700">{r.km_final != null ? r.km_final.toLocaleString("pt-BR") : "—"}</span>
                  {" · "}
                  <span className="font-semibold text-blue-700">{r.km_percorrido != null ? `${r.km_percorrido.toLocaleString("pt-BR")} km` : "—"}</span>
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {r.local_inicial} {r.local_final ? `→ ${r.local_final}` : ""}
                </p>
                {(r.local_inicial || r.local_final) && (
                  <div className="mt-1">
                    <LinksMapa endereco={`${r.local_inicial}${r.local_final && r.local_final !== r.local_inicial ? `, ${r.local_final}` : ""}`} espaco={false} />
                  </div>
                )}
                {r.status === "em_utilizacao" && (
                  <div className="mt-2">
                    <Botao variante="sucesso" onClick={() => { setFinalizandoId(r.id); setFinForm({ km_final: "", local_final: "" }); }}>
                      Finalizar utilização
                    </Botao>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {mostrarIniciar && (
        <Modal titulo="Iniciar utilização" onFechar={() => setMostrarIniciar(false)}>
          <div className="grid gap-3">
<Select label="Equipe" required value={form.equipe_id} onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}>
              <option value="">Selecione a equipe...</option>
              {equipes.map((eq) => (
                <option key={eq.id} value={eq.id}>{eq.nome}</option>
              ))}
            </Select>
            <Select label="Veículo" required value={form.veiculo_id} onChange={(e) => sugerirKm(e.target.value)}>
              <option value="">Selecione o veículo...</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>{v.placa}{v.descricao ? ` — ${v.descricao}` : ""}</option>
              ))}
            </Select>
            <Select label="Motorista" required value={form.motorista_id} onChange={(e) => setForm({ ...form, motorista_id: e.target.value, motorista_nome: "" })}>
              <option value="">Selecione o motorista...</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
              <option value="custom">Outro nome (digitar)...</option>
            </Select>
            {form.motorista_id === "custom" && (
              <Campo
                label="Nome do motorista"
                required
                value={form.motorista_nome}
                onChange={(e) => setForm({ ...form, motorista_nome: e.target.value })}
                placeholder="Digite o nome do motorista"
              />
            )}
            <Campo label="KM inicial" type="number" required min={0} value={form.km_inicial} onChange={(e) => setForm({ ...form, km_inicial: e.target.value })} placeholder="Ex.: 45820" />
            <Campo label="Local inicial" required value={form.local_inicial} onChange={(e) => setForm({ ...form, local_inicial: e.target.value })} placeholder="Ex.: Base Norte" />
            <Select label="OS vinculada (opcional)" value={form.os_id} onChange={(e) => setForm({ ...form, os_id: e.target.value })}>
              <option value="">Nenhuma</option>
              {ordens.map((o) => (
                <option key={o.id} value={o.id}>{o.numero} — {o.servico}</option>
              ))}
            </Select>
            <p className="text-xs text-zinc-400">O KM inicial será preenchido automaticamente com o último KM conhecido do veículo.</p>
            <div className="flex gap-2">
              <Botao
                disabled={salvando || !form.equipe_id || !form.veiculo_id || (form.motorista_id !== "custom" ? !form.motorista_id : !form.motorista_nome.trim()) || form.km_inicial === "" || !form.local_inicial}
                onClick={iniciar}
              >
                {salvando ? "Iniciando..." : "Iniciar utilização"}
              </Botao>
              <Botao variante="secundario" onClick={() => setMostrarIniciar(false)}>Cancelar</Botao>
            </div>
          </div>
        </Modal>
      )}

      {finalizandoId !== null && (() => {
        const r = (registros || []).find((x) => x.id === finalizandoId);
        if (!r) return null;
        return (
          <Modal titulo={`Finalizar utilização — ${r.veiculo_placa}`} onFechar={() => setFinalizandoId(null)}>
            <div className="grid gap-3">
              <p className="text-sm text-zinc-500">
                KM inicial: <span className="font-semibold text-zinc-800">{r.km_inicial.toLocaleString("pt-BR")}</span>
              </p>
              <Campo label="KM final" type="number" required min={r.km_inicial} value={finForm.km_final} onChange={(e) => setFinForm({ ...finForm, km_final: e.target.value })} placeholder={`Mínimo: ${r.km_inicial}`} />
              <Campo label="Local final" required value={finForm.local_final} onChange={(e) => setFinForm({ ...finForm, local_final: e.target.value })} placeholder="Ex.: Cliente X" />
              {finForm.km_final !== "" && Number(finForm.km_final) >= r.km_inicial && (
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  KM percorrido: <span className="font-bold">{Number(finForm.km_final) - r.km_inicial} km</span>
                </p>
              )}
              <div className="flex gap-2">
                <Botao
                  variante="sucesso"
                  disabled={salvando || finForm.km_final === "" || Number(finForm.km_final) < r.km_inicial || !finForm.local_final}
                  onClick={() => finalizar(finalizandoId)}
                >
                  {salvando ? "Finalizando..." : "Finalizar utilização"}
                </Botao>
                <Botao variante="secundario" onClick={() => setFinalizandoId(null)}>Cancelar</Botao>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}