"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Badge, Botao, Campo, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Tabela } from "@/components/ui";

interface AgendaItem {
  id: number;
  numero: string;
  servico: string;
  prioridade: string;
  data_agendada: string;
  status: string;
  cliente_nome: string;
  local_nome: string | null;
  local_endereco: string | null;
  local_endereco_completo?: string | null;
  equipe_nome: string | null;
}

export default function AgendaPage() {
  const router = useRouter();
  const hoje = new Date().toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(hoje);
  const [fim, setFim] = useState("");
  const [agenda, setAgenda] = useState<AgendaItem[] | null>(null);

  const carregar = useCallback(() => {
    const params = new URLSearchParams();
    if (inicio) params.set("data_inicio", inicio);
    if (fim) params.set("data_fim", fim);
    api.get<{ agenda: AgendaItem[] }>(`/api/gestor/agenda?${params.toString()}`).then((r) => setAgenda(r.agenda)).catch(() => setAgenda([]));
  }, [inicio, fim]);

  useEffect(carregar, [carregar]);

  return (
    <div className="space-y-4">
      <PageHeader titulo="Agenda" descricao="Agendamentos de ordens de serviço por período" />
      <Card title="Período">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Campo label="De" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          <Campo label="Até" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          <Botao onClick={carregar}>Filtrar</Botao>
        </div>
        <Tabela cabecalhos={["Data", "OS", "Cliente", "Local", "Serviço", "Equipe", "Prioridade", "Status"]}>
          {agenda === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : agenda.length === 0 ? (
            <LinhaVazia texto="Nenhum agendamento no período." />
          ) : (
            agenda.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-zinc-50" onClick={() => router.push(`/app/gestor/os/${a.id}`)}>
                <td className="px-3 py-2">{a.data_agendada}</td>
                <td className="px-3 py-2 font-medium text-blue-600">{a.numero}</td>
                <td className="px-3 py-2">{a.cliente_nome}</td>
                <td className="px-3 py-2">
                  {a.local_nome || "-"}
                  {a.local_endereco_completo || a.local_endereco && (
                    <span className="block text-xs text-zinc-500">
                      {a.local_endereco_completo || a.local_endereco}
                      <LinksMapa endereco={a.local_endereco_completo || a.local_endereco} />
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{a.servico}</td>
                <td className="px-3 py-2">{a.equipe_nome || "-"}</td>
                <td className="px-3 py-2"><Prioridade p={a.prioridade} /></td>
                <td className="px-3 py-2"><Badge status={a.status} /></td>
              </tr>
            ))
          )}
        </Tabela>
      </Card>
    </div>
  );
}
