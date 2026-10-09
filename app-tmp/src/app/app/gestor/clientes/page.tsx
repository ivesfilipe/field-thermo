"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Botao, Campo, Card, KPI, LinksMapa, LinhaVazia, Loading, Modal, PageHeader, Tabela } from "@/components/ui";
import ImportarClientesModal from "./importar-modal";

interface Cliente {
  id: number;
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade_principal?: string | null;
  estado_principal?: string | null;
  responsavel_principal?: string | null;
  total_locais: number;
  total_equipamentos: number;
}

const POR_PAGINA = 50;

const CORES_AVATAR = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-orange-100 text-orange-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-fuchsia-100 text-fuchsia-700"
];

function semAcento(v: string | null | undefined) {
  return (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function mapaNormalizado(v: string) {
  const normChars: string[] = [];
  const origens: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const base = v[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const ch of base) {
      normChars.push(ch);
      origens.push(i);
    }
  }
  return { norm: normChars.join(""), origens };
}

function faixasDestaque(texto: string, termos: string[]): Array<[number, number]> {
  if (!termos.length || !texto) return [];
  const { norm, origens } = mapaNormalizado(texto);
  const marcas: boolean[] = new Array(texto.length).fill(false);
  for (const t of termos) {
    if (!t) continue;
    let idx = norm.indexOf(t);
    while (idx !== -1) {
      for (let j = idx; j < idx + t.length; j++) marcas[origens[j]] = true;
      idx = norm.indexOf(t, idx + 1);
    }
  }
  const faixas: Array<[number, number]> = [];
  let inicio = -1;
  for (let i = 0; i < texto.length; i++) {
    if (marcas[i] && inicio === -1) inicio = i;
    if ((!marcas[i] || i === texto.length - 1) && inicio !== -1) {
      faixas.push([inicio, marcas[i] ? i + 1 : i]);
      inicio = -1;
    }
  }
  return faixas;
}

function Destaque({ texto, termos }: { texto: string; termos: string[] }) {
  const faixas = faixasDestaque(texto, termos);
  if (!faixas.length || !texto) return <>{texto}</>;
  const partes: React.ReactNode[] = [];
  let pos = 0;
  for (const [ini, fim] of faixas) {
    if (ini > pos) partes.push(texto.slice(pos, ini));
    partes.push(
      <mark key={ini} className="rounded-sm bg-yellow-200/80 px-0.5 text-inherit">
        {texto.slice(ini, fim)}
      </mark>
    );
    pos = fim;
  }
  if (pos < texto.length) partes.push(texto.slice(pos));
  return <>{partes}</>;
}

function formatarDocumento(v: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v || "-";
}

function iniciaisCliente(nome: string): string {
  const limpo = nome.trim();
  if (!limpo) return "?";
  const palavras = limpo.split(/\s+/);
  if (palavras.length === 1) return limpo.slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[1][0]).toUpperCase();
}

function corAvatar(nome: string): string {
  const hash = [...nome].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 99991, 7);
  return CORES_AVATAR[hash % CORES_AVATAR.length];
}

function Icone({ caminho, className = "h-4 w-4" }: { caminho: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={caminho} />
    </svg>
  );
}

const ICONE_LUPA = "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z";
const ICONE_LAPIS = "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10";
const ICONE_LIXEIRA = "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0";
const ICONE_USUARIOS = "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z";
const ICONE_PIN = "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z";
const ICONE_CHAVE = "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z";
const ICONE_CIDADE = "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z";

type CampoOrdem = "nome" | "documento" | "locais" | "equipamentos";
type Ordem = { campo: CampoOrdem; dir: "asc" | "desc" };

const CLASSE_SELECT =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-sm text-zinc-900 shadow-sm transition-colors focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none";

function CabecalhoOrdenavel({ label, campo, ordem, onOrdenar }: { label: string; campo: CampoOrdem; ordem: Ordem; onOrdenar: (c: CampoOrdem) => void }) {
  const ativo = ordem.campo === campo;
  return (
    <button
      onClick={() => onOrdenar(campo)}
      title={`Ordenar por ${label.toLowerCase()}`}
      className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-blue-700 ${ativo ? "text-blue-700" : ""}`}
    >
      {label}
      <span aria-hidden="true" className={ativo ? "" : "opacity-30"}>
        {ativo ? (ordem.dir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState<Partial<Cliente>>({});
  const [formLocal, setFormLocal] = useState({ local_nome: "", endereco: "", cidade: "", estado: "", cep: "", responsavel_nome: "" });
  const [editando, setEditando] = useState<number | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [importacaoAberta, setImportacaoAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [cidadeFiltro, setCidadeFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [ordem, setOrdem] = useState<Ordem>({ campo: "nome", dir: "asc" });
  const [pagina, setPagina] = useState(1);
  const buscaRef = useRef<HTMLInputElement>(null);

  useEffect(() => setPagina(1), [busca, cidadeFiltro, estadoFiltro, ordem]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        !!alvo && (["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable);
      if ((e.key === "/" && !digitando) || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        buscaRef.current?.focus();
        buscaRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === buscaRef.current) {
        const input = buscaRef.current;
        if (input?.value) setBusca("");
        else input?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const termosBusca = useMemo(() => (busca.trim() ? semAcento(busca.trim()).split(/\s+/) : []), [busca]);

  const cidadesDisponiveis = useMemo(() => {
    const mapa = new Map<string, { cidade: string; estado: string }>();
    for (const c of clientes ?? []) {
      if (!c.cidade_principal) continue;
      const chave = `${c.cidade_principal}|${c.estado_principal || ""}`;
      if (!mapa.has(chave)) mapa.set(chave, { cidade: c.cidade_principal, estado: c.estado_principal || "" });
    }
    return [...mapa.values()].sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR"));
  }, [clientes]);

  const estadosDisponiveis = useMemo(
    () =>
      [...new Set((clientes ?? []).map((c) => c.estado_principal).filter((e): e is string => !!e))].sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [clientes]
  );

  const opcoesCidade = useMemo(
    () => cidadesDisponiveis.filter((c) => !estadoFiltro || c.estado === estadoFiltro),
    [cidadesDisponiveis, estadoFiltro]
  );

  const filtrados = useMemo(() => {
    const lista = (clientes ?? []).filter((c) => {
      if (estadoFiltro && (c.estado_principal ?? "") !== estadoFiltro) return false;
      if (cidadeFiltro && (c.cidade_principal ?? "") !== cidadeFiltro) return false;
      if (!termosBusca.length) return true;
      const docLimpo = (c.documento ?? "").replace(/\D/g, "");
      const alvo = `${semAcento(c.nome)} ${semAcento(c.documento)} ${docLimpo} ${semAcento(c.email)} ${semAcento(c.telefone)} ${semAcento(c.endereco)}`;
      return termosBusca.every((t) => alvo.includes(t));
    });
    const mult = ordem.dir === "asc" ? 1 : -1;
    return lista.sort((a, b) => {
      switch (ordem.campo) {
        case "documento":
          return mult * semAcento(a.documento).localeCompare(semAcento(b.documento), "pt-BR", { numeric: true });
        case "locais":
          return mult * (a.total_locais - b.total_locais);
        case "equipamentos":
          return mult * (a.total_equipamentos - b.total_equipamentos);
        default:
          return mult * a.nome.localeCompare(b.nome, "pt-BR");
      }
    });
  }, [clientes, cidadeFiltro, estadoFiltro, termosBusca, ordem]);

  function alternarOrdem(campo: CampoOrdem) {
    setOrdem((o) => (o.campo === campo ? { campo, dir: o.dir === "asc" ? "desc" : "asc" } : { campo, dir: "asc" }));
  }

  function limparFiltros() {
    setBusca("");
    setCidadeFiltro("");
    setEstadoFiltro("");
  }

  const temFiltros = !!(busca.trim() || cidadeFiltro || estadoFiltro);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const resumo = useMemo(() => {
    const lista = clientes ?? [];
    const cidades = new Set<string>();
    let locais = 0;
    let equipamentos = 0;
    for (const c of lista) {
      if (c.cidade_principal) cidades.add(`${c.cidade_principal}/${c.estado_principal || ""}`);
      locais += c.total_locais;
      equipamentos += c.total_equipamentos;
    }
    return { clientes: lista.length, locais, equipamentos, cidades: cidades.size };
  }, [clientes]);

  const carregar = useCallback(() => {
    api.get<{ clientes: Cliente[] }>("/api/gestor/clientes").then((r) => setClientes(r.clientes)).catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setForm({});
    setFormLocal({ local_nome: "", endereco: "", cidade: "", estado: "", cep: "", responsavel_nome: "" });
    setModalAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setEditando(c.id);
    setForm({ nome: c.nome, documento: c.documento || "", email: c.email || "", telefone: c.telefone || "", endereco: c.endereco || "" });
    setModalAberto(true);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsg("");
    try {
      if (editando === null) {
        const temEndereco = formLocal.endereco.trim() || formLocal.cidade.trim() || formLocal.estado.trim() || formLocal.cep.trim() || formLocal.responsavel_nome.trim();
        const payload = temEndereco
          ? {
              ...form,
              endereco: formLocal.endereco.trim() || undefined,
              cidade: formLocal.cidade.trim() || undefined,
              estado: formLocal.estado.trim() || undefined,
              cep: formLocal.cep.trim() || undefined,
              local_nome: formLocal.local_nome.trim() || undefined,
              responsavel_nome: formLocal.responsavel_nome.trim() || undefined
            }
          : form;
        await api.post("/api/gestor/clientes", payload);
        setMsg(temEndereco ? "Cliente salvo com o primeiro endereço." : "Cliente salvo.");
      } else {
        await api.put(`/api/gestor/clientes/${editando}`, form);
        setMsg("Cliente salvo.");
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  async function excluir(c: Cliente) {
    setErro("");
    if (!confirm(`Excluir o cliente "${c.nome}"?`)) return;
    try {
      await api.del(`/api/gestor/clientes/${c.id}`);
      carregar();
    } catch (err) {
      setErro((err as Error).message);
    }
  }

  const primeiroItem = filtrados.length === 0 ? 0 : (paginaAtual - 1) * POR_PAGINA + 1;
  const ultimoItem = Math.min(paginaAtual * POR_PAGINA, filtrados.length);

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader
        titulo="Clientes"
        descricao="Cadastre e gerencie os clientes atendidos"
        acoes={
          <>
            <Botao variante="secundario" onClick={() => setImportacaoAberta(true)}>IMPORTAR CLIENTES</Botao>
            <Botao onClick={abrirNovo}>+ Novo cliente</Botao>
          </>
        }
      />

      {clientes !== null && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KPI label="Clientes cadastrados" valor={resumo.clientes} icone={<Icone caminho={ICONE_USUARIOS} className="h-5 w-5 text-blue-700" />} />
          <KPI label="Cidades atendidas" valor={resumo.cidades} icone={<Icone caminho={ICONE_CIDADE} className="h-5 w-5 text-teal-600" />} />
          <KPI label="Endereços (locais)" valor={resumo.locais} icone={<Icone caminho={ICONE_PIN} className="h-5 w-5 text-violet-600" />} />
          <KPI label="Equipamentos" valor={resumo.equipamentos} icone={<Icone caminho={ICONE_CHAVE} className="h-5 w-5 text-amber-600" />} />
        </div>
      )}

      <Card
        title={`Clientes (${clientes === null ? "..." : temFiltros ? `${filtrados.length} encontrados de ${clientes.length}` : clientes.length})`}
      >
        <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(150px,200px)_90px_auto]">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
              <Icone caminho={ICONE_LUPA} />
            </span>
            <input
              ref={buscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF/CNPJ, e-mail, telefone ou endereço..."
              className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-12 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
            />
            {busca ? (
              <button
                onClick={() => setBusca("")}
                title="Limpar busca (Esc)"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                ×
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-400 md:block">
                /
              </kbd>
            )}
          </div>
          <select
            value={cidadeFiltro}
            onChange={(e) => {
              setCidadeFiltro(e.target.value);
              const esc = cidadesDisponiveis.find((c) => c.cidade === e.target.value);
              if (esc?.estado) setEstadoFiltro(esc.estado);
            }}
            className={CLASSE_SELECT}
            title="Filtrar por cidade"
          >
            <option value="">Todas as cidades</option>
            {opcoesCidade.map((c) => (
              <option key={`${c.cidade}|${c.estado}`} value={c.cidade}>
                {c.cidade}
              </option>
            ))}
          </select>
          <select
            value={estadoFiltro}
            onChange={(e) => {
              setEstadoFiltro(e.target.value);
              const atual = cidadesDisponiveis.find((c) => c.cidade === cidadeFiltro);
              if (atual && e.target.value && atual.estado !== e.target.value) setCidadeFiltro("");
            }}
            className={CLASSE_SELECT}
            title="Filtrar por estado"
          >
            <option value="">UF</option>
            {estadosDisponiveis.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
          {temFiltros ? (
            <Botao variante="secundario" onClick={limparFiltros}>
              Limpar
            </Botao>
          ) : (
            <span />
          )}
        </div>

        <Tabela
          cabecalhos={[
            <CabecalhoOrdenavel key="nome" label="Cliente" campo="nome" ordem={ordem} onOrdenar={alternarOrdem} />,
            <CabecalhoOrdenavel key="documento" label="Documento" campo="documento" ordem={ordem} onOrdenar={alternarOrdem} />,
            "Contato",
            "Endereço",
            <span key="quantidades" className="inline-flex items-center gap-1">
              <CabecalhoOrdenavel label="Locais" campo="locais" ordem={ordem} onOrdenar={alternarOrdem} />
              <span className="text-zinc-300">/</span>
              <CabecalhoOrdenavel label="Equip." campo="equipamentos" ordem={ordem} onOrdenar={alternarOrdem} />
            </span>,
            ""
          ]}
        >
          {clientes === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : filtrados.length === 0 ? (
            <LinhaVazia
              texto={
                temFiltros
                  ? `Nenhum cliente encontrado${busca.trim() ? ` para "${busca.trim()}"` : ""}. Tente limpar os filtros.`
                  : "Nenhum cliente cadastrado."
              }
            />
          ) : (
            visiveis.map((c) => (
              <tr key={c.id} className="cursor-pointer transition-colors hover:bg-blue-50/40" onClick={() => router.push(`/app/gestor/clientes/${c.id}`)}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${corAvatar(c.nome)}`}>
                      {iniciaisCliente(c.nome)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-zinc-800">
                        <Destaque texto={c.nome} termos={termosBusca} />
                      </span>
                      {c.responsavel_principal && (
                        <span className="block truncate text-xs text-zinc-400">Resp.: {c.responsavel_principal}</span>
                      )}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-zinc-600">
                  <Destaque texto={formatarDocumento(c.documento)} termos={termosBusca} />
                </td>
                <td className="hidden px-3 py-2.5 md:table-cell">
                  <span className="block truncate text-xs text-zinc-600">{c.email || "-"}</span>
                  <span className="block whitespace-nowrap text-xs text-zinc-500">{c.telefone || ""}</span>
                </td>
                <td className="hidden max-w-[240px] px-3 py-2.5 lg:table-cell">
                  <span className="block truncate text-xs text-zinc-600">
                    <Destaque
                      texto={`${c.endereco || "-"}${c.cidade_principal ? `, ${c.cidade_principal}` : ""}${c.estado_principal ? `/${c.estado_principal}` : ""}`}
                      termos={termosBusca}
                    />
                  </span>
                  {c.endereco && (
                    <LinksMapa
                      espaco={false}
                      pararPropagacao
                      endereco={`${c.endereco.replace(/[,;\s]+$/, "")}${c.cidade_principal ? `, ${c.cidade_principal}` : ""}${c.estado_principal ? `/${c.estado_principal}` : ""}`}
                    />
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700" title="Endereços cadastrados">
                      <Icone caminho={ICONE_PIN} className="h-3 w-3" />
                      {c.total_locais}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700" title="Equipamentos vinculados">
                      <Icone caminho={ICONE_CHAVE} className="h-3 w-3" />
                      {c.total_equipamentos}
                    </span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); abrirEdicao(c); }}
                      title="Editar cliente"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Icone caminho={ICONE_LAPIS} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); excluir(c); }}
                      title="Excluir cliente"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      <Icone caminho={ICONE_LIXEIRA} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </Tabela>

        {filtrados.length > POR_PAGINA && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3">
            <p className="text-xs text-zinc-500">
              Exibindo {primeiroItem}–{ultimoItem} de {filtrados.length} clientes
            </p>
            <div className="flex items-center gap-1.5">
              <button
                disabled={paginaAtual <= 1}
                onClick={() => setPagina(paginaAtual - 1)}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="px-1.5 text-xs font-medium text-zinc-600">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <button
                disabled={paginaAtual >= totalPaginas}
                onClick={() => setPagina(paginaAtual + 1)}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima →
              </button>
            </div>
          </div>
        )}
      </Card>

      {importacaoAberta && (
        <ImportarClientesModal onFechar={() => setImportacaoAberta(false)} onImportado={(m) => setMsg(m)} />
      )}

      {modalAberto && (
        <Modal titulo={editando === null ? "Novo cliente" : `Editar cliente #${editando}`} onFechar={() => setModalAberto(false)}>
          <form onSubmit={salvar} className="grid gap-3 md:grid-cols-2">
            <Campo label="Nome" required value={form.nome || ""} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Campo label="Documento (CNPJ/CPF)" value={form.documento || ""} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            <Campo label="Email" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Campo label="Telefone" value={form.telefone || ""} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            {editando === null && (
              <div className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:col-span-2">
                <p className="text-sm font-semibold text-blue-800">Primeiro endereço do cliente</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Campo label="Nome do endereço" value={formLocal.local_nome} onChange={(e) => setFormLocal({ ...formLocal, local_nome: e.target.value })} placeholder="Ex.: Matriz, Filial, Depósito..." />
                  <Campo label="Responsável pelo endereço" value={formLocal.responsavel_nome} onChange={(e) => setFormLocal({ ...formLocal, responsavel_nome: e.target.value })} />
                </div>
                <Campo label="Endereço" value={formLocal.endereco} onChange={(e) => setFormLocal({ ...formLocal, endereco: e.target.value })} placeholder="Rua, número, bairro..." />
                <div className="grid gap-3 md:grid-cols-3">
                  <Campo label="Cidade" value={formLocal.cidade} onChange={(e) => setFormLocal({ ...formLocal, cidade: e.target.value })} />
                  <Campo label="Estado" value={formLocal.estado} onChange={(e) => setFormLocal({ ...formLocal, estado: e.target.value })} placeholder="UF" />
                  <Campo label="CEP" value={formLocal.cep} onChange={(e) => setFormLocal({ ...formLocal, cep: e.target.value })} />
                </div>
                <p className="text-xs text-blue-600">Preenchendo o endereço, o cliente já nasce com ele — fica pronto para usar na OS e no mapa.</p>
              </div>
            )}
            {editando !== null && (
              <div className="md:col-span-2">
                <Campo label="Endereço" value={form.endereco || ""} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
              </div>
            )}
            <div className="flex gap-2 md:col-span-2">
              <Botao tipo="submit">{editando === null ? "Criar cliente" : "Salvar"}</Botao>
              <Botao variante="secundario" onClick={() => setModalAberto(false)}>Cancelar</Botao>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
