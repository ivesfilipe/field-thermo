"use client";

const COR_BOLINHA: Record<string, string> = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  red: "bg-red-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  indigo: "bg-indigo-500",
  zinc: "bg-zinc-400"
};

export function Card({ title, children, acao }: { title: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        {acao}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const BOTAO_ESTILOS: Record<string, string> = {
  primario: "bg-blue-700 text-white shadow-sm hover:bg-blue-800",
  secundario: "border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50",
  perigo: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  sucesso: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
};

export function Botao({
  children,
  onClick,
  tipo = "button",
  variante = "primario",
  disabled,
  className = ""
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tipo?: "button" | "submit";
  variante?: "primario" | "secundario" | "perigo" | "sucesso";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BOTAO_ESTILOS[variante]} ${className}`}
    >
      {children}
    </button>
  );
}

const INPUT_CLASSE =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none";

export function Campo({ label, labelClasse = "text-zinc-700", ...props }: { label: string; labelClasse?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className={`font-medium ${labelClasse}`}>{label}</span>
      <input {...props} className={INPUT_CLASSE} />
    </label>
  );
}

export function Select({ label, children, ...props }: { label: string; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <select {...props} className={INPUT_CLASSE}>
        {children}
      </select>
    </label>
  );
}

export function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-700">{label}</span>
      <textarea {...props} className={INPUT_CLASSE} />
    </label>
  );
}

const STATUS_ESTILO: Record<string, { cor: string; bolinha: string }> = {
  pendente: { cor: "bg-amber-50 text-amber-800 border-amber-200", bolinha: "amber" },
  em_andamento: { cor: "bg-blue-50 text-blue-800 border-blue-200", bolinha: "blue" },
  aguardando_validacao: { cor: "bg-violet-50 text-violet-800 border-violet-200", bolinha: "violet" },
  concluida: { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", bolinha: "emerald" },
  cancelada: { cor: "bg-zinc-100 text-zinc-600 border-zinc-200", bolinha: "zinc" },
  excluida: { cor: "bg-red-50 text-red-800 border-red-200", bolinha: "red" },
  atrasada: { cor: "bg-red-50 text-red-800 border-red-200", bolinha: "red" },
  reaberta: { cor: "bg-orange-50 text-orange-800 border-orange-200", bolinha: "orange" },
  confirmada: { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", bolinha: "emerald" },
  agendada: { cor: "bg-sky-50 text-sky-800 border-sky-200", bolinha: "sky" },
  aprovado: { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", bolinha: "emerald" },
  reprovado: { cor: "bg-red-50 text-red-800 border-red-200", bolinha: "red" },
  aberta: { cor: "bg-sky-50 text-sky-800 border-sky-200", bolinha: "sky" },
  ganha: { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", bolinha: "emerald" },
  perdida: { cor: "bg-zinc-100 text-zinc-600 border-zinc-200", bolinha: "zinc" },
  perdido: { cor: "bg-zinc-100 text-zinc-600 border-zinc-200", bolinha: "zinc" },
  ativo: { cor: "bg-emerald-50 text-emerald-800 border-emerald-200", bolinha: "emerald" },
  inativo: { cor: "bg-red-50 text-red-800 border-red-200", bolinha: "red" },
  novo: { cor: "bg-sky-50 text-sky-800 border-sky-200", bolinha: "sky" },
  em_analise: { cor: "bg-blue-50 text-blue-800 border-blue-200", bolinha: "blue" },
  necessita_contato: { cor: "bg-amber-50 text-amber-800 border-amber-200", bolinha: "amber" },
  necessita_informacao: { cor: "bg-orange-50 text-orange-800 border-orange-200", bolinha: "orange" },
  proposta_elaboracao: { cor: "bg-violet-50 text-violet-800 border-violet-200", bolinha: "violet" },
  proposta_enviada: { cor: "bg-indigo-50 text-indigo-800 border-indigo-200", bolinha: "indigo" },
  em_negociacao: { cor: "bg-blue-50 text-blue-800 border-blue-200", bolinha: "blue" },
  sem_oportunidade: { cor: "bg-zinc-100 text-zinc-600 border-zinc-200", bolinha: "zinc" }
};

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  aguardando_validacao: "Aguardando validação",
  concluida: "Concluída",
  cancelada: "Cancelada",
  excluida: "Excluída",
  atrasada: "Atrasada",
  reaberta: "Reaberta",
  confirmada: "Confirmada",
  agendada: "Agendada",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aberta: "Aberta",
  em_andamento_op: "Em andamento",
  ganha: "Ganha",
  perdida: "Perdida",
  perdido: "Perdido",
  ativo: "Ativo",
  inativo: "Inativo",
  novo: "Novo relatório",
  em_analise: "Em análise",
  necessita_contato: "Necessita contato",
  necessita_informacao: "Necessita informação adicional",
  proposta_elaboracao: "Proposta em elaboração",
  proposta_enviada: "Proposta enviada",
  em_negociacao: "Em negociação",
  sem_oportunidade: "Sem oportunidade"
};

export function Badge({ status }: { status: string }) {
  const e = STATUS_ESTILO[status] || { cor: "bg-zinc-100 text-zinc-700 border-zinc-200", bolinha: "zinc" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${e.cor}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${COR_BOLINHA[e.bolinha]}`} />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function Prioridade({ p }: { p: string }) {
  const cores: Record<string, { texto: string; bolinha: string }> = {
    baixa: { texto: "bg-zinc-100 text-zinc-600 border-zinc-200", bolinha: "zinc" },
    media: { texto: "bg-blue-50 text-blue-800 border-blue-200", bolinha: "blue" },
    alta: { texto: "bg-orange-50 text-orange-800 border-orange-200", bolinha: "orange" },
    urgente: { texto: "bg-red-50 text-red-800 border-red-200", bolinha: "red" }
  };
  const e = cores[p] || cores.baixa;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${e.texto}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${COR_BOLINHA[e.bolinha]}`} />
      {p}
    </span>
  );
}

export function Alerta({ tipo, msg, onClose }: { tipo: "erro" | "sucesso"; msg: string; onClose?: () => void }) {
  if (!msg) return null;
  const cor = tipo === "erro" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className={`mb-4 flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-sm shadow-sm ${cor}`}>
      <span>{msg}</span>
      {onClose && (
        <button onClick={onClose} className="ml-3 font-bold opacity-60 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}

export function Erro({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

export function Tabela({ cabecalhos, children }: { cabecalhos: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-125 text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
            {cabecalhos.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}

export function LinhaVazia({ texto }: { texto: string }) {
  return (
    <tr>
      <td colSpan={99} className="px-3 py-10 text-center text-sm text-zinc-400">
        {texto}
      </td>
    </tr>
  );
}

export function Loading({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-700" />
      {texto}
    </div>
  );
}

export function EstadoVazio({ texto }: { texto: string }) {
  return <p className="py-10 text-center text-sm text-zinc-400">{texto}</p>;
}

export function PageHeader({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-white md:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-blue-200">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

export function KPI({ label, valor, cor = "text-blue-700", icone }: { label: string; valor: number | string; cor?: string; icone?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {icone && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100">{icone}</div>}
      <div className="min-w-0">
        <p className={`truncate text-2xl font-bold leading-tight ${cor}`}>{valor}</p>
        <p className="truncate text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

export function LinksMapa({ endereco, espaco = true, pararPropagacao = false }: { endereco: string; espaco?: boolean; pararPropagacao?: boolean }) {
  const onClick = pararPropagacao ? (e: React.MouseEvent) => e.stopPropagation() : undefined;
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${espaco ? "ml-2" : ""}`}>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="font-medium text-blue-600 underline hover:text-blue-800"
      >
        Google Maps
      </a>
      <a
        href={`https://www.waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className="font-medium text-blue-600 underline hover:text-blue-800"
      >
        Waze
      </a>
    </span>
  );
}

export function Modal({ titulo, onFechar, children, largura = "max-w-lg" }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-start sm:p-6 sm:pt-16" onClick={onFechar}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-2xl sm:rounded-xl ${largura}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white px-5 py-3.5">
          <h3 className="text-base font-semibold text-zinc-900">{titulo}</h3>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}