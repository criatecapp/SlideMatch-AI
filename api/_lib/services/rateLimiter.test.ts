import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => new Date() }));

import { enforceRateLimit } from "./rateLimiter";
import { RateLimitAppError } from "../errors";

const CONFIG = { max: 3, windowMs: 60_000 };

describe("enforceRateLimit (P1#2)", () => {
  beforeEach(() => {
    fakeDb.clear();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("1. primeira chamada → permitida", async () => {
    await expect(enforceRateLimit("user-a", "generate", CONFIG)).resolves.toBeUndefined();
  });

  it("2. chamadas dentro do limite → permitidas", async () => {
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await expect(enforceRateLimit("user-a", "generate", CONFIG)).resolves.toBeUndefined(); // 3ª, ainda == max
  });

  it("3. chamada acima do limite → 429 (RateLimitAppError)", async () => {
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    const err = await enforceRateLimit("user-a", "generate", CONFIG).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitAppError);
    expect(err.status).toBe(429);
  });

  it("4. usuário A não consome o limite do usuário B", async () => {
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG); // A no teto
    await expect(enforceRateLimit("user-b", "generate", CONFIG)).resolves.toBeUndefined(); // B intacto
  });

  it("5. trocar o 'recurso' (bucket continua sendo o mesmo endpoint) não reseta o limite — a chave é só uid+bucket, nunca inclui id de recurso", async () => {
    // enforceRateLimit nunca recebe presentationId — é chamado só com
    // (uid, bucket, config); não existe parâmetro pra "resetar" passando
    // outro id. Confirma isso batendo o mesmo bucket 3x e vendo que barra
    // na 4ª independente de qualquer contexto externo variar.
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await expect(enforceRateLimit("user-a", "generate", CONFIG)).rejects.toThrow(RateLimitAppError);
  });

  it("7. inclui retryAfterSeconds coerente com o tempo restante da janela", async () => {
    await enforceRateLimit("user-a", "edit", CONFIG);
    await enforceRateLimit("user-a", "edit", CONFIG);
    await enforceRateLimit("user-a", "edit", CONFIG);
    vi.advanceTimersByTime(10_000); // 10s dentro da janela de 60s
    const err = await enforceRateLimit("user-a", "edit", CONFIG).catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitAppError);
    expect(err.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.retryAfterSeconds).toBeLessThanOrEqual(50); // ~50s restantes da janela de 60s
  });

  it("janela expira e reseta a contagem", async () => {
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    vi.advanceTimersByTime(CONFIG.windowMs + 1000); // passou da janela
    await expect(enforceRateLimit("user-a", "generate", CONFIG)).resolves.toBeUndefined();
  });

  it("buckets diferentes (generate vs edit) do mesmo usuário não compartilham contagem", async () => {
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG);
    await enforceRateLimit("user-a", "generate", CONFIG); // generate no teto
    await expect(enforceRateLimit("user-a", "edit", CONFIG)).resolves.toBeUndefined(); // edit intacto
  });
});
