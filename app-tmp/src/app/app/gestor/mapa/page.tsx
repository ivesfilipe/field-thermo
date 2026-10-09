"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api, ApiError } from "@/lib/api";
import { Alerta, Botao, Card, Loading, Modal, PageHeader, Select } from "@/components/ui";

let libLeaflet: typeof import("leaflet") | null = null;
async function getLeaflet(): Promise<typeof import("leaflet")> {
  if (!libLeaflet) libLeaflet = await import("leaflet");
  return libLeaflet;
}

interface OsMapa {
  id: number;
  numero: string;
  servico: string;
  descricao: string | null;
  prioridade: string;
  status_base: string;
  status: string;
  status_label: string;
  confirmada: boolean;
  tipo_atendimento: string | null;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  cliente_id: number;
  cliente_nome: string;
  local_id: number | null;
  local_nome: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco_completo: string;
  tem_localizacao: boolean;
  equipe_id: number | null;
  equipe_nome: string | null;
  executor_id: number | null;
  executor_nome: string | null;
  iniciada_em: string | null;
  mt: {
    id: number;
    codigo_mt: string;
    patrimonio: string | null;
    tipo: string | null;
    fabricante: string | null;
    modelo: string | null;
    capacidade: string | null;
    gas: string | null;
    local: string | null;
    ambiente: string | null;
  } | null;
}

interface OsPlanejamento {
  id: number;
  numero: string;
  servico: string;
  prioridade: string;
  status: string;
  tipo_atendimento: string | null;
  data_agendada: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  cliente_id: number;
  cliente_nome: string;
  local_id: number | null;
  local_nome: string | null;
  endereco_completo: string;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  tem_localizacao: boolean;
  equipe_id: number | null;
  equipe_nome: string | null;
  mt: { codigo_mt: string; patrimonio: string | null } | null;
}

interface GrupoSugerido {
  id: number;
  nome: string;
  quantidade: number;
  os: OsPlanejamento[];
}

interface ItemSequencia extends OsPlanejamento {
  posicao: number;
  distancia_anterior_km: number;
}

interface RespostaSequencia {
  sequencia: ItemSequencia[];
  total_km: number;
  tempo_estimado_horas: number;
  origem: string;
  notas: string[];
  incluidas: number;
}

const CORES_STATUS: Record<string, string> = {
  agendada: "#3b82f6",
  confirmada: "#0ea5e9",
  disponivel: "#06b6d4",
  em_deslocamento: "#f59e0b",
  em_atendimento: "#22c55e",
  aguardando_validacao: "#8b5cf6",
  aguardando_complemento: "#ef4444",
  concluida: "#71717a",
  cancelada: "#a1a1aa",
  atrasada: "#f97316"
};

const STATUS_FILTRO = [
  { v: "", l: "Todos" },
  { v: "agendada", l: "Agendada" },
  { v: "confirmada", l: "Confirmada" },
  { v: "disponivel", l: "Disponível para equipe" },
  { v: "em_deslocamento", l: "Em deslocamento" },
  { v: "em_atendimento", l: "Em atendimento" },
  { v: "aguardando_validacao", l: "Aguardando validação" },
  { v: "aguardando_complemento", l: "Aguardando complemento" },
  { v: "atrasada", l: "Atrasada" },
  { v: "concluida", l: "Concluída" },
  { v: "cancelada", l: "Cancelada" }
];

const LABEL_PRIORIDADE: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente"
};

const COR_PRIORIDADE: Record<string, string> = {
  baixa: "bg-zinc-100 text-zinc-600 border-zinc-200",
  media: "bg-blue-50 text-blue-700 border-blue-200",
  alta: "bg-amber-50 text-amber-700 border-amber-200",
  urgente: "bg-red-50 text-red-700 border-red-200"
};

function hojeStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtData(d: string | null): string {
  if (!d) return "-";
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

function fmtDataHora(s: string | null): string {
  if (!s) return "-";
  const [d, h] = s.split("T");
  return `${fmtData(d)} ${h ? h.slice(0, 5) : ""}`.trim();
}

function fmtKm(v: number): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

function haversineKm(latA: number, lngA: number, latB: number, lngB: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(latB - latA);
  const dLng = rad(lngB - lngA);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(latA)) * Math.cos(rad(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export default function MapaEquipesPage() {
  const router = useRouter();
  const [ordens, setOrdens] = useState<OsMapa[] | null>(null);
  const [equipes, setEquipes] = useState<{ id: number; nome: string }[]>([]);
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([]);
  const [filtro, setFiltro] = useState({ equipe_id: "", status: "", cliente_id: "", data: "hoje", data_inicio: hojeStr(), data_fim: hojeStr() });
  const [selecionado, setSelecionado] = useState<OsMapa | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const camadaRef = useRef<L.LayerGroup | null>(null);

  const [modoPlanejamento, setModoPlanejamento] = useState(false);
  const [selecionadas, setSelecionadas] = useState<number[]>([]);
  const [sugestoes, setSugestoes] = useState<GrupoSugerido[] | null>(null);
  const [grupoAtivo, setGrupoAtivo] = useState<OsPlanejamento[] | null>(null);
  const [sequencia, setSequencia] = useState<RespostaSequencia | null>(null);
  const [equipeAtribuicao, setEquipeAtribuicao] = useState("");
  const [processando, setProcessando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);

  const [localizandoOs, setLocalizandoOs] = useState<OsMapa | null>(null);
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
  const minimapaRef = useRef<HTMLDivElement | null>(null);
  const miniMapaRef = useRef<L.Map | null>(null);
  const miniMarcadorRef = useRef<L.Marker | null>(null);

  const carregar = useCallback(() => {
    const qs = new URLSearchParams();
    if (filtro.equipe_id) qs.set("equipe_id", filtro.equipe_id);
    if (filtro.status) qs.set("status", filtro.status);
    if (filtro.cliente_id) qs.set("cliente_id", filtro.cliente_id);
    if (filtro.data === "hoje") qs.set("data", hojeStr());
    else if (filtro.data === "periodo") {
      qs.set("data_inicio", filtro.data_inicio || hojeStr());
      qs.set("data_fim", filtro.data_fim || hojeStr());
    }
    return api
      .get<{ ordens: OsMapa[] }>(`/api/gestor/mapa?${qs.toString()}`)
      .then((r) => {
        setOrdens(r.ordens);
        setAtualizadoEm(new Date().toLocaleTimeString("pt-BR"));
      })
      .catch((e) => setErro(e.message));
  }, [filtro]);

  useEffect(() => {
    api.get<{ equipes: { id: number; nome: string }[] }>("/api/gestor/equipes").then((r) => setEquipes(r.equipes)).catch(() => {});
    api.get<{ clientes: { id: number; nome: string }[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch(() => {});
  }, []);

  useEffect(() => {
    carregar();
    const timer = setInterval(carregar, 30000);
    return () => clearInterval(timer);
  }, [carregar]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const L = await getLeaflet();
      if (!ativo || !containerRef.current || mapaRef.current) return;
      const map = L.map(containerRef.current, { center: [-21.5, -45], zoom: 6 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
      }).addTo(map);
      mapaRef.current = map;
      camadaRef.current = L.layerGroup().addTo(map);
    })();
    return () => {
      ativo = false;
      mapaRef.current?.remove();
      mapaRef.current = null;
      camadaRef.current = null;
    };
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const map = mapaRef.current;
      const camada = camadaRef.current;
      if (!map || !camada) return;
      const L = await getLeaflet();
      if (!ativo) return;
      camada.clearLayers();
      const comCoords = (ordens || []).filter((o) => o.tem_localizacao);
      for (const os of comCoords) {
        if (os.latitude == null || os.longitude == null) continue;
        const cor = CORES_STATUS[os.status] || "#64748b";
        const num = os.numero.replace(/^OS-?/i, "");
        const selecionada = selecionadas.includes(os.id);
        if (selecionada) {
          camada.addLayer(
            L.circleMarker([os.latitude, os.longitude], {
              radius: 17,
              color: "#2563eb",
              weight: 3,
              fillColor: "rgba(37,99,235,0.18)",
              fillOpacity: 1
            })
          );
        }
        const icone = L.divIcon({
          className: "",
          html: `<div style="position:relative;width:34px;height:34px">
            <div style="position:absolute;inset:0;border-radius:50% 50% 50% 0;background:${cor};transform:rotate(-45deg);border:${selecionada ? "3px solid #2563eb" : "2px solid #fff"};box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>
            <span style="position:absolute;top:5px;left:50%;transform:translateX(-50%);color:#fff;font-weight:700;font-size:9px;font-family:sans-serif">${num}</span>
            <div style="position:absolute;top:32px;left:50%;transform:translateX(-50%);background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.12);border-radius:5px;padding:1px 5px;font-size:10px;font-weight:600;color:#27272a;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.2)">${os.numero}</div>
          </div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 34]
        });
        const marker = L.marker([os.latitude, os.longitude], { icon: icone });
        marker.on("click", () => {
          setSelecionado(os);
          if (modoPlanejamento) {
            setSelecionadas((atual) => (atual.includes(os.id) ? atual.filter((x) => x !== os.id) : [...atual, os.id]));
            setSugestoes(null);
          }
        });
        camada.addLayer(marker);
      }
      if (comCoords.length > 0) {
        map.fitBounds(
          L.latLngBounds(comCoords.map((o) => [o.latitude as number, o.longitude as number])),
          { padding: [40, 40], maxZoom: 13 }
        );
      }
    })();
    return () => {
      ativo = false;
    };
  }, [ordens, selecionadas, modoPlanejamento]);

  const comCoordenadas = (ordens || []).filter((o) => o.tem_localizacao);
  const semCoordenadas = (ordens || []).filter((o) => !o.tem_localizacao);

  function toggleSelecao(id: number) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
    setSugestoes(null);
    setSequencia(null);
  }

  async function agrupar() {
    if (selecionadas.length < 2) {
      setErro("Selecione ao menos duas OS para agrupar.");
      return;
    }
    setErro("");
    setSugerindo(true);
    try {
      const r = await api.post<{ grupos: GrupoSugerido[]; sem_localizacao: OsPlanejamento[] }>("/api/gestor/planejamento/grupos", { os_ids: selecionadas });
      setSugestoes(r.grupos);
      setGrupoAtivo(null);
      setSequencia(null);
      if (r.sem_localizacao.length > 0) {
        setMsg(`${r.sem_localizacao.length} OS selecionada(s) sem localização ficaram fora do agrupamento.`);
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao agrupar atividades");
    } finally {
      setSugerindo(false);
    }
  }

  function usarGrupo(g: GrupoSugerido) {
    setGrupoAtivo(g.os);
    setSequencia(null);
    setSelecionadas(g.os.map((o) => o.id));
  }

  function alterarGrupo(id: number) {
    if (!grupoAtivo) return;
    const presente = grupoAtivo.some((o) => o.id === id);
    if (presente) {
      setGrupoAtivo(grupoAtivo.filter((o) => o.id !== id));
    } else {
      const os = ordens?.find((o) => o.id === id);
      if (os) setGrupoAtivo([...grupoAtivo, os]);
    }
    setSequencia(null);
  }

  function moverSequencia(idx: number, delta: number) {
    setSequencia((atual) => {
      if (!atual) return atual;
      const alvo = idx + delta;
      if (alvo < 0 || alvo >= atual.sequencia.length) return atual;
      const itens = [...atual.sequencia];
      const [item] = itens.splice(idx, 1);
      itens.splice(alvo, 0, item);
      const comDist = itens.map((o, i) => {
        const anterior = i > 0 ? itens[i - 1] : itens[itens.length - 1];
        const d = i > 0 && o.latitude != null && o.longitude != null && anterior.latitude != null && anterior.longitude != null ? haversineKm(anterior.latitude, anterior.longitude, o.latitude, o.longitude) : 0;
        return { ...o, posicao: i + 1, distancia_anterior_km: Math.round(d * 10) / 10 };
      });
      const total = comDist.reduce((soma, o) => soma + o.distancia_anterior_km, 0);
      return { ...atual, sequencia: comDist, total_km: Math.round(total * 10) / 10, tempo_estimado_horas: Math.round((total / 40) * 10) / 10 };
    });
  }

  async function otimizar() {
    if (!grupoAtivo || grupoAtivo.length === 0) {
      setErro("Defina o grupo de atividades primeiro.");
      return;
    }
    setErro("");
    setProcessando(true);
    try {
      const r = await api.post<RespostaSequencia>("/api/gestor/planejamento/sequencia", { os_ids: grupoAtivo.map((o) => o.id) });
      setSequencia(r);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao otimizar sequência");
    } finally {
      setProcessando(false);
    }
  }

  async function atribuir() {
    if (!grupoAtivo || grupoAtivo.length === 0) {
      setErro("Defina o grupo de atividades primeiro.");
      return;
    }
    if (!equipeAtribuicao) {
      setErro("Selecione a equipe responsável.");
      return;
    }
    const equipeNome = equipes.find((e) => e.id === Number(equipeAtribuicao))?.nome || "";
    if (!window.confirm(`Atribuir ${grupoAtivo.length} OS à equipe ${equipeNome}? Esta ação altera as OS confirmadamente.`)) return;
    setErro("");
    setMsg("");
    setProcessando(true);
    try {
      const r = await api.post<{ atribuidas: number; bloqueadas: { numero: string }[] }>("/api/gestor/planejamento/atribuir", {
        os_ids: grupoAtivo.map((o) => o.id),
        equipe_id: Number(equipeAtribuicao)
      });
      setMsg(`Grupo atribuído: ${r.atribuidas} OS enviadas à equipe${r.bloqueadas.length > 0 ? ` (${r.bloqueadas.length} bloqueadas: ${r.bloqueadas.map((b) => b.numero).join(", ")})` : ""}.`);
      setSugestoes(null);
      setGrupoAtivo(null);
      setSequencia(null);
      setSelecionadas([]);
      setEquipeAtribuicao("");
      carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao atribuir grupo");
    } finally {
      setProcessando(false);
    }
  }

  function limparPlanejamento() {
    setSelecionadas([]);
    setSugestoes(null);
    setGrupoAtivo(null);
    setSequencia(null);
    setEquipeAtribuicao("");
  }

  function abrirLocalizacao(os: OsMapa) {
    setLocalizandoOs(os);
    setBusca("");
    setResultados([]);
    setLatSel(null);
    setLngSel(null);
    setEnderecoSel("");
    setCidadeSel("");
    setEstadoSel("");
    setErroLoc("");
  }

  function fecharLocalizacao() {
    setLocalizandoOs(null);
    miniMapaRef.current?.remove();
    miniMapaRef.current = null;
    miniMarcadorRef.current = null;
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

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (!localizandoOs || latSel == null || lngSel == null || !minimapaRef.current) return;
      const L = await getLeaflet();
      if (!ativo) return;
      if (!miniMapaRef.current) {
        const map = L.map(minimapaRef.current, { center: [latSel, lngSel], zoom: 15, scrollWheelZoom: false });
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
        miniMapaRef.current = map;
        miniMarcadorRef.current = marker;
      } else {
        miniMapaRef.current.setView([latSel, lngSel], 15);
        miniMarcadorRef.current?.setLatLng([latSel, lngSel]);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [localizandoOs, latSel, lngSel]);

  useEffect(() => {
    return () => {
      miniMapaRef.current?.remove();
      miniMapaRef.current = null;
      miniMarcadorRef.current = null;
    };
  }, []);

  async function salvarLocalizacao() {
    if (!localizandoOs || latSel == null || lngSel == null) {
      setErroLoc("Selecione um ponto no mapa (busque o endereço ou clique no mapa).");
      return;
    }
    setErroLoc("");
    setSalvandoLoc(true);
    try {
      await api.post<{ tem_localizacao: boolean }>("/api/gestor/planejamento/localizacao", {
        os_id: localizandoOs.id,
        latitude: latSel,
        longitude: lngSel,
        endereco: enderecoSel || localizandoOs.endereco_completo || undefined,
        cidade: cidadeSel || undefined,
        estado: estadoSel || undefined,
        nome_local: localizandoOs.local_nome || undefined
      });
      setMsg(`Localização de ${localizandoOs.numero} salva — agora ela aparece no mapa.`);
      miniMapaRef.current?.remove();
      miniMapaRef.current = null;
      miniMarcadorRef.current = null;
      fecharLocalizacao();
      carregar();
    } catch (e) {
      setErroLoc(e instanceof ApiError ? e.message : "Erro ao salvar a localização");
    } finally {
      setSalvandoLoc(false);
    }
  }

  const resumoGrupo = grupoAtivo
    ? {
        clientes: new Set(grupoAtivo.map((o) => o.cliente_nome)).size,
        prioridades: grupoAtivo.map((o) => o.prioridade),
        mts: grupoAtivo.filter((o) => o.mt).length,
        comLocalizacao: grupoAtivo.filter((o) => o.tem_localizacao).length
      }
    : null;

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Mapa das Equipes"
        descricao={modoPlanejamento ? "Planejamento operacional: selecione, agrupe e organize a sequência de atendimento" : "Acompanhe os atendimentos distribuídos por equipe a partir das Ordens de Serviço"}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {atualizadoEm && <span className="text-xs text-zinc-500">Atualizado às {atualizadoEm}</span>}
            <Botao variante={modoPlanejamento ? "perigo" : "secundario"} onClick={() => { setModoPlanejamento(!modoPlanejamento); limparPlanejamento(); }}>
              {modoPlanejamento ? "Sair do planejamento" : "Planejamento"}
            </Botao>
            <Botao variante="secundario" onClick={carregar}>Atualizar</Botao>
          </div>
        }
      />

      <div className="grid gap-2 md:grid-cols-6">
        <Select label="Equipe" value={filtro.equipe_id} onChange={(e) => setFiltro({ ...filtro, equipe_id: e.target.value })}>
          <option value="">Todas</option>
          {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
        </Select>
        <Select label="Status" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
          {STATUS_FILTRO.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </Select>
        <Select label="Cliente" value={filtro.cliente_id} onChange={(e) => setFiltro({ ...filtro, cliente_id: e.target.value })}>
          <option value="">Todos</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <Select label="Data" value={filtro.data} onChange={(e) => setFiltro({ ...filtro, data: e.target.value })}>
          <option value="hoje">Hoje</option>
          <option value="periodo">Período</option>
          <option value="todas">Todas</option>
        </Select>
        {filtro.data === "periodo" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">De</span>
              <input type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-zinc-700">Até</span>
              <input type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none" />
            </label>
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card title={`Mapa — ${comCoordenadas.length} atendimento${comCoordenadas.length === 1 ? "" : "s"} com localização${modoPlanejamento ? " · clique nos marcadores para selecionar" : ""}`}>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
            {Object.entries(CORES_STATUS).map(([st, cor]) => (
              <span key={st} className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: cor }} />
                {STATUS_FILTRO.find((s) => s.v === st)?.l || st}
              </span>
            ))}
          </div>
          <div ref={containerRef} className="h-[560px] w-full overflow-hidden rounded-lg border border-zinc-200" />
          {ordens === null && <Loading />}
        </Card>

        <div className="space-y-4">
          {modoPlanejamento && (
            <Card
              title={`Planejamento de rota — ${selecionadas.length} OS selecionada${selecionadas.length === 1 ? "" : "s"}`}
              acao={
                selecionadas.length > 0 ? (
                  <button onClick={limparPlanejamento} className="text-xs font-semibold text-red-600 hover:underline">Limpar seleção</button>
                ) : undefined
              }
            >
              <div className="space-y-3">
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                  {(ordens || []).map((os) => (
                    <label key={os.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-zinc-50">
                      <input type="checkbox" checked={selecionadas.includes(os.id)} onChange={() => toggleSelecao(os.id)} className="h-4 w-4 accent-blue-600" />
                      <span className="font-medium">{os.numero}</span>
                      <span className="truncate text-xs text-zinc-500">{os.cliente_nome}{os.local_nome ? ` — ${os.local_nome}` : ""}</span>
                      {!os.tem_localizacao && <span className="ml-auto shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">sem GPS</span>}
                    </label>
                  ))}
                </div>
                <Botao disabled={sugerindo || selecionadas.length < 2} onClick={agrupar} className="w-full">
                  {sugerindo ? "Analisando proximidade..." : "Agrupar atividades"}
                </Botao>
                {sugestoes && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-zinc-500">Grupos sugeridos por proximidade</p>
                    {sugestoes.map((g) => (
                      <div key={g.id} className="rounded-lg border border-zinc-200 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-zinc-800">{g.nome}</p>
                            <p className="text-xs text-zinc-500">{g.quantidade} OS · {g.os[0]?.cidade || "-"}</p>
                          </div>
                          <Botao disabled={processando} onClick={() => usarGrupo(g)}>Usar este grupo</Botao>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {modoPlanejamento && grupoAtivo && (
            <Card
              title={`Grupo de atividades — ${grupoAtivo.length} OS`}
              acao={
                <button onClick={() => { setGrupoAtivo(null); setSequencia(null); }} className="text-xs font-semibold text-red-600 hover:underline">
                  Desfazer
                </button>
              }
            >
              <div className="space-y-3">
                {resumoGrupo && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                      <p className="text-zinc-500">Clientes</p>
                      <p className="font-bold text-zinc-800">{resumoGrupo.clientes}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                      <p className="text-zinc-500">MTs vinculados</p>
                      <p className="font-bold text-zinc-800">{resumoGrupo.mts}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                      <p className="text-zinc-500">Com localização</p>
                      <p className="font-bold text-zinc-800">{resumoGrupo.comLocalizacao} de {grupoAtivo.length}</p>
                    </div>
                    <div className="rounded-lg bg-zinc-50 px-2.5 py-2">
                      <p className="text-zinc-500">Prioridades</p>
                      <p className="font-bold text-zinc-800">{resumoGrupo.prioridades.map((p) => LABEL_PRIORIDADE[p] || p).join(", ")}</p>
                    </div>
                  </div>
                )}
                <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
                  {(ordens || []).map((os) => {
                    const noGrupo = grupoAtivo.some((o) => o.id === os.id);
                    return (
                      <label key={os.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${noGrupo ? "bg-blue-50/70" : "hover:bg-zinc-50"}`}>
                        <input type="checkbox" checked={noGrupo} onChange={() => alterarGrupo(os.id)} className="h-4 w-4 accent-blue-600" />
                        <span className="font-medium">{os.numero}</span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${COR_PRIORIDADE[os.prioridade] || ""}`}>
                          {LABEL_PRIORIDADE[os.prioridade] || os.prioridade}
                        </span>
                        {os.mt && <span className="text-[10px] text-violet-600">{os.mt.codigo_mt}</span>}
                        {os.hora_inicio && <span className="text-[10px] text-zinc-500">{os.hora_inicio}</span>}
                      </label>
                    );
                  })}
                </div>
                <Botao disabled={processando || grupoAtivo.length === 0} onClick={otimizar} className="w-full">
                  {processando ? "Otimizando..." : "Otimizar sequência"}
                </Botao>
              </div>
            </Card>
          )}

          {modoPlanejamento && sequencia && (
            <Card title={`Roteiro sugerido — ${sequencia.total_km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`}>
              <div className="space-y-2">
                <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  {sequencia.sequencia.length} OS · distância estimada <span className="font-bold">{fmtKm(sequencia.total_km)}</span> · tempo estimado{" "}
                  <span className="font-bold">{sequencia.tempo_estimado_horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h</span>
                  <br />
                  <span className="text-blue-500">{sequencia.origem}</span>
                </p>
                <ol className="space-y-1.5">
                  {sequencia.sequencia.map((item, idx) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">{item.posicao}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-zinc-800">
                          {item.numero} — {item.cliente_nome}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {item.local_nome || "-"}
                          {item.hora_inicio ? ` · ${item.hora_inicio}` : ""} · <span className={`font-semibold ${item.prioridade === "urgente" ? "text-red-600" : "text-zinc-600"}`}>{LABEL_PRIORIDADE[item.prioridade] || item.prioridade}</span>
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-zinc-500">{fmtKm(item.distancia_anterior_km)}</span>
                      <div className="flex shrink-0 flex-col">
                        <button disabled={idx === 0} onClick={() => moverSequencia(idx, -1)} className="px-1 text-zinc-500 hover:text-blue-700 disabled:opacity-30" title="Subir">▲</button>
                        <button disabled={idx === sequencia.sequencia.length - 1} onClick={() => moverSequencia(idx, 1)} className="px-1 text-zinc-500 hover:text-blue-700 disabled:opacity-30" title="Descer">▼</button>
                      </div>
                    </li>
                  ))}
                </ol>
                {sequencia.notas.length > 0 && (
                  <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2">
                    {sequencia.notas.map((n, i) => (
                      <p key={i} className="text-xs text-amber-800">• {n}</p>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {modoPlanejamento && (
            <Card title="Atribuir grupo à equipe">
              <div className="space-y-3">
                <p className="text-xs text-zinc-500">
                  {grupoAtivo ? `Grupo com ${grupoAtivo.length} OS pronto para distribuição.` : "Defina o grupo de atividades para atribuir à equipe."}
                </p>
                <Select label="Equipe responsável" value={equipeAtribuicao} onChange={(e) => setEquipeAtribuicao(e.target.value)}>
                  <option value="">Selecione a equipe...</option>
                  {equipes.map((eq) => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
                </Select>
                <Botao disabled={processando || !grupoAtivo || grupoAtivo.length === 0 || !equipeAtribuicao} onClick={atribuir} className="w-full">
                  {processando ? "Atribuindo..." : "Atribuir à equipe"}
                </Botao>
              </div>
            </Card>
          )}

          <Card title="Detalhe do atendimento">
            {selecionado ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-blue-700">{selecionado.numero}</span>
                  <span
                    className="rounded-full px-2.5 py-1 text-xs font-semibold text-white"
                    style={{ background: CORES_STATUS[selecionado.status] || "#64748b" }}
                  >
                    {selecionado.status_label}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{selecionado.servico}</p>
                  {selecionado.tipo_atendimento && <p className="text-xs text-zinc-500">Tipo: {selecionado.tipo_atendimento}</p>}
                </div>
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-zinc-500">Equipe</dt>
                  <dd className="text-right font-medium">{selecionado.equipe_nome || "Sem equipe"}</dd>
                  <dt className="text-zinc-500">Cliente</dt>
                  <dd className="text-right">{selecionado.cliente_nome}</dd>
                  <dt className="text-zinc-500">Local</dt>
                  <dd className="text-right">{selecionado.local_nome || "-"}</dd>
                  <dt className="text-zinc-500">Data / horário</dt>
                  <dd className="text-right">
                    {fmtData(selecionado.data_agendada)} {selecionado.hora_inicio ? `${selecionado.hora_inicio}${selecionado.hora_fim ? `–${selecionado.hora_fim}` : ""}` : ""}
                  </dd>
                  <dt className="text-zinc-500">Técnico executor</dt>
                  <dd className="text-right">{selecionado.executor_nome || "-"}</dd>
                  <dt className="text-zinc-500">Início</dt>
                  <dd className="text-right">{fmtDataHora(selecionado.iniciada_em)}</dd>
                </dl>
                {selecionado.mt && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase text-blue-700">Equipamento MT</p>
                    <dl className="grid grid-cols-2 gap-y-1.5 text-xs">
                      <dt className="text-zinc-500">Código MT</dt><dd className="text-right font-semibold">{selecionado.mt.codigo_mt}</dd>
                      <dt className="text-zinc-500">Patrimônio</dt><dd className="text-right">{selecionado.mt.patrimonio || "-"}</dd>
                      <dt className="text-zinc-500">Tipo</dt><dd className="text-right">{selecionado.mt.tipo || "-"}</dd>
                      <dt className="text-zinc-500">Fabricante</dt><dd className="text-right">{selecionado.mt.fabricante || "-"}</dd>
                      <dt className="text-zinc-500">Modelo</dt><dd className="text-right">{selecionado.mt.modelo || "-"}</dd>
                      <dt className="text-zinc-500">Capacidade</dt><dd className="text-right">{selecionado.mt.capacidade || "-"}</dd>
                      <dt className="text-zinc-500">Gás/fluido</dt><dd className="text-right">{selecionado.mt.gas || "-"}</dd>
                      <dt className="text-zinc-500">Ambiente/local</dt><dd className="text-right">{selecionado.mt.ambiente || selecionado.mt.local || "-"}</dd>
                    </dl>
                  </div>
                )}
                <Botao onClick={() => router.push(`/app/gestor/os/${selecionado.id}`)} className="w-full">Abrir OS</Botao>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-zinc-400">Clique em um marcador no mapa para ver os detalhes.</p>
            )}
          </Card>

          <Card title={`Sem localização disponível (${semCoordenadas.length})`}>
            {semCoordenadas.length === 0 ? (
              <p className="py-2 text-center text-xs text-zinc-400">Nenhuma OS sem localização no período.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {semCoordenadas.map((os) => (
                  <li key={os.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{os.numero}</span>
                      <span className="text-xs text-zinc-500">{os.equipe_nome || "Sem equipe"}</span>
                    </div>
                    <p className="text-xs text-zinc-600">{os.cliente_nome}{os.local_nome ? ` — ${os.local_nome}` : ""}</p>
                    {os.endereco_completo && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(os.endereco_completo)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 underline hover:text-blue-800"
                      >
                        Ver endereço no mapa
                      </a>
                    )}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Botao variante="secundario" onClick={() => router.push(`/app/gestor/os/${os.id}`)}>Abrir OS</Botao>
                      <Botao variante="secundario" onClick={() => abrirLocalizacao(os)}>Definir localização</Botao>
                      {modoPlanejamento && (
                        <Botao
                          variante={selecionadas.includes(os.id) ? "perigo" : "secundario"}
                          onClick={() => toggleSelecao(os.id)}
                        >
                          {selecionadas.includes(os.id) ? "Remover" : "Selecionar"}
                        </Botao>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {localizandoOs && (
        <Modal titulo={`Localização de ${localizandoOs.numero} — ${localizandoOs.cliente_nome}`} onFechar={fecharLocalizacao} largura="max-w-2xl">
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
                placeholder={`Endereço do local${localizandoOs.local_nome ? ` (${localizandoOs.local_nome})` : ""}...`}
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
                <div ref={minimapaRef} className="h-56 w-full rounded-lg border border-zinc-300" />
                <p className="text-xs text-zinc-500">
                  Arraste o marcador ou clique no mapa para ajustar · <span className="font-semibold">Lat {latSel.toFixed(6)} · Lng {lngSel.toFixed(6)}</span>
                </p>
              </div>
            )}
            <Botao disabled={salvandoLoc || latSel == null || lngSel == null} onClick={salvarLocalizacao} className="w-full">
              {salvandoLoc ? "Salvando..." : "Salvar localização no mapa"}
            </Botao>
          </div>
        </Modal>
      )}
    </div>
  );
}