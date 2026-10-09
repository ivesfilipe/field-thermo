"use client";

import { useEffect, useRef, useState } from "react";
import { Campo } from "@/components/ui";

export interface ClienteOpcao {
  id: number;
  nome: string;
  documento?: string | null;
  cidade_principal?: string | null;
  estado_principal?: string | null;
}

function semAcento(v: string | null | undefined) {
  return (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function rotulo(c: ClienteOpcao) {
  return `${c.nome}${c.documento ? ` — ${c.documento}` : ""}${c.cidade_principal ? ` (${c.cidade_principal}${c.estado_principal ? `/${c.estado_principal}` : ""})` : ""}`;
}

const LIMITE_LISTA = 8;

export default function SelecionarCliente({
  clientes,
  value,
  onChange,
  required = false,
  placeholder = "Digite o nome, CNPJ ou cidade..."
}: {
  clientes: ClienteOpcao[];
  value: string;
  onChange: (clienteId: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [aberta, setAberta] = useState(false);
  const [destaque, setDestaque] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selecionado = clientes.find((c) => String(c.id) === value) || null;

  useEffect(() => {
    setTexto(selecionado ? rotulo(selecionado) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, clientes.length]);

  const termo = semAcento(texto).trim();
  const filtrados = (() => {
    if (!termo) return clientes.slice(0, LIMITE_LISTA);
    const termos = termo.split(/\s+/);
    const todos = clientes.filter((c) => {
      const alvo = `${semAcento(c.nome)} ${(c.documento ?? "").replace(/\D/g, "")} ${semAcento(c.cidade_principal)} ${semAcento(c.estado_principal)}`;
      return termos.every((t) => alvo.includes(t));
    });
    return todos.slice(0, LIMITE_LISTA);
  })();
  const totalMatch = (() => {
    if (!termo) return clientes.length;
    const termos = termo.split(/\s+/);
    return clientes.filter((c) => {
      const alvo = `${semAcento(c.nome)} ${(c.documento ?? "").replace(/\D/g, "")} ${semAcento(c.cidade_principal)} ${semAcento(c.estado_principal)}`;
      return termos.every((t) => alvo.includes(t));
    }).length;
  })();

  function escolher(c: ClienteOpcao) {
    onChange(String(c.id));
    setTexto(rotulo(c));
    setAberta(false);
  }

  function digitar(novo: string) {
    setTexto(novo);
    setDestaque(0);
    setAberta(true);
    if (selecionado && novo !== rotulo(selecionado)) {
      onChange("");
    }
  }

  function teclar(e: React.KeyboardEvent) {
    if (!aberta) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setAberta(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestaque((d) => Math.min(d + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestaque((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtrados[destaque]) escolher(filtrados[destaque]);
    } else if (e.key === "Escape") {
      setAberta(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Campo
        label={`Cliente${required ? " *" : ""}`}
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        onFocus={() => setAberta(true)}
        onKeyDown={teclar}
        onBlur={() => setTimeout(() => setAberta(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {selecionado && (
        <button
          type="button"
          onClick={() => { onChange(""); setTexto(""); }}
          title="Limpar cliente selecionado"
          className="absolute right-2 top-[34px] rounded-full bg-zinc-200 px-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-300"
        >
          ×
        </button>
      )}
      {aberta && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
          {filtrados.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-zinc-400">Nenhum cliente encontrado.</p>
          ) : (
            <>
              {filtrados.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); escolher(c); }}
                  onMouseEnter={() => setDestaque(i)}
                  className={`block w-full px-3 py-2 text-left text-sm ${i === destaque ? "bg-blue-700 text-white" : "text-zinc-800 hover:bg-zinc-100"}`}
                >
                  <span className="font-medium">{c.nome}</span>
                  {c.cidade_principal && <span className={`ml-1 text-xs ${i === destaque ? "text-blue-200" : "text-zinc-400"}`}>{c.cidade_principal}{c.estado_principal ? `/${c.estado_principal}` : ""}</span>}
                </button>
              ))}
              {totalMatch > filtrados.length && (
                <p className="border-t border-zinc-100 px-3 py-1.5 text-xs text-zinc-400">
                  Mais {totalMatch - filtrados.length} cliente(s) — refine a busca.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
