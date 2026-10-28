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
  observacao: string | null;
  status: "em_utilizacao" | "finalizado";
  iniciado_por_nome: string | null;
  finalizado_por_nome: string | null;
}

interface Indicadores {
  km_dia: number;
  km_periodo: number;
  registros: number;
  veiculos_utilizados: number;
  veiculos_em_utilizacao: number;
}

interface KmEquipe { equipe_id: number; equipe_nome: string; km_total: number; registros: number }
interface Veiculo { id: number; placa: string; descricao: string | null }
interface Membro { id: number; nome: string }
interface Equipe { id: number; nome: string }

export default function KmGestorPage() {
  const [registros, setRegistros] = useState<Registro[] | null>(null);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [kmPorEquipe, setKmPorEquipe] = useState<KmEquipe[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [erro, setErro] = useState("");
  const [filtros, setFiltros] = useState({ equipe_id: "", data: "", data_inicio: "", data_fim: "", veiculo_id: "", motorista_id: "", status: "" });
  const [ajustando, setAjustando] = useState<Registro | null>(null);
  const [ajusteForm, setAjusteForm] = useState({ km_inicial: "", local_inicial: "", equipe_id: "", motorista_id: "", motorista_nome: "", veiculo_id: "" });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  const carregar = useCallback(() => {
    const qs = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v) qs.set(k, v); });
    api
      .get<{ registros: Registro[]; indicadores: Indicadores; km_por_equipe: KmEquipe[]; veiculos: Veiculo[]; membros: Membro[] }>(`/api/gestor/km${qs.toString() ? `?${qs}` : ""}`)
      .then((r) => {
        setRegistros(r.registros);
        setIndicadores(r.indicadores);
        setKmPorEquipe(r.km_por_equipe);
        setVeiculos(r.veiculos);
        setMembros(r.membros);
      })
      .catch((e) => setErro(e.message));
  }, [filtros]);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    api.get<{ equipes: Equipe[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  function abrirAjuste(r: Registro) {
    setAjustando(r);
    const membro = membros.find((m) => m.nome === r.motorista_nome);
    setAjusteForm({ km_inicial: String(r.km_inicial), local_inicial: r.local_inicial, equipe_id: String(r.equipe_id), motorista_id: membro ? String(membro.id) : "custom", motorista_nome: membro ? "" : r.motorista_nome, veiculo_id: String(r.veiculo_id) });
  }

  async function salvarAjuste() {
    if (!ajustando) return;
    setErro("");
    setMsg("");
    setSalvando(true);
    try {
      const motoristaId = ajusteForm.motorista_id && ajusteForm.motorista_id !== "custom" ? Number(ajusteForm.motorista_id) : undefined;
      await api.patch(`/api/gestor/km/${ajustando.id}`, {
        km_inicial: Number(ajusteForm.km_inicial),
        local_inicial: ajusteForm.local_inicial,
        equipe_id: Number(ajusteForm.equipe_id),
        motorista_id: motoristaId,
        motorista_nome: ajusteForm.motorista_id === "custom" ? ajusteForm.motorista_nome : undefined,
        veiculo_id: Number(ajusteForm.veiculo_id)
      });
      setMsg("Registro ajustado.");
      setAjustando(null);
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao ajustar registro");
    } finally {
      setSalvando(false);
    }
  }

  const porEquipe = new Map<number, Registro[]>();
  for (const r of registros || []) {
    if (!porEquipe.has(r.equipe_id)) porEquipe.set(r.equipe_id, []);
    porEquipe.get(r.equipe_id)!.push(r);
  }

  return (
    <div className="space-y-4">
      <PageHeader titulo="Controle de Quilometragem" descricao="Acompanhe os registros de utilização organizados por equipe" />
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      {indicadores && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">KM rodados no dia</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{indicadores.km_dia.toLocaleString("pt-BR")} km</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">KM rodados no período</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{indicadores.km_periodo.toLocaleString("pt-BR")} km</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">Veículos utilizados</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{indicadores.veiculos_utilizados}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">Veículos em utilização</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{indicadores.veiculos_em_utilizacao}</p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">Registros</p>
            <p className="mt-1 text-2xl font-bold text-zinc-900">{indicadores.registros}</p>
          </div>
        </div>
      )}

      <Card title="Filtros">
        <div className="grid gap-3 md:grid-cols-4">
          <Select label="Equipe" value={filtros.equipe_id} onChange={(e) => setFiltros({ ...filtros, equipe_id: e.target.value })}>
            <option value="">Todas</option>
            {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
          </Select>
          <Campo label="Data" type="date" value={filtros.data} onChange={(e) => setFiltros({ ...filtros, data: e.target.value, data_inicio: "", data_fim: "" })} />
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Período início" type="date" value={filtros.data_inicio} onChange={(e) => setFiltros({ ...filtros, data_inicio: e.target.value, data: "" })} />
            <Campo label="Período fim" type="date" value={filtros.data_fim} onChange={(e) => setFiltros({ ...filtros, data_fim: e.target.value, data: "" })} />
          </div>
          <Select label="Veículo" value={filtros.veiculo_id} onChange={(e) => setFiltros({ ...filtros, veiculo_id: e.target.value })}>
            <option value="">Todos</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </Select>
          <Select label="Motorista" value={filtros.motorista_id} onChange={(e) => setFiltros({ ...filtros, motorista_id: e.target.value })}>
            <option value="">Todos</option>
            {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Select>
          <Select label="Status" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
            <option value="">Todos</option>
            <option value="em_utilizacao">Em utilização</option>
            <option value="finalizado">Finalizado</option>
          </Select>
        </div>
      </Card>

      <Card title="KM por equipe">
        {kmPorEquipe.length === 0 ? (
          <EstadoVazio texto="Nenhuma equipe com registros no período." />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {kmPorEquipe.map((e) => (
              <div key={e.equipe_id} className="rounded-lg border border-zinc-200 px-3 py-2">
                <p className="text-sm font-semibold text-zinc-800">{e.equipe_nome}</p>
                <p className="text-xs text-zinc-500">{e.registros} registro(s) · <span className="font-bold text-blue-700">{e.km_total.toLocaleString("pt-BR")} km</span></p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {Array.from(porEquipe.entries()).map(([equipeId, lista]) => (
        <Card key={equipeId} title={lista[0]?.equipe_nome || `Equipe ${equipeId}`}>
          {lista.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-2.5 last:border-0">
              <div>
                <p className="text-sm">
                  <span className="font-bold text-zinc-900">{r.veiculo_placa}</span>
                  {" | "}
                  <span className="font-medium">{r.motorista_nome}</span>
                  {" | "}
                  <Badge status={r.status === "finalizado" ? "concluida" : "em_andamento"} />
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  <span className="font-semibold">{r.km_inicial.toLocaleString("pt-BR")}</span>
                  {" → "}
                  <span className="font-semibold">{r.km_final != null ? r.km_final.toLocaleString("pt-BR") : "—"}</span>
                  {" | "}
                  <span className="font-bold text-blue-700">{r.km_percorrido != null ? `${r.km_percorrido.toLocaleString("pt-BR")} km` : "—"}</span>
                  {" · "}
                  {r.data_hora_inicio?.slice(0, 16)} {r.data_hora_fim ? `→ ${r.data_hora_fim.slice(0, 16)}` : ""}
                  {r.os_numero ? ` · OS ${r.os_numero}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {r.local_inicial} {r.local_final ? `→ ${r.local_final}` : ""}
                  {r.observacao ? ` · ${r.observacao}` : ""}
                </p>
                {(r.local_inicial || r.local_final) && (
                  <div className="mt-1">
                    <LinksMapa endereco={`${r.local_inicial}${r.local_final && r.local_final !== r.local_inicial ? `, ${r.local_final}` : ""}`} espaco={false} />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Iniciado por {r.iniciado_por_nome || "-"}</span>
                <Botao variante="secundario" onClick={() => abrirAjuste(r)}>Ajustar</Botao>
              </div>
            </div>
          ))}
        </Card>
      ))}

      {registros !== null && registros.length > 0 && porEquipe.size === 0 && (
        <Card title="Registros"><EstadoVazio texto="Nenhum registro para os filtros selecionados." /></Card>
      )}
      {registros !== null && registros.length === 0 && (
        <Card title="Registros"><EstadoVazio texto="Nenhum registro encontrado." /></Card>
      )}

      {ajustando && (
        <Modal titulo={`Ajustar registro — ${ajustando.veiculo_placa}`} onFechar={() => setAjustando(null)}>
          <div className="grid gap-3">
            <p className="text-xs text-zinc-400">Ajustes são registrados no histórico. Permite corrigir KM menor com autorização do Gestor.</p>
            <Select label="Equipe" value={ajusteForm.equipe_id} onChange={(e) => setAjusteForm({ ...ajusteForm, equipe_id: e.target.value })}>
              {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
            </Select>
            <Select label="Veículo" value={ajusteForm.veiculo_id} onChange={(e) => setAjusteForm({ ...ajusteForm, veiculo_id: e.target.value })}>
              {veiculos.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
            </Select>
            <Select label="Motorista" value={ajusteForm.motorista_id} onChange={(e) => setAjusteForm({ ...ajusteForm, motorista_id: e.target.value, motorista_nome: "" })}>
              <option value="">Selecione o motorista...</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
              <option value="custom">Outro nome (digitar)...</option>
            </Select>
            {ajusteForm.motorista_id === "custom" && (
              <Campo
                label="Nome do motorista"
                required={false}
                value={ajusteForm.motorista_nome}
                onChange={(e) => setAjusteForm({ ...ajusteForm, motorista_nome: e.target.value })}
                placeholder="Digite o nome do motorista"
              />
            )}
            <Campo label="KM inicial" type="number" min={0} value={ajusteForm.km_inicial} onChange={(e) => setAjusteForm({ ...ajusteForm, km_inicial: e.target.value })} />
            <Campo label="Local inicial" value={ajusteForm.local_inicial} onChange={(e) => setAjusteForm({ ...ajusteForm, local_inicial: e.target.value })} />
            <div className="flex gap-2">
              <Botao disabled={salvando} onClick={salvarAjuste}>
                {salvando ? "Salvando..." : "Salvar ajuste"}
              </Botao>
              <Botao variante="secundario" onClick={() => setAjustando(null)}>Cancelar</Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}