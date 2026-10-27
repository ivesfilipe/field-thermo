"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { Botao, Campo, Alerta } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    try {
      await login(email, senha);
      router.push("/app");
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : "Erro ao conectar com a API. Verifique se o servidor está rodando.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-green-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Image src="/logo.png" alt="Logo MedicalThermo Herzog" width={224} height={59} priority className="h-auto w-56 max-w-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">Thermo control</h1>
          <p className="mt-1 text-sm text-green-100/80">Gestão de serviços técnicos</p>
        </div>
        <Alerta tipo="erro" msg={erro} onClose={() => setErro("")} />
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Campo label="Email" labelClasse="text-white" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          <Campo label="Senha" labelClasse="text-white" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••" />
          <Botao tipo="submit" disabled={carregando} className="w-full py-2.5">
            {carregando ? "Entrando..." : "Entrar"}
          </Botao>
        </form>
        <p className="mt-6 text-center text-xs text-green-200/70">
          Admin / Gestor / Técnico / Comercial
          <br />
          Use os usuários criados pelo <code className="rounded bg-white/10 px-1 text-white">npm run seed</code>
        </p>
      </div>
    </div>
  );
}
