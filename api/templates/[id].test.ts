import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// P0 #1 — templates de biblioteca (ownerId === null) só podem ser
// alterados/apagados por admin; templates privados só pelo próprio dono;
// leitura (GET) continua aberta a qualquer usuário autenticado, e o uso do
// template pra gerar apresentação não passa por essa rota, então não é
// afetado por esta checagem.

const authedUser = vi.hoisted(() => ({ current: { uid: "user-1", email: null as string | null, admin: false } }));
vi.mock("../_lib/auth", () => ({ requireAuth: vi.fn(async () => authedUser.current) }));

const templateStore = vi.hoisted(() => new Map<string, any>());
vi.mock("../_lib/services/templateService", () => ({
  getTemplate: vi.fn(async (id: string) => {
    const t = templateStore.get(id);
    if (!t) {
      const { NotFoundAppError } = await import("../_lib/errors");
      throw new NotFoundAppError("Template não encontrado");
    }
    return t;
  }),
  updateTemplate: vi.fn(async (id: string, payload: any) => {
    const merged = { ...templateStore.get(id), ...payload };
    templateStore.set(id, merged);
    return merged;
  }),
  deleteTemplate: vi.fn(async (id: string) => {
    templateStore.delete(id);
  }),
}));

import handler from "./[id]";

function makeRes() {
  const res: Partial<VercelResponse> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as VercelResponse;
  });
  res.json = vi.fn((body: unknown) => {
    res.body = body;
    return res as VercelResponse;
  });
  res.end = vi.fn(() => res as VercelResponse);
  return res as VercelResponse & { statusCode?: number; body?: unknown };
}

function makeReq(method: string, id: string, body?: unknown): VercelRequest {
  return { method, query: { id }, body, headers: { authorization: "Bearer fake" } } as unknown as VercelRequest;
}

describe("PATCH/DELETE /api/templates/:id — autorização", () => {
  beforeEach(() => {
    templateStore.clear();
    authedUser.current = { uid: "user-1", email: null, admin: false };
    templateStore.set("shared-1", { id: "shared-1", ownerId: null, name: "Biblioteca" });
    templateStore.set("private-1", { id: "private-1", ownerId: "user-1", name: "Meu template" });
    templateStore.set("other-1", { id: "other-1", ownerId: "user-2", name: "Template de outro" });
  });

  it("1. usuário comum tenta PATCH em template compartilhado (ownerId=null) → 403", async () => {
    const res = makeRes();
    await handler(makeReq("PATCH", "shared-1", { name: "Hackeado" }), res);
    expect(res.statusCode).toBe(403);
    expect(templateStore.get("shared-1").name).toBe("Biblioteca");
  });

  it("2. usuário comum tenta DELETE em template compartilhado (ownerId=null) → 403", async () => {
    const res = makeRes();
    await handler(makeReq("DELETE", "shared-1"), res);
    expect(res.statusCode).toBe(403);
    expect(templateStore.has("shared-1")).toBe(true);
  });

  it("3. admin autorizado consegue PATCH em template compartilhado", async () => {
    authedUser.current = { uid: "admin-1", email: null, admin: true };
    const res = makeRes();
    await handler(makeReq("PATCH", "shared-1", { name: "Atualizado pelo admin" }), res);
    expect(res.statusCode).toBe(200);
    expect(templateStore.get("shared-1").name).toBe("Atualizado pelo admin");
  });

  it("4. admin autorizado consegue DELETE em template compartilhado", async () => {
    authedUser.current = { uid: "admin-1", email: null, admin: true };
    const res = makeRes();
    await handler(makeReq("DELETE", "shared-1"), res);
    expect(res.statusCode).toBe(204);
    expect(templateStore.has("shared-1")).toBe(false);
  });

  it("6. usuário autenticado continua conseguindo LER (GET) template compartilhado", async () => {
    const res = makeRes();
    await handler(makeReq("GET", "shared-1"), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).id).toBe("shared-1");
  });

  it("template privado: dono consegue editar o próprio", async () => {
    const res = makeRes();
    await handler(makeReq("PATCH", "private-1", { name: "Renomeado" }), res);
    expect(res.statusCode).toBe(200);
    expect(templateStore.get("private-1").name).toBe("Renomeado");
  });

  it("template privado: outro usuário (não-dono, não-admin) → 403, comportamento preservado", async () => {
    const res = makeRes();
    await handler(makeReq("PATCH", "other-1", { name: "Roubado" }), res);
    expect(res.statusCode).toBe(403);
    expect(templateStore.get("other-1").name).toBe("Template de outro");
  });

  it("template privado: dono consegue apagar o próprio", async () => {
    const res = makeRes();
    await handler(makeReq("DELETE", "private-1"), res);
    expect(res.statusCode).toBe(204);
    expect(templateStore.has("private-1")).toBe(false);
  });
});
