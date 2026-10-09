"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, Botao, Campo, Card, LinhaVazia, Loading, PageHeader, Select, Tabela } from "@/components/ui";

interface Relatorio {
  id: number;
  os_numero: string;
  cliente_id: number;
  cliente_nome: string;
  os_servico: string;
  os_prioridade: string;
  data_validacao: string | null;
  recomendacoes: string | null;
  necessidade_adicional: string | null;
  tipo_necessidade_label: string | null;
  oportunidade_id: number | null;
  oportunidade_status: string | null;
}

interface Cliente { id: number; nome: string }

const TIPOS_OPORTUNIDADE = [
  { v: "nova_manutencao", l: "Nova manutenção" },
  { v: "substituicao_equipamento", l: "Substituição de equipamento" },
  { v: "fornecimento_peca", l: "Fornecimento de peça" },
  { v: "instalacao", l: "Instalação" },
  { v: "adequacao", l: "Adequação" },
  { v: "outro_servico", l: "Outro serviço" }
];

const STATUS_COMERCIAL = [
  { v: "novo", l: "Novo relatório" },
  { v: "em_analise", l: "Em análise" },
  { v: "necessita_contato", l: "Necessita contato" },
  { v: "necessita_informacao", l: "Necessita informação adicional" },
  { v: "proposta_elaboracao", l: "Proposta em elaboração" },
  { v: "proposta_enviada", l: "Proposta enviada" },
  { v: "em_negociacao", l: "Em negociação" },
  { v: "aprovado", l: "Aprovado" },
  { v: "perdido", l: "Perdido" },
  { v: "sem_oportunidade", l: "Sem oportunidade" }
];

export default function RelatoriosPage() {
  const router = useRouter();
  const [relatorios, setRelatorios] = useState<Relatorio[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState({ cliente_id: "", data_inicio: "", data_fim: "", tipo: "", prioridade: "", status: "" });

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (filtro.cliente_id) params.set("cliente_id", filtro.cliente_id);
    if (filtro.data_inicio) params.set("data_inicio", filtro.data_inicio);
    if (filtro.data_fim) params.set("data_fim", filtro.data_fim);
    if (filtro.tipo) params.set("tipo", filtro.tipo);
    if (filtro.prioridade) params.set("prioridade", filtro.prioridade);
    if (filtro.status) params.set("status", filtro.status);
    const qs = params.toString();
    api.get<{ relatorios: Relatorio[]; clientes: Cliente[] }>(`/api/comercial/relatorios${qs ? `?${qs}` : ""}`)
      .then((r) => {
        setRelatorios(r.relatorios);
        setClientes(r.clientes);
      })
      .catch(() => setRelatorios([]));
  }, [filtro]);

  useEffect(carregar, [carregar]);

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Relatórios Técnicos Recebidos"
        descricao="Relatórios validados pelo gestor e disponibilizados para o comercial"
        acoes={<Botao onClick={() => router.push("/app/comercial/oportunidades")}>Ver oportunidades</Botao>}
      />

      <Card title="Filtros">
        <div className="grid gap-2 md:grid-cols-6">
          <Select label="Cliente" value={filtro.cliente_id} onChange={(e) => setFiltro({ ...filtro, cliente_id: e.target.value })}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
          <Select label="Tipo de oportunidade" value={filtro.tipo} onChange={(e) => setFiltro({ ...filtro, tipo: e.target.value })}>
            <option value="">Todos</option>
            {TIPOS_OPORTUNIDADE.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </Select>
          <Select label="Prioridade" value={filtro.prioridade} onChange={(e) => setFiltro({ ...filtro, prioridade: e.target.value })}>
            <option value="">Todas</option>
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </Select>
          <Select label="Status comercial" value={filtro.status} onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}>
            <option value="">Todos</option>
            {STATUS_COMERCIAL.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Select>
          <Campo label="Período (de)" type="date" value={filtro.data_inicio} onChange={(e) => setFiltro({ ...filtro, data_inicio: e.target.value })} />
          <Campo label="Período (até)" type="date" value={filtro.data_fim} onChange={(e) => setFiltro({ ...filtro, data_fim: e.target.value })} />
        </div>
      </Card>

      <Card title={`Relatórios (${relatorios?.length ?? "..."})`}>
        <Tabela cabecalhos={["OS", "Cliente", "Serviço", "Tipo de oportunidade", "Prioridade", "Status comercial", "Validado em"]}>
          {relatorios === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : relatorios.length === 0 ? (
            <LinhaVazia texto="Nenhum relatório recebido com os filtros atuais." />
          ) : (
            relatorios.map((r) => (
              <tr key={r.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/comercial/relatorios/${r.id}`)}>
                <td className="px-3 py-2 font-medium text-blue-700">{r.os_numero}</td>
                <td className="px-3 py-2">{r.cliente_nome}</td>
                <td className="px-3 py-2">{r.os_servico}</td>
                <td className="hidden px-3 py-2 md:table-cell">{r.tipo_necessidade_label || "-"}</td>
                <td className="px-3 py-2 capitalize">{r.os_prioridade}</td>
                <td className="px-3 py-2">{r.oportunidade_status ? <Badge status={r.oportunidade_status} /> : "-"}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.data_validacao?.slice(0, 10) || "-"}</td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>
    </div>
  );
}