import { getDb } from "../firestore";
import { RateLimitAppError } from "../errors";

const COLLECTION = "rate_limits";

// Tipo solto (não derivado de `typeof RATE_LIMITS[...]`) de propósito —
// `RATE_LIMITS` é `as const` (max vira literal 5/30), e essa função
// precisa aceitar qualquer config numérica, inclusive nos testes.
export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

// P1#2 — janela fixa por usuário+bucket, guardada no Firestore (já é a
// base do sistema, sem infra nova) e protegida por transação (duas
// chamadas concorrentes do MESMO usuário não conseguem burlar o teto —
// section "trocar presentationId não reseta limite": a chave nunca leva
// nenhum dado da requisição além de uid+bucket, só o quê está sendo
// limitado, não em cima de qual recurso).
export async function enforceRateLimit(uid: string, bucket: string, config: RateLimitConfig): Promise<void> {
  const ref = getDb().collection(COLLECTION).doc(`${uid}_${bucket}`);
  const now = Date.now();

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() as { windowStart: number; count: number }) : null;

    if (!data || now - data.windowStart >= config.windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return;
    }

    if (data.count >= config.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((data.windowStart + config.windowMs - now) / 1000));
      throw new RateLimitAppError(retryAfterSeconds);
    }

    tx.set(ref, { windowStart: data.windowStart, count: data.count + 1 }, { merge: true });
  });
}
