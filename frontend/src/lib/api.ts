import { auth } from "./firebase";

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Ponto único de chamada HTTP — nenhum componente monta fetch/headers por
// conta própria. Nunca guarda a API key da OpenAI (nem nenhuma outra) no
// frontend: a única credencial que sai daqui é o ID token do usuário
// logado, trocado pelo backend a cada request (section 28).
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, "unauthenticated", "Você precisa estar logado.");
  const token = await user.getIdToken();

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? { code: "unknown", message: "Erro desconhecido" };
    throw new ApiError(res.status, err.code, err.message);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
};
