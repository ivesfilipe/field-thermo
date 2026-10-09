"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, ApiError } from "@/lib/api";
import { Alerta, Botao, Campo, Card, Modal, PageHeader, Select } from "@/components/ui";
import SelecionarCliente from "@/components/selecionar-cliente";
import { MODELOS } from "@/lib/modelos";

let libLeaflet: typeof import("leaflet") | null = null;
async function getLeaflet(): Promise<typeof import("leaflet")> {
  if (!libLeaflet) libLeaflet = await import("leaflet");
  return libLeaflet;
}

interface Cliente { id: number; nome: string; documento?: string | null; cidade_principal?: string | null; estado_principal?: string | null }
interface Local {
  id: number;
  cliente_id: number;
  nome: string;
  responsavel_nome: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
}
interface Equipe { id: number; nome: string }
interface Equipamento { id: number; codigo_mt: string | null; nome: string | null; status: string }

export default function NovaOsPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [locais, setLocais] = useState<Local[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [erro, setErro] = useState("");
  const [conflictos, setConflicts] = useState<Array<{ referencia: string; motivo: string; horario: string }> | null>(null);
  const [salvando, setSalvando] = useState(false);

  const FORM_INICIAL = {
    cliente_id: "", local_id: "", servico: "",
    data_agendada: "", hora_inicio: "", hora_fim: "", equipe_id: "", equipamento_id: "",
    responsavel_local: "", tipo_atendimento: ""
  };

  const [form, setForm] = useState(FORM_INICIAL);

  const [msgLoc, setMsgLoc] = useState("");
  const [abertoLoc, setAbertoLoc] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<{ lat: number; lon: number; display_name: string; city: string; state: string }[]>([]);
  const [latSel, setLatSel] = useState<number | null>(null);
  const [lngSel, setLngSel] = useState<number | null>(null);
  const [enderecoSel, setEnderecoSel] = useState("");
  const [cidadeSel, setCidadeSel] = useState("");
  const [estadoSel, setEstadoSel] = useState("");
  const [salvandoLoc, setSalvandoLoc] = useState(false);
  const [erroLoc, setErroLoc] = useState("");
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewMapaRef = useRef<L.Map | null>(null);
  const modalMapaRef = useRef<L.Map | null>(null);
  const modalMarcadorRef = useRef<L.Marker | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(() => {
    api.get<{ clientes: Cliente[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch((e) => setErro(e.message));
    api.get<{ locais: Local[] }>("/api/gestor/locais").then((r) => setLocais(r.locais)).catch(() => {});
    api.get<{ equipes: Equipe[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

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

  const equipamentosAtivos = equipamentos.filter((e) => e.status !== "desativado");

  async function salvar(ignorarConflitos = false) {
    setErro("");
    setConflicts(null);
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        cliente_id: Number(form.cliente_id),
        local_id: form.local_id ? Number(form.local_id) : undefined,
        servico: form.servico,
        data_agendada: form.data_agendada || undefined,
        hora_inicio: form.hora_inicio || undefined,
        hora_fim: form.hora_fim || undefined,
        equipe_id: Number(form.equipe_id),
        equipamento_id: form.equipamento_id ? Number(form.equipamento_id) : undefined,
        tipo_atendimento: form.tipo_atendimento || undefined,
        responsavel_local: form.responsavel_local || undefined,
        ignorar_conflitos: ignorarConflitos || undefined
      };
      const r = await api.post<{ os: { id: number } }>("/api/gestor/os", payload);
      router.push(`/app/gestor/os/${r.os.id}`);
    } catch (err) {
      const e = err as { status?: number; conflitos?: Array<{ referencia: string; motivo: string; horario: string }>; message?: string };
      if (e?.status === 409 && Array.isArray(e?.conflitos)) {
        setConflicts(e.conflitos);
        setSalvando(false);
      } else {
        setErro(e?.message || "Erro ao criar OS");
        setSalvando(false);
      }
    }
  }

  async function limpar() {
    if (!confirm("Limpar todos os campos do formulário?")) return;
    setForm(FORM_INICIAL);
    setErro("");
    setConflicts(null);
  }

  const localSelecionado = locais.find((l) => String(l.id) === form.local_id) || null;

  useEffect(() => {
    let ativo = true;
    (async () => {
      const L = await getLeaflet();
      if (!ativo || !localSelecionado?.latitude || !localSelecionado?.longitude || !previewRef.current) return;
      previewMapaRef.current?.remove();
      previewMapaRef.current = null;
      const map = L.map(previewRef.current, { center: [localSelecionado.latitude, localSelecionado.longitude], zoom: 15, scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(map);
      L.marker([localSelecionado.latitude, localSelecionado.longitude], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 26]
        })
      }).addTo(map);
      previewMapaRef.current = map;
    })();
    return () => {
      ativo = false;
    };
  }, [localSelecionado]);

  useEffect(() => {
    return () => {
      previewMapaRef.current?.remove();
      modalMapaRef.current?.remove();
      previewMapaRef.current = null;
      modalMapaRef.current = null;
      modalMarcadorRef.current = null;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const L = await getLeaflet();
      if (!ativo || !abertoLoc || latSel == null || lngSel == null || !modalContainerRef.current) return;
      if (!modalMapaRef.current) {
        const map = L.map(modalContainerRef.current, { center: [latSel, lngSel], zoom: 15, scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19
        }).addTo(map);
        const marker = L.marker([latSel, lngSel], { draggable: true });
        marker.addTo(map);
        marker.on("dragend", () => {
          const p = marker.getLatLng();
          setLatSel(Number(p.lat.toFixed(6)));
          setLngSel(Number(p.lng.toFixed(6)));
        });
        map.on("click", (ev: L.LeafletMouseEvent) => {
          marker.setLatLng(ev.latlng);
          setLatSel(Number(ev.latlng.lat.toFixed(6)));
          setLngSel(Number(ev.latlng.lng.toFixed(6)));
        });
        modalMapaRef.current = map;
        modalMarcadorRef.current = marker;
      } else {
        modalMapaRef.current.setView([latSel, lngSel], 15);
        modalMarcadorRef.current?.setLatLng([latSel, lngSel]);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [abertoLoc, latSel, lngSel]);

  function abrirLocalizacao() {
    setBusca("");
    setResultados([]);
    setLatSel(localSelecionado?.latitude || null);
    setLngSel(localSelecionado?.longitude || null);
    setEnderecoSel(localSelecionado?.endereco || "");
    setCidadeSel(localSelecionado?.cidade || "");
    setEstadoSel(localSelecionado?.estado || "");
    setErroLoc("");
    setAbertoLoc(true);
  }

  function fecharLocalizacao() {
    setAbertoLoc(false);
    setResultados([]);
    modalMapaRef.current?.remove();
    modalMapaRef.current = null;
    modalMarcadorRef.current = null;
  }

  async function buscarEndereco() {
    if (!busca.trim()) {
      setErroLoc("Digite o endereço para buscar.");
      return;
    }
    setErroLoc("");
    setBuscando(true);
    setResultados([]);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(busca)}&countrycodes=br&limit=5&addressdetails=1&accept-language=pt-BR`;
      const r = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
      if (!r.ok) throw new Error(String(r.status));
      const dados = await r.json();
      setResultados(
        dados.map((d: { lat: string; lon: string; display_name: string; address?: { city?: string; town?: string; municipality?: string; state?: string } }) => ({
          lat: Number(d.lat),
          lon: Number(d.lon),
          display_name: d.display_name,
          city: d.address?.city || d.address?.town || d.address?.municipality || "",
          state: d.address?.state || ""
        }))
      );
      if (dados.length === 0) setErroLoc("Nenhum endereço encontrado. Tente com bairro ou cidade.");
    } catch {
      setErroLoc("Falha ao buscar o endereço. Verifique a conexão e tente novamente.");
    } finally {
      setBuscando(false);
    }
  }

  function escolherResultado(r: { lat: number; lon: number; display_name: string; city: string; state: string }) {
    setLatSel(r.lat);
    setLngSel(r.lon);
    setEnderecoSel(r.display_name);
    setCidadeSel(r.city);
    setEstadoSel(r.state);
  }

  async function salvarLocalizacao() {
    if (latSel == null || lngSel == null) {
      setErroLoc("Selecione um ponto no mapa (busque o endereço ou clique no mapa).");
      return;
    }
    const clienteId = form.cliente_id ? Number(form.cliente_id) : null;
    if (!clienteId) {
      setErroLoc("Selecione o cliente antes de definir a localização.");
      return;
    }
    setErroLoc("");
    setSalvandoLoc(true);
    try {
      if (localSelecionado) {
        await api.put(`/api/gestor/locais/${localSelecionado.id}`, {
          cliente_id: clienteId,
          endereco: enderecoSel || localSelecionado.endereco || undefined,
          cidade: cidadeSel || undefined,
          estado: estadoSel || undefined,
          latitude: latSel,
          longitude: lngSel
        });
        setMsgLoc(`Localização de "${localSelecionado.nome}" salva no mapa.`);
      } else {
        const r = await api.post<{ local: Local }>("/api/gestor/locais", {
          cliente_id: clienteId,
          nome: busca.trim().slice(0, 80) || "Local no mapa",
          endereco: enderecoSel || undefined,
          cidade: cidadeSel || undefined,
          estado: estadoSel || undefined,
          latitude: latSel,
          longitude: lngSel
        });
        setLocais((atual) => [...atual, r.local]);
        setForm((atual) => ({ ...atual, local_id: String(r.local.id) }));
        setMsgLoc(`Local "${r.local.nome}" criado com a localização digitada.`);
      }
      modalMapaRef.current?.remove();
      modalMapaRef.current = null;
      modalMarcadorRef.current = null;
      setAbertoLoc(false);
    } catch (e) {
      setErroLoc(e instanceof ApiError ? e.message : "Erro ao salvar a localização");
    } finally {
      setSalvandoLoc(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <PageHeader
        titulo="Nova Ordem de Serviço"
        descricao="Preencha os dados para criar e agendar a OS"
        acoes={<Botao variante="secundario" onClick={() => router.back()}>Voltar</Botao>}
      />
      {conflictos && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-700">Conflito de agenda detectado</p>
          <ul className="mt-1 list-inside list-disc text-red-600">
            {conflictos.map((c, i) => (
              <li key={i}>
                {c.referencia} — {c.motivo === "tecnico" ? "técnico" : "equipe"} ocupado em {c.horario}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <Botao variante="perigo" disabled={salvando} onClick={() => salvar(true)}>Criar mesmo assim</Botao>
            <Botao variante="secundario" onClick={() => setConflicts(null)}>Voltar e ajustar</Botao>
          </div>
        </div>
      )}
      <Card title="Nova Ordem de Serviço">
        <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="grid gap-3 md:grid-cols-2">
          <SelecionarCliente
            clientes={clientes}
            value={form.cliente_id}
            onChange={(v) => setForm({ ...form, cliente_id: v, local_id: "", equipamento_id: "" })}
            required
          />
          <Select label="Equipamento (MT)" value={form.equipamento_id} onChange={(e) => setForm({ ...form, equipamento_id: e.target.value })}>
            <option value="">Sem equipamento</option>
            {equipamentosAtivos.map((eq) => <option key={eq.id} value={eq.id}>{eq.codigo_mt || eq.nome}{eq.nome ? ` - ${eq.nome}` : ""}</option>)}
          </Select>
          <Select label="Endereço" value={form.local_id} onChange={(e) => {
            const local = locaisFiltrados.find((l) => String(l.id) === e.target.value);
            setForm({ ...form, local_id: e.target.value, responsavel_local: local?.responsavel_nome || form.responsavel_local });
          }}>
            <option value="">Sem endereço</option>
            {locaisFiltrados.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.endereco ? ` — ${l.endereco}` : ""}{l.cidade ? ` (${l.cidade})` : ""}</option>)}
          </Select>
          <Campo label="Responsável pelo local" value={form.responsavel_local} onChange={(e) => setForm({ ...form, responsavel_local: e.target.value })} />
          <Campo label="Serviço a realizar" required value={form.servico} onChange={(e) => setForm({ ...form, servico: e.target.value })} placeholder="Ex.: Manutenção preventiva" />
          <Select label="Tipo de atendimento" value={form.tipo_atendimento} onChange={(e) => setForm({ ...form, tipo_atendimento: e.target.value })}>
            <option value="">Padrão (sem modelo)</option>
            {Object.entries(MODELOS).map(([v, m]) => <option key={v} value={v}>{m.rotulo}</option>)}
          </Select>
          <Campo label="Data agendada" type="date" value={form.data_agendada} onChange={(e) => setForm({ ...form, data_agendada: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Horário inicial" type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            <Campo label="Prev. término" type="time" value={form.hora_fim} onChange={(e) => setForm({ ...form, hora_fim: e.target.value })} />
          </div>
          <Select label="Equipe responsável" required value={form.equipe_id} onChange={(e) => setForm({ ...form, equipe_id: e.target.value })}>
            <option value="">Selecione a equipe...</option>
            {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
          </Select>
          <div className="md:col-span-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-zinc-800">Localização no mapa</p>
                <p className="text-xs text-zinc-500">
                  {localSelecionado
                    ? localSelecionado.latitude != null && localSelecionado.longitude != null
                      ? `"${localSelecionado.nome}" já tem coordenadas (${localSelecionado.latitude.toFixed(5)}, ${localSelecionado.longitude.toFixed(5)})`
                      : `"${localSelecionado.nome}" ainda não tem coordenadas — defina no mapa para a OS aparecer no mapa das equipes`
                    : "Sem endereço selecionado — ao digitar a localização, o endereço será criado com as coordenadas"}
                </p>
              </div>
              <Botao variante="secundario" onClick={abrirLocalizacao}>
                {localSelecionado?.latitude != null ? "Ajustar localização no mapa" : "Digitar localização no mapa"}
              </Botao>
            </div>
            {msgLoc && <p className="mt-2 text-xs font-medium text-green-700">{msgLoc}</p>}
            {localSelecionado?.latitude != null && localSelecionado?.longitude != null && (
              <div ref={previewRef} className="mt-2 h-44 w-full rounded-lg border border-zinc-300" />
            )}
          </div>
          <div className="md:col-span-2 flex gap-2">
            <Botao tipo="submit" disabled={salvando}>{salvando ? "Criando..." : "Criar OS"}</Botao>
            <Botao variante="secundario" onClick={limpar}>Limpar</Botao>
          </div>
        </form>
      </Card>

      {abertoLoc && (
        <Modal titulo={`Localização no mapa${localSelecionado ? ` — ${localSelecionado.nome}` : ""}`} onFechar={fecharLocalizacao} largura="max-w-2xl">
          <div className="space-y-3">
            <Alerta tipo="erro" msg={erroLoc} onClose={() => setErroLoc("")} />
            <p className="text-sm text-zinc-600">
              Digite o endereço para buscar a posição, confirme no mapa (arraste o marcador ou clique para ajustar) e salve.
            </p>
            <div className="flex gap-2">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") buscarEndereco(); }}
                placeholder="Endereço, rua, bairro ou cidade..."
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
              />
              <Botao disabled={buscando || !busca.trim()} onClick={buscarEndereco}>
                {buscando ? "Buscando..." : "Buscar"}
              </Botao>
            </div>
            {resultados.length > 0 && (
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-2">
                {resultados.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => escolherResultado(r)}
                    className={`w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-blue-50 ${latSel === r.lat && lngSel === r.lon ? "bg-blue-50 font-medium" : ""}`}
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
            {latSel != null && lngSel != null && (
              <div className="space-y-2">
                <div ref={modalContainerRef} className="h-56 w-full rounded-lg border border-zinc-300" />
                <p className="text-xs text-zinc-500">
                  Arraste o marcador ou clique no mapa para ajustar · <span className="font-semibold">Lat {latSel.toFixed(6)} · Lng {lngSel.toFixed(6)}</span>
                </p>
              </div>
            )}
            <Botao disabled={salvandoLoc || latSel == null || lngSel == null} onClick={salvarLocalizacao} className="w-full">
              {salvandoLoc ? "Salvando..." : localSelecionado ? "Salvar localização no endereço" : "Salvar e usar na OS"}
            </Botao>
          </div>
        </Modal>
      )}
    </div>
  );
}
