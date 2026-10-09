"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Alerta, Botao, Loading, Modal, Tabela } from "@/components/ui";

interface ItemImportacao {
  linha: number;
  acao: "novo" | "duplicado_arquivo" | "ja_existente" | "erro";
  motivo: string;
  dados: {
    nome: string;
    documento: string | null;
    tipo_documento: string | null;
    email: string | null;
    telefone: string | null;
    endereco: string;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
    responsavel_nome: string | null;
  };
}

interface Preview {
  mapeamento: { coluna: string; campo: string; descricao: string }[];
  colunas_sem_campo: string[];
  itens: ItemImportacao[];
  resumo: { total_linhas: number; novos: number; duplicados_arquivo: number; ja_existentes: number; erros: number };
}

export default function ImportarClientesModal({ onFechar, onImportado }: { onFechar: () => void; onImportado: (msg: string) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [aba, setAba] = useState<"novos" | "erros" | "duplicados" | "existentes" | "mapeamento">("novos");

  useEffect(() => {
    api.post<Preview>("/api/gestor/clientes/importacao/preview")
      .then((r) => setPreview(r))
      .catch((e) => setErro((e as Error).message));
  }, []);

  const confirmar = useCallback(async () => {
    setErro("");
    setConfirmando(true);
    try {
      const r = await api.post<{ importados: number }>("/api/gestor/clientes/importacao/confirmar");
      onImportado(`Importação concluída: ${r.importados} cliente(s) criado(s).`);
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
      setConfirmando(false);
    }
  }, [onFechar, onImportado]);

  const itensPor = (acao: ItemImportacao["acao"]) => preview?.itens.filter((i) => i.acao === acao) ?? [];

  return (
    <Modal titulo="Importar clientes do arquivo oficial" onFechar={onFechar}>
      <div className="grid gap-4">
        <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />

        {!preview && !erro && <Loading texto="Lendo o arquivo e comparando com o cadastro..." />}

        {preview && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div className="rounded-lg border border-zinc-200 p-2 text-center">
                <p className="text-xs text-zinc-500">Linhas</p>
                <p className="text-lg font-bold text-zinc-900">{preview.resumo.total_linhas}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                <p className="text-xs text-zinc-500">Novos</p>
                <p className="text-lg font-bold text-green-700">{preview.resumo.novos}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                <p className="text-xs text-zinc-500">Duplicados no arquivo</p>
                <p className="text-lg font-bold text-amber-700">{preview.resumo.duplicados_arquivo}</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2 text-center">
                <p className="text-xs text-zinc-500">Já existentes</p>
                <p className="text-lg font-bold text-blue-700">{preview.resumo.ja_existentes}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-center">
                <p className="text-xs text-zinc-500">Erros</p>
                <p className="text-lg font-bold text-red-700">{preview.resumo.erros}</p>
              </div>
            </div>

            {preview.colunas_sem_campo.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Colunas do arquivo sem campo correspondente no cadastro (não serão importadas):{" "}
                {preview.colunas_sem_campo.join(", ")}.
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {([["novos", `Novos (${preview.resumo.novos})`], ["erros", `Erros (${preview.resumo.erros})`], ["duplicados", `Duplicados (${preview.resumo.duplicados_arquivo})`], ["existentes", `Já existentes (${preview.resumo.ja_existentes})`], ["mapeamento", "Mapeamento"]] as const).map(([k, rotulo]) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${aba === k ? "bg-blue-700 font-semibold text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-lg border border-zinc-200">
              {aba === "mapeamento" ? (
                <Tabela cabecalhos={["Coluna do arquivo", "Campo do cadastro", "Descrição"]}>
                  {preview.mapeamento.map((m) => (
                    <tr key={m.coluna}>
                      <td className="px-3 py-2 font-medium">{m.coluna}</td>
                      <td className="px-3 py-2 text-blue-700">{m.campo}</td>
                      <td className="px-3 py-2 text-zinc-500">{m.descricao}</td>
                    </tr>
                  ))}
                </Tabela>
              ) : (
                <Tabela cabecalhos={["Linha", "Nome", "Documento", "Local", aba === "novos" ? "" : "Situação"]}>
                  {(aba === "novos" ? itensPor("novo") : aba === "erros" ? itensPor("erro") : aba === "duplicados" ? itensPor("duplicado_arquivo") : itensPor("ja_existente")).slice(0, 300).map((i) => (
                    <tr key={`${i.linha}-${i.acao}`}>
                      <td className="px-3 py-2 text-zinc-400">{i.linha}</td>
                      <td className="max-w-52 truncate px-3 py-2 font-medium">{i.dados.nome || "-"}</td>
                      <td className="px-3 py-2">{i.dados.tipo_documento === "CPF" ? i.dados.documento?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : i.dados.documento?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || "-"}</td>
                      <td className="px-3 py-2 text-zinc-500">{[i.dados.cidade, i.dados.estado].filter(Boolean).join("/") || "-"}</td>
                      {aba !== "novos" && (
                        <td className="px-3 py-2">
                          <span className={`text-xs ${i.acao === "erro" ? "text-red-600" : "text-zinc-500"}`}>{i.motivo}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </Tabela>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                Duplicados mantêm o registro mais completo. Clientes já existentes não são alterados.
              </p>
              <div className="flex gap-2">
                <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
                <Botao onClick={confirmar} disabled={confirmando || preview.resumo.novos === 0}>
                  {confirmando ? "Importando..." : `Importar ${preview.resumo.novos} cliente(s)`}
                </Botao>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
