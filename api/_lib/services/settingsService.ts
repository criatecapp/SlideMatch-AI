import { getDb, serverTimestamp } from "../firestore";
import { AIFeatureFlagsSchema, VisualQaSettingsSchema } from "../schemas/settings";
import type { AISettings, AISettingsUpdate } from "../schemas/settings";

const COLLECTION = "settings";
const DOC_ID = "global";

export async function getAiSettings(): Promise<AISettings> {
  const snapshot = await getDb().collection(COLLECTION).doc(DOC_ID).get();
  const data = snapshot.exists ? snapshot.data()! : {};
  return {
    provider: "openai",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    configured: Boolean(data.openaiApiKey || process.env.OPENAI_API_KEY),
    features: AIFeatureFlagsSchema.parse(data.features ?? {}),
    visualQa: VisualQaSettingsSchema.parse(data.visualQa ?? {}),
  };
}

export async function updateAiSettings(payload: AISettingsUpdate): Promise<AISettings> {
  const update: Record<string, unknown> = {
    features: payload.features,
    visualQa: payload.visualQa,
    updatedAt: serverTimestamp(),
  };
  if (payload.apiKey) update.openaiApiKey = payload.apiKey;
  await getDb().collection(COLLECTION).doc(DOC_ID).set(update, { merge: true });
  return getAiSettings();
}
