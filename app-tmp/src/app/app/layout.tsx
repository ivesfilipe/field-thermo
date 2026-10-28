"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api, PERFIS, type Perfil } from "@/lib/api";

const ICONES: Record<string, React.ReactNode> = {
  inicio: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  calendario: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  os: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  clientes: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-4-4 4 4 0 004 4zm6-2a3 3 0 10-3-3 3 3 0 003 3z" />
    </svg>
  ),
  locais: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  relatorios: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  oportunidades: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  agenda: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  usuarios: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  equipes: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  avaliacoes: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.977 10.1c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  mapa: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ),
  km: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  veiculos: (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 17h8M5 17H3a1 1 0 01-1-1v-3m18 4h-2m2-4V9.5a2 2 0 00-.447-1.284L17.5 5H6.5L4.447 8.216A2 2 0 004 9.5V13m16 0h-2m2 0v3m-16-3V9.5M5 17v2a1 1 0 001 1h1a1 1 0 001-1v-2m6 0v2a1 1 0 001 1h1a1 1 0 001-1v-2M3 13h18" />
    </svg>
  )
};

const NAV: Record<Perfil, { titulo: string; itens: { href: string; label: string; icone: string }[] }[]> = {
  admin: [
    {
      titulo: "Visão geral",
      itens: [
        { href: "/app", label: "Painel Inicial", icone: "inicio" }
      ]
    },
    {
      titulo: "Operação & Campo",
      itens: [
        { href: "/app/gestor/os", label: "Ordens de Serviço", icone: "os" },
        { href: "/app/gestor/calendario", label: "Calendário", icone: "calendario" },
        { href: "/app/gestor/mapa", label: "Mapa das Equipes", icone: "mapa" },
        { href: "/app/gestor/km", label: "Quilometragem (KM)", icone: "km" }
      ]
    },
    {
      titulo: "Cadastros",
      itens: [
        { href: "/app/gestor/clientes", label: "Clientes", icone: "clientes" },
        { href: "/app/gestor/locais", label: "Endereços", icone: "locais" }
      ]
    },
    {
      titulo: "Qualidade",
      itens: [
        { href: "/app/comercial/relatorios", label: "Relatórios Técnicos", icone: "relatorios" },
        { href: "/app/gestor/avaliacoes", label: "Avaliações", icone: "avaliacoes" }
      ]
    },
    {
      titulo: "Administração",
      itens: [
        { href: "/app/admin/usuarios", label: "Usuários", icone: "usuarios" },
        { href: "/app/admin/equipes", label: "Equipes", icone: "equipes" },
        { href: "/app/admin/veiculos", label: "Veículos", icone: "veiculos" }
      ]
    }
  ],
  gestor: [
    {
      titulo: "Visão geral",
      itens: [
        { href: "/app", label: "Painel Inicial", icone: "inicio" }
      ]
    },
    {
      titulo: "Operação & Campo",
      itens: [
        { href: "/app/gestor/os", label: "Ordens de Serviço", icone: "os" },
        { href: "/app/gestor/calendario", label: "Calendário", icone: "calendario" },
        { href: "/app/gestor/mapa", label: "Mapa das Equipes", icone: "mapa" },
        { href: "/app/gestor/km", label: "Quilometragem (KM)", icone: "km" }
      ]
    },
    {
      titulo: "Cadastros",
      itens: [
        { href: "/app/gestor/clientes", label: "Clientes", icone: "clientes" },
        { href: "/app/gestor/locais", label: "Endereços", icone: "locais" },
        { href: "/app/gestor/equipes", label: "Equipes", icone: "equipes" }
      ]
    },
    {
      titulo: "Qualidade",
      itens: [
        { href: "/app/comercial/relatorios", label: "Relatórios Técnicos", icone: "relatorios" },
        { href: "/app/gestor/avaliacoes", label: "Avaliações", icone: "avaliacoes" }
      ]
    }
  ],
  tecnico: [
    {
      titulo: "Visão geral",
      itens: [
        { href: "/app", label: "Painel Inicial", icone: "inicio" }
      ]
    },
    {
      titulo: "Minha rotina",
      itens: [
        { href: "/app/tecnico/os", label: "Minhas OS", icone: "os" },
        { href: "/app/tecnico/agenda", label: "Minha Agenda", icone: "agenda" },
        { href: "/app/tecnico/km", label: "Controle de KM", icone: "km" }
      ]
    }
  ],
  comercial: [
    {
      titulo: "Visão geral",
      itens: [
        { href: "/app", label: "Painel Inicial", icone: "inicio" }
      ]
    },
    {
      titulo: "Comercial",
      itens: [
        { href: "/app/comercial/relatorios", label: "Relatórios Recebidos", icone: "relatorios" },
        { href: "/app/comercial/oportunidades", label: "Oportunidades", icone: "oportunidades" },
        { href: "/app/comercial/avaliacoes", label: "Avaliações", icone: "avaliacoes" }
      ]
    }
  ]
};

function itensAchatados(perfil: Perfil): { href: string; label: string; icone: string }[] {
  return (NAV[perfil] || []).flatMap((s) => s.itens);
}

function TituloPagina(pathname: string, perfil: Perfil): string {
  const base = "/app";
  const rest = pathname.replace(base, "");
  if (rest === "" || rest === "/") return "Painel Inicial";
  const lista = itensAchatados(perfil);
  const match = lista.find((i) => rest.startsWith(i.href.replace(base, "")));
  if (match) return match.label;
  if (rest.startsWith("/tecnico/os") && rest !== "/tecnico/os") return "Execução da OS";
  if (rest.startsWith("/gestor/os/nova")) return "Nova Ordem de Serviço";
  if (rest.startsWith("/gestor/os")) return "Ordem de Serviço";
  if (rest.startsWith("/comercial/relatorios")) return "Relatório Técnico";
  return "Thermo control";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { usuario, carregando, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [recolhida, setRecolhida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [pendentesAval, setPendentesAval] = useState(0);

  useEffect(() => {
    if (!usuario) return;
    let parou = false;
    const perfilAtual = usuario.perfil as Perfil;
    const buscar = async () => {
      try {
        if (perfilAtual === "gestor" || perfilAtual === "admin") {
          const r = await api.get<{ indicadores: { pendentes: number } }>("/api/gestor/avaliacoes");
          if (!parou) setPendentesAval(r.indicadores.pendentes || 0);
        } else if (perfilAtual === "comercial") {
          const r = await api.get<{ avaliacoes: { status: string }[] }>("/api/comercial/avaliacoes");
          if (!parou) setPendentesAval(r.avaliacoes.filter((a) => a.status === "pendente").length);
        }
      } catch {
        /* sem notificação se a API falhar */
      }
    };
    buscar();
    const timer = setInterval(buscar, 30000);
    return () => {
      parou = true;
      clearInterval(timer);
    };
  }, [usuario]);

  useEffect(() => {
    if (!carregando && !usuario) router.replace("/login");
  }, [carregando, usuario, router]);

  useEffect(() => {
    setMenuAberto(false);
  }, [pathname]);

  if (carregando || !usuario) {
    return <p className="py-16 text-center text-sm text-white">Carregando...</p>;
  }

  const perfil = usuario.perfil as Perfil;
  const iniciais = usuario.nome.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const podeCriarOS = perfil === "gestor" || perfil === "admin";
  const itensMobile = itensAchatados(perfil).slice(0, 4);

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-blue-950 shadow-lg">
      <div className="flex flex-col gap-2 border-b border-blue-900 px-4 py-4">
        <Image src="/logo.png" alt="Logo MedicalThermo Herzog" width={224} height={59} className="h-auto w-full object-contain" />
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="truncate text-sm font-bold text-white">Thermo control</p>
          <span className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-200">
            {PERFIS[perfil]}
          </span>
        </div>
      </div>

      {podeCriarOS && (
        <div className="px-3 pt-3">
          <Link
            href="/app/gestor/os/nova"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-blue-950 shadow-sm transition-all hover:bg-blue-50 active:scale-[0.98]"
          >
            <span>+ Nova Ordem de Serviço</span>
          </Link>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {(NAV[perfil] || []).map((secao) => (
          <div key={secao.titulo} className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-blue-400/80">{secao.titulo}</p>
            {secao.itens.map((item) => {
              const ativo = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    ativo ? "bg-blue-700 text-white shadow-sm" : "text-blue-100 hover:bg-blue-900"
                  }`}
                >
                  <span className="shrink-0">{ICONES[item.icone]}</span>
                  <span className="truncate">{item.label}</span>
                  {item.label.includes("Avalia") && pendentesAval > 0 ? (
                    <span className="ml-auto shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white" title={`${pendentesAval} avaliação(ões) pendente(s)`}>
                      {pendentesAval}
                    </span>
                  ) : ativo ? (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-blue-900 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-800 text-xs font-bold text-white">
            {iniciais}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{usuario.nome}</p>
            <p className="truncate text-xs text-blue-300">{PERFIS[perfil]}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-800 px-3 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-blue-900"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sair
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">
        <div className={`h-full transition-all duration-200 ${recolhida ? "w-16" : "w-64"}`}>
          {recolhida ? (
            <aside className="flex h-full w-16 flex-col bg-blue-950 shadow-lg">
              <div className="flex justify-center border-b border-blue-900 py-4">
                <div className="flex justify-center px-2 py-4">
                  <Image src="/logo.png" alt="Logo" width={64} height={17} className="h-auto w-16 object-contain" />
                </div>
              </div>
              <nav className="flex-1 space-y-3 px-2 py-4">
                {(NAV[perfil] || []).map((secao) => (
                  <div key={secao.titulo} className="space-y-1">
                    {secao.itens.map((item) => {
                      const ativo = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          title={item.label}
                          className={`flex items-center justify-center rounded-lg p-2.5 text-sm transition-colors ${
                            ativo ? "bg-blue-700 text-white" : "text-blue-100 hover:bg-blue-900"
                          }`}
                        >
                          <span className="relative">
                            {ICONES[item.icone]}
                            {item.label.includes("Avalia") && pendentesAval > 0 && (
                              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-blue-950" title={`${pendentesAval} avaliação(ões) pendente(s)`} />
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
              <div className="flex justify-center border-t border-blue-900 p-3">
                <button onClick={logout} title="Sair" className="rounded-lg border border-blue-800 p-2 text-blue-100 hover:bg-blue-900">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            </aside>
          ) : (
            sidebar
          )}
        </div>
        <button
          onClick={() => setRecolhida(!recolhida)}
          className="absolute top-1/2 -right-3 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-500 shadow-sm hover:text-blue-900 lg:flex"
          title={recolhida ? "Expandir menu" : "Recolher menu"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3.5 w-3.5 transition-transform ${recolhida ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {menuAberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMenuAberto(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}</div>
          <button
            onClick={() => setMenuAberto(false)}
            className="absolute top-4 right-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-blue-900 bg-blue-950 px-4 py-3 shadow-sm md:px-6">
          <button
            onClick={() => setMenuAberto(true)}
            className="rounded-lg border border-blue-800 p-2 text-blue-100 hover:bg-blue-900 lg:hidden"
            title="Abrir menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{TituloPagina(pathname, perfil)}</p>
            <p className="hidden truncate text-xs text-blue-300 sm:block">
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {podeCriarOS && (
              <Link
                href="/app/gestor/os/nova"
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-blue-950 shadow-sm hover:bg-blue-50 sm:inline-block"
              >
                + Nova OS
              </Link>
            )}
            <span className="hidden rounded-full bg-blue-900 px-3 py-1 text-xs font-medium text-blue-200 md:inline-block">
              {PERFIS[perfil]}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-800 text-xs font-bold text-white lg:hidden">
              {iniciais}
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
        <footer className="py-3 text-center text-xs font-semibold text-zinc-400">Criado por Matheus Bastos</footer>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-zinc-200 bg-white px-2 py-1.5 shadow-lg lg:hidden">
        {itensMobile.map((item) => {
          const ativo = pathname === item.href || (item.href !== "/app" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                ativo ? "text-blue-900 font-bold" : "text-zinc-500 hover:text-blue-900"
              }`}
            >
              {ICONES[item.icone]}
              <span className="max-w-18 truncate">{item.label.replace("Ordens de Serviço", "OS").replace("Painel Inicial", "Início").replace("Quilometragem (KM)", "KM").replace("Controle de KM", "KM")}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuAberto(true)}
          className="flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:text-blue-900"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
    </div>
  );
}
