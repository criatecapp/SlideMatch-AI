import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FakeFirestore } from "../../_lib/testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../../_lib/firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => new Date() }));

const authedUser = vi.hoisted(() => ({ current: { uid: "user-1", email: null as string | null, admin: false } }));
vi.mock("../../_lib/auth", () => ({ requireAuth: vi.fn(async () => authedUser.current) }));

const editMock = vi.hoisted(() => vi.fn(async () => ({ slide: { order: 0, layoutId: "l1", purpose: "x", elements: [] }, summary: "ok" })));
vi.mock("../../_lib/services/editOrchestrator", () => ({ editSlideWithCommand: editMock }));
vi.mock("../../_lib/providers/openaiProvider", () => ({ OpenAIProvider: vi.fn() }));

import handler from "./edit";

function makeRes() {
  const res: any = {};
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  res.setHeader = vi.fn((name: string, value: string) => { res.headers = { ...res.headers, [name]: value }; return res; });
  res.end = vi.fn(() => res);
  return res as VercelResponse & { statusCode?: number; body?: unknown; headers?: Record<string, string> };
}
function makeReq(id: string, command = "Resuma este texto"): VercelRequest {
  return { method: "POST", query: { id }, body: { slideOrder: 0, command }, headers: { authorization: "Bearer fake" } } as unknown as VercelRequest;
}

describe("POST /api/presentations/:id/edit — rate limit (P1#2) + limite de comando (P1#3)", () => {
  beforeEach(() => {
    fakeDb.clear();
    editMock.mockClear();
    authedUser.current = { uid: "user-1", email: null, admin: false };
  });

  it("6. sem autenticação continua recebendo 401", async () => {
    const { requireAuth } = await import("../../_lib/auth");
    (requireAuth as any).mockImplementationOnce(async () => {
      const { UnauthorizedAppError } = await import("../../_lib/errors");
      throw new UnauthorizedAppError();
    });
    const res = makeRes();
    await handler(makeReq("pres-1"), res);
    expect(res.statusCode).toBe(401);
    expect(editMock).not.toHaveBeenCalled();
  });

  it("permite até o limite (30) e bloqueia a 31ª chamada", async () => {
    for (let i = 0; i < 30; i++) {
      const res = makeRes();
      await handler(makeReq("pres-1"), res);
      expect(res.statusCode).toBe(200);
    }
    const blocked = makeRes();
    await handler(makeReq("pres-1"), blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBeDefined();
    expect(editMock).toHaveBeenCalledTimes(30);
  });

  it("4. usuário A não consome o limite do usuário B", async () => {
    for (let i = 0; i < 30; i++) await handler(makeReq("pres-1"), makeRes());
    authedUser.current = { uid: "user-2", email: null, admin: false };
    const res = makeRes();
    await handler(makeReq("pres-1"), res);
    expect(res.statusCode).toBe(200);
  });

  it("P1#3: comando acima do limite (5.000 chars) é rejeitado ANTES de chamar a IA", async () => {
    const res = makeRes();
    await handler(makeReq("pres-1", "a".repeat(5001)), res);
    expect(res.statusCode).toBe(400);
    expect(editMock).not.toHaveBeenCalled();
  });

  it("comando dentro do limite passa normalmente", async () => {
    const res = makeRes();
    await handler(makeReq("pres-1", "a".repeat(5000)), res);
    expect(res.statusCode).toBe(200);
    expect(editMock).toHaveBeenCalledTimes(1);
  });
});
