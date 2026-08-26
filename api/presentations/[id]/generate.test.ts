import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FakeFirestore } from "../../_lib/testing/fakeFirestore";

// Rate limit real (Firestore fake) — só a autenticação e a geração em si
// (cara, real IA) são mockadas. Isso prova que o rate limit está
// conectado no caminho real da rota, não só testado isoladamente.
const fakeDb = new FakeFirestore();
vi.mock("../../_lib/firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => new Date() }));

const authedUser = vi.hoisted(() => ({ current: { uid: "user-1", email: null as string | null, admin: false } }));
vi.mock("../../_lib/auth", () => ({ requireAuth: vi.fn(async () => authedUser.current) }));

const generateMock = vi.hoisted(() => vi.fn(async () => ({ presentation: { id: "p1", status: "generated" }, slides: [], qaIssues: [] })));
vi.mock("../../_lib/services/aiOrchestrator", () => ({ generatePresentation: generateMock }));
vi.mock("../../_lib/providers/openaiProvider", () => ({ OpenAIProvider: vi.fn() }));

import handler from "./generate";

function makeRes() {
  const res: any = {};
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: unknown) => { res.body = body; return res; });
  res.setHeader = vi.fn((name: string, value: string) => { res.headers = { ...res.headers, [name]: value }; return res; });
  res.end = vi.fn(() => res);
  return res as VercelResponse & { statusCode?: number; body?: unknown; headers?: Record<string, string> };
}
function makeReq(id: string, uid?: string): VercelRequest {
  return { method: "POST", query: { id }, body: {}, headers: { authorization: "Bearer fake" } } as unknown as VercelRequest;
}

describe("POST /api/presentations/:id/generate — rate limit (P1#2)", () => {
  beforeEach(() => {
    fakeDb.clear();
    generateMock.mockClear();
    authedUser.current = { uid: "user-1", email: null, admin: false };
  });
  afterEach(() => vi.useRealTimers());

  it("6. sem autenticação continua recebendo 401 (rate limit nunca chega a rodar)", async () => {
    const { requireAuth } = await import("../../_lib/auth");
    (requireAuth as any).mockImplementationOnce(async () => {
      const { UnauthorizedAppError } = await import("../../_lib/errors");
      throw new UnauthorizedAppError();
    });
    const res = makeRes();
    await handler(makeReq("pres-1"), res);
    expect(res.statusCode).toBe(401);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("permite até o limite (5) e bloqueia a 6ª chamada do mesmo usuário", async () => {
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      await handler(makeReq("pres-1"), res);
      expect(res.statusCode).toBe(200);
    }
    const blocked = makeRes();
    await handler(makeReq("pres-1"), blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toMatchObject({ error: { code: "rate_limited" } });
    expect(generateMock).toHaveBeenCalledTimes(5); // a 6ª nunca chegou a chamar a geração real
  });

  it("Retry-After presente na resposta 429", async () => {
    for (let i = 0; i < 5; i++) await handler(makeReq("pres-1"), makeRes());
    const blocked = makeRes();
    await handler(makeReq("pres-1"), blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers?.["Retry-After"]).toBeDefined();
    expect(Number(blocked.headers?.["Retry-After"])).toBeGreaterThan(0);
  });

  it("trocar presentationId NÃO reseta o limite — uid é o que conta", async () => {
    for (let i = 0; i < 5; i++) {
      const res = makeRes();
      await handler(makeReq(`pres-${i}`), res); // 5 apresentações diferentes
      expect(res.statusCode).toBe(200);
    }
    const blocked = makeRes();
    await handler(makeReq("pres-outra-ainda"), blocked); // 6ª, id novo de novo
    expect(blocked.statusCode).toBe(429);
  });

  it("4. usuário A não consome o limite do usuário B", async () => {
    for (let i = 0; i < 5; i++) await handler(makeReq("pres-1"), makeRes()); // A esgota o dele

    authedUser.current = { uid: "user-2", email: null, admin: false };
    const res = makeRes();
    await handler(makeReq("pres-1"), res);
    expect(res.statusCode).toBe(200); // B intacto
  });

  it("não confia em um uid enviado pelo corpo da requisição — só o do token verificado", async () => {
    for (let i = 0; i < 5; i++) await handler(makeReq("pres-1"), makeRes());

    const spoofed = makeReq("pres-1");
    (spoofed as any).body = { uid: "outro-usuario-forjado" }; // tenta enganar via body
    const res = makeRes();
    await handler(spoofed, res);
    expect(res.statusCode).toBe(429); // continua limitado pelo uid real do token (user-1), não pelo body
  });
});
