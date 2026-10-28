"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api, PERFIS, type Perfil } from "@/lib/api";
import { Badge, Botao, Card, EstadoVazio, KPI, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Tabela } from "@/components/ui";

interface OS {
  id: number;
  numero: string;
  servico: string;
  prioridade: string;
  status: string;
  data_agendada: string | null;
  cliente_nome: string;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  equipe_nome: string | null;
}

interface Relatorio {
  id: number;
  os_numero: string;
  cliente_nome: string;
  os_servico: string;
  data_validacao: string | null;
  recomendacoes: string | null;
}

interface Oportunidade {
  id: number;
  os_numero: string;
  cliente_nome: string;
  descricao: string;
  valor_estimado: number | null;
  status: string;
  previsao_fechamento: string | null;
}

interface Indicadores {
  os_hoje: number;
  os_em_andamento: number;
  os_aguardando_atendimento: number;
  os_atrasadas: number;
  os_aguardando_validacao: number;
  atividades_programadas: number;
}

const ATALHOS: Record<Perfil, { label: string; desc: string; href: string; destaque?: boolean }[]> = {
  admin: [
    { label: "+ Nova OS", desc: "Criar e agendar atendimento", href: "/app/gestor/os/nova", destaque: true },
    { label: "Ordens de Serviço", desc: "Lista completa e filtros", href: "/app/gestor/os" },
    { label: "Calendário", desc: "Agenda por dia, semana e mês", href: "/app/gestor/calendario" },
    { label: "Mapa das Equipes", desc: "Localização dos atendimentos", href: "/app/gestor/mapa" },
    { label: "Clientes", desc: "Cadastro, locais e equipamentos", href: "/app/gestor/clientes" },
    { label: "Usuários e Equipes", desc: "Administração de acessos", href: "/app/admin/usuarios" }
  ],
  gestor: [
    { label: "+ Nova OS", desc: "Criar e agendar atendimento", href: "/app/gestor/os/nova", destaque: true },
    { label: "Ordens de Serviço", desc: "Lista completa e validação", href: "/app/gestor/os" },
    { label: "Calendário", desc: "Agenda por dia, semana e mês", href: "/app/gestor/calendario" },
    { label: "Mapa das Equipes", desc: "Localização dos atendimentos", href: "/app/gestor/mapa" },
    { label: "Clientes", desc: "Cadastro, locais e equipamentos", href: "/app/gestor/clientes" },
    { label: "Relatórios Técnicos", desc: "Relatórios validados e PDF", href: "/app/comercial/relatorios" }
  ],
  tecnico: [
    { label: "Minhas OS", desc: "Atendimentos do dia e execução", href: "/app/tecnico/os", destaque: true },
    { label: "Minha Agenda", desc: "Programação de atendimentos", href: "/app/tecnico/agenda" },
    { label: "Controle de KM", desc: "Registrar saída e chegada de veículo", href: "/app/tecnico/km" }
  ],
  comercial: [
    { label: "Relatórios Recebidos", desc: "Laudos técnicos com indicação", href: "/app/comercial/relatorios", destaque: true },
    { label: "Oportunidades", desc: "Propostas e negociações", href: "/app/comercial/oportunidades" },
    { label: "Avaliações", desc: "Satisfação dos clientes", href: "/app/comercial/avaliacoes" }
  ]
};

export default function AppHome() {
  const { usuario } = useAuth();
  const router = useRouter();
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [relatorios, setRelatorios] = useState<Relatorio[] | null>(null);
  const [oportunidades, setOportunidades] = useState<Oportunidade[] | null>(null);
  const [indicadores, setIndicadores] = useState<Indicadores | null>(null);
  const [dataSelecionada, setDataSelecionada] = useState(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  });

  const perfil = (usuario?.perfil || "gestor") as Perfil;

  useEffect(() => {
    if (!perfil) return;
    if (perfil === "tecnico") {
      const hoje = new Date().toISOString().slice(0, 10);
      api.get<{ ordens: OS[] }>(`/api/tecnico/os?data=${hoje}`).then((r) => setOrdens(r.ordens)).catch(() => setOrdens([]));
    } else if (perfil === "comercial") {
      api.get<{ relatorios: Relatorio[] }>("/api/comercial/relatorios").then((r) => setRelatorios(r.relatorios)).catch(() => setRelatorios([]));
      api.get<{ oportunidades: Oportunidade[] }>("/api/comercial/oportunidades").then((r) => setOportunidades(r.oportunidades)).catch(() => setOportunidades([]));
    } else {
      const hoje = new Date();
      const fim = new Date(hoje);
      fim.setDate(fim.getDate() + 6);
      const iniStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
      const fimStr = `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, "0")}-${String(fim.getDate()).padStart(2, "0")}`;
      api.get<{ ordens: OS[] }>("/api/gestor/os").then((r) => setOrdens(r.ordens)).catch(() => setOrdens([]));
      api.get<{ indicadores: Indicadores }>(`/api/gestor/calendario?data_inicio=${iniStr}&data_fim=${fimStr}`)
        .then((r) => setIndicadores(r.indicadores))
        .catch(() => setIndicadores(null));
    }
  }, [perfil]);

  const totalPorStatus = (s: string) => (ordens || []).filter((o) => o.status === s).length;
  const hoje = new Date().toISOString().slice(0, 10);
  const ordensHoje = (ordens || []).filter((o) => o.data_agendada === dataSelecionada);

  function mudarData(dias: number) {
    const [y, m, d] = dataSelecionada.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + dias);
    setDataSelecionada(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
  }

  function rotuloData() {
    const [y, m, d] = dataSelecionada.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dataSelecionada === hoje ? "hoje" : dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const contOportunidades = (s: string) => (oportunidades || []).filter((o) => o.status === s).length;
  const atalhos = ATALHOS[perfil] || [];

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={`Olá, ${usuario?.nome?.split(" ")[0]}`}
        descricao={`Painel de ${PERFIS[perfil].toLowerCase()} — visão geral e acesso rápido`}
        acoes={
          perfil === "gestor" || perfil === "admin" ? (
            <div className="flex gap-2">
              <Botao variante="secundario" onClick={() => router.push("/app/gestor/calendario")}>Calendário</Botao>
              <Botao onClick={() => router.push("/app/gestor/os/nova")}>+ Nova OS</Botao>
            </div>
          ) : perfil === "tecnico" ? (
            <Botao onClick={() => router.push("/app/tecnico/agenda")}>Ver minha agenda</Botao>
          ) : (
            <Botao onClick={() => router.push("/app/comercial/oportunidades")}>Ver oportunidades</Botao>
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {atalhos.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`group flex flex-col justify-between rounded-xl border p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
              a.destaque
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                : "border-blue-100 bg-white text-slate-800 hover:border-blue-300"
            }`}
          >
            <span className={`text-sm font-bold ${a.destaque ? "text-white" : "text-blue-700 group-hover:text-blue-800"}`}>
              {a.label}
            </span>
            <span className={`mt-1 text-xs leading-snug ${a.destaque ? "text-blue-100" : "text-slate-500"}`}>
              {a.desc}
            </span>
          </Link>
        ))}
      </div>

      {perfil === "comercial" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI label="Relatórios recebidos" valor={relatorios?.length ?? 0} cor="text-blue-700" />
            <KPI label="Oportunidades abertas" valor={oportunidades?.length ?? 0} cor="text-blue-700" />
            <KPI label="Em negociação / proposta" valor={contOportunidades("em_negociacao") + contOportunidades("proposta_enviada")} cor="text-violet-700" />
            <KPI label="Ganhas" valor={contOportunidades("ganha")} cor="text-emerald-700" />
          </div>

          <Card title="Oportunidades recentes" acao={<Botao variante="secundario" onClick={() => router.push("/app/comercial/oportunidades")}>Ver todas</Botao>}>
            {oportunidades === null ? (
              <Loading />
            ) : oportunidades.length === 0 ? (
              <EstadoVazio texto="Nenhuma oportunidade registrada." />
            ) : (
              <div className="space-y-2">
                {oportunidades.slice(0, 8).map((op) => (
                  <div
                    key={op.id}
                    onClick={() => router.push("/app/comercial/oportunidades")}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:border-blue-300"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {op.cliente_nome} <span className="text-zinc-400">· {op.os_numero}</span>
                      </p>
                      <p className="truncate text-xs text-zinc-500">{op.descricao}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {op.valor_estimado != null && <span className="text-sm font-semibold text-zinc-700">R$ {op.valor_estimado.toLocaleString("pt-BR")}</span>}
                      <Badge status={op.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      ) : perfil === "tecnico" ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <KPI label="Pendentes" valor={totalPorStatus("pendente")} cor="text-amber-700" />
            <KPI label="Em andamento" valor={totalPorStatus("em_andamento")} cor="text-blue-700" />
            <KPI label="Aguardando validação" valor={totalPorStatus("aguardando_validacao")} cor="text-violet-700" />
            <KPI label="Concluídas" valor={totalPorStatus("concluida")} cor="text-emerald-700" />
          </div>

          <Card title="Minhas ordens de serviço de hoje" acao={<Botao variante="secundario" onClick={() => router.push("/app/tecnico/os")}>Ver todas</Botao>}>
            <Tabela cabecalhos={["Nº", "Cliente", "Local", "Serviço", "Data", "Prioridade", "Status"]}>
              {ordens === null ? (
                <tr><td colSpan={99}><Loading /></td></tr>
              ) : ordens.length === 0 ? (
                <LinhaVazia texto="Nenhuma ordem de serviço atribuída a você." />
              ) : (
                ordens.slice(0, 10).map((o) => (
                  <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>
                    <td className="px-3 py-2 font-medium text-blue-700">{o.numero}</td>
                    <td className="px-3 py-2">{o.cliente_nome}</td>
                    <td className="hidden px-3 py-2 md:table-cell">
                      {o.local_nome || "-"}
                      {(o.local_endereco_completo || o.local_endereco) && (
                        <span className="block text-xs text-zinc-500">
                          {o.local_endereco_completo || o.local_endereco}
                          <LinksMapa endereco={(o.local_endereco_completo || o.local_endereco)!} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{o.servico}</td>
                    <td className="whitespace-nowrap px-3 py-2">{o.data_agendada || "-"}</td>
                    <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                    <td className="px-3 py-2"><Badge status={o.status} /></td>
                  </tr>
                ))
              )}
            </Tabela>
          </Card>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <KPI label="OS de hoje" valor={indicadores?.os_hoje ?? totalPorStatus("pendente")} cor="text-blue-700" />
            <KPI label="Em andamento" valor={indicadores?.os_em_andamento ?? totalPorStatus("em_andamento")} cor="text-cyan-700" />
            <KPI label="Aguardando atend." valor={indicadores?.os_aguardando_atendimento ?? 0} cor="text-amber-700" />
            <KPI label="Atrasadas" valor={indicadores?.os_atrasadas ?? 0} cor="text-red-700" />
            <KPI label="Aguard. validação" valor={indicadores?.os_aguardando_validacao ?? totalPorStatus("aguardando_validacao")} cor="text-violet-700" />
            <KPI label="Atividades prog." valor={indicadores?.atividades_programadas ?? 0} cor="text-emerald-700" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title={`OS agendadas para ${rotuloData()}`}
              acao={
                <div className="flex items-center gap-1.5">
                  <Botao variante="secundario" className="px-2.5 py-1.5 text-sm" onClick={() => mudarData(-1)}>‹</Botao>
                  <input
                    type="date"
                    value={dataSelecionada}
                    onChange={(e) => e.target.value && setDataSelecionada(e.target.value)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:border-blue-500 focus:outline-none"
                  />
                  <Botao variante="secundario" className="px-2.5 py-1.5 text-sm" onClick={() => mudarData(1)}>›</Botao>
                  <Botao variante="secundario" className="px-2.5 py-1.5 text-sm" onClick={() => setDataSelecionada(hoje)}>Hoje</Botao>
                </div>
              }
            >
              {ordens === null ? (
                <Loading />
              ) : ordensHoje.length === 0 ? (
                <EstadoVazio texto={`Nenhuma OS agendada para ${rotuloData()}.`} />
              ) : (
                <Tabela cabecalhos={["Nº", "Cliente", "Equipe", "Prioridade", "Status"]}>
                  {ordensHoje.slice(0, 6).map((o) => (
                    <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/gestor/os/${o.id}`)}>
                      <td className="px-3 py-2 font-medium text-blue-700">{o.numero}</td>
                      <td className="px-3 py-2">{o.cliente_nome}</td>
                      <td className="px-3 py-2">{o.equipe_nome || "-"}</td>
                      <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                      <td className="px-3 py-2"><Badge status={o.status} /></td>
                    </tr>
                  ))}
                </Tabela>
              )}
            </Card>

            <Card title="Ordens de Serviço recentes" acao={<Botao variante="secundario" onClick={() => router.push("/app/gestor/os")}>Ver todas</Botao>}>
              <Tabela cabecalhos={["Nº", "Cliente", "Serviço", "Data", "Status"]}>
                {ordens === null ? (
                  <tr><td colSpan={99}><Loading /></td></tr>
                ) : ordens.length === 0 ? (
                  <LinhaVazia texto="Nenhuma ordem de serviço encontrada." />
                ) : (
                  ordens.slice(0, 6).map((o) => (
                    <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/gestor/os/${o.id}`)}>
                      <td className="px-3 py-2 font-medium text-blue-700">{o.numero}</td>
                      <td className="px-3 py-2">{o.cliente_nome}</td>
                      <td className="px-3 py-2">{o.servico}</td>
                      <td className="whitespace-nowrap px-3 py-2">{o.data_agendada || "-"}</td>
                      <td className="px-3 py-2"><Badge status={o.status} /></td>
                    </tr>
                  ))
                )}
              </Tabela>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
