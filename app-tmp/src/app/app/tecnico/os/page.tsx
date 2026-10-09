"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Alerta, Badge, Botao, Card, LinksMapa, LinhaVazia, Loading, PageHeader, Prioridade, Tabela } from "@/components/ui";

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
  equipamento_nome: string | null;
}

export default function MinhasOsPage() {
  const router = useRouter();
  const [ordens, setOrdens] = useState<OS[] | null>(null);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [iniciando, setIniciando] = useState<number | null>(null);

  const hoje = new Date().toISOString().slice(0, 10);

  const carregar = useCallback(() => {
    api.get<{ ordens: OS[] }>(`/api/tecnico/os?data=${hoje}`).then((r) => setOrdens(r.ordens)).catch(() => setOrdens([]));
  }, [hoje]);

  useEffect(carregar, [carregar]);

  async function iniciar(o: OS) {
    setErro("");
    setMsg("");
    setIniciando(o.id);
    try {
      await api.post(`/api/tecnico/os/${o.id}/iniciar`);
      setMsg(`Atendimento ${o.numero} iniciado.`);
      carregar();
      router.push(`/app/tecnico/os/${o.id}`);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setIniciando(null);
    }
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
      <Alerta tipo="sucesso" msg={msg} onClose={() => setMsg("")} />

      <PageHeader titulo="Minhas Ordens de Serviço" descricao={`Ordens de serviço de hoje (${hoje})`} />

      <Card title={`Ordens de hoje (${ordens?.length ?? "..."})`}>
        <Tabela cabecalhos={["Nº", "Cliente", "Local", "Equipamento", "Serviço", "Data", "Prioridade", "Status", "Ações"]}>
          {ordens === null ? (
            <tr><td colSpan={99}><Loading /></td></tr>
          ) : ordens.length === 0 ? (
            <LinhaVazia texto="Nenhuma OS atribuída a você." />
          ) : (
            ordens.map((o) => {
              const podeIniciar = ["pendente", "em_andamento"].includes(o.status);
              return (
                <tr key={o.id} className="cursor-pointer transition-colors hover:bg-blue-50/50" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>
                  <td className="px-3 py-2 font-medium text-blue-700">
                    {o.numero}
                    {["urgente", "alta"].includes(o.prioridade) && (
                      <span className="ml-1 font-bold text-red-600" title="Atender com prioridade">*</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{o.cliente_nome}</td>
                  <td className="px-3 py-2">
                    {o.local_nome || "-"}
                    {o.local_endereco_completo || o.local_endereco && (
                      <span className="block text-xs text-zinc-500">
                        {o.local_endereco_completo || o.local_endereco}
                        <LinksMapa endereco={o.local_endereco_completo || o.local_endereco} pararPropagacao />
                      </span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 lg:table-cell">{o.equipamento_nome || "-"}</td>
                  <td className="px-3 py-2">{o.servico}</td>
                  <td className="whitespace-nowrap px-3 py-2">{o.data_agendada || "-"}</td>
                  <td className="px-3 py-2"><Prioridade p={o.prioridade} /></td>
                  <td className="px-3 py-2"><Badge status={o.status} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {podeIniciar ? (
                      <Botao
                        variante="sucesso"
                        disabled={iniciando === o.id}
                        onClick={() => iniciar(o)}
                      >
                        {iniciando === o.id ? "..." : o.status === "em_andamento" ? "Continuar" : "Iniciar"}
                      </Botao>
                    ) : (
                      <Botao variante="secundario" onClick={() => router.push(`/app/tecnico/os/${o.id}`)}>Abrir</Botao>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </Tabela>
        {ordens !== null && ordens.length > 0 && (
          <p className="mt-3 text-xs text-zinc-500">
            <span className="font-bold text-red-600">*</span> = atender com prioridade (urgente/alta)
          </p>
        )}
      </Card>
    </div>
  );
}