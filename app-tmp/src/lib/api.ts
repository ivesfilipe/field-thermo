"use client";

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl !== "http://localhost:3001" && envUrl !== "http://127.0.0.1:3001") {
    return envUrl;
  }
  if (typeof window !== "undefined") {
    // Quando executado no navegador fora de localhost puro (ex: produção, IP local, domínio real):
    // Usamos string vazia para requisições relativas ("/api/..."), de modo que o próprio
    // servidor Next.js faça o proxy transparente via rewrites para a API local (porta 3001).
    // Isso elimina erros de conexão com localhost:3001 na máquina do cliente, Mixed Content e CORS.
    if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      return "";
    }
    return "http://localhost:3001";
  }
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001";
}

export const API_URL = typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
  ? ""
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");

export function buildApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("field_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("field_token", token);
  else localStorage.removeItem("field_token");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const exigeCorpo = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : exigeCorpo ? "{}" : undefined
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function uploadRequest<T>(path: string, field: string, file: File): Promise<T> {
  const token = getToken();
  const fd = new FormData();
  fd.append(field, file);
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function uploadFormRequest<T>(path: string, fd: FormData): Promise<T> {
  const token = getToken();
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error || `Erro ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, field: string, file: File) => uploadRequest<T>(path, field, file),
  uploadForm: <T>(path: string, fd: FormData) => uploadFormRequest<T>(path, fd)
};

export function mediaUrl(rel: string): string {
  if (!rel) return "";
  if (rel.startsWith("http://") || rel.startsWith("https://") || rel.startsWith("data:")) return rel;
  return buildApiUrl(rel);
}

export function wazeUrl(endereco: string): string {
  return `https://www.waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`;
}

export const PERFIS = {
  admin: "Administrador",
  gestor: "Gestor",
  tecnico: "Técnico",
  comercial: "Comercial"
} as const;

export type Perfil = keyof typeof PERFIS;
