import { getDb, serverTimestamp } from "../firestore";

// Observabilidade (section 31) — nunca registra secrets, só o necessário
// pra depurar uma geração: generation_id (id do doc), presentation_id,
// type, status implícito no fato de ter chegado até aqui sem lançar.
export async function logGeneration(ownerId: string, presentationId: string, type: string, input: unknown, output: unknown): Promise<void> {
  await write("ai_generations", { ownerId, presentationId, type, input, output, createdAt: serverTimestamp() });
}

export async function logError(ownerId: string, presentationId: string, stage: string, error: string): Promise<void> {
  await write("ai_generations", { ownerId, presentationId, type: stage, error, status: "error", createdAt: serverTimestamp() });
}

async function write(collection: string, data: Record<string, unknown>): Promise<void> {
  try {
    await getDb().collection(collection).doc().set(data);
  } catch (err) {
    console.warn(`Failed to write ${collection} audit log`, err);
  }
}
