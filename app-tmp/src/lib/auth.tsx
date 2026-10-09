"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken, type Perfil } from "@/lib/api";

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  equipe_id: number | null;
}

interface AuthContextType {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>(null as never);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(() => !!getToken());
  const router = useRouter();

  useEffect(() => {
    if (!getToken()) {
      setCarregando(false);
      return;
    }
    api
      .get<{ usuario: Usuario }>("/api/auth/me")
      .then((r) => setUsuario(r.usuario))
      .catch(() => setToken(null))
      .finally(() => setCarregando(false));
  }, []);

  const login = useCallback(async (email: string, senha: string) => {
    const r = await api.post<{ token: string; usuario: Usuario }>("/api/auth/login", { email, senha });
    setToken(r.token);
    setUsuario(r.usuario);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUsuario(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ usuario, carregando, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
