import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

import { getAiSettings, updateAiSettings } from "./settingsService";
import { AIFeatureFlagsSchema, VisualQaSettingsSchema } from "../schemas/settings";

describe("settingsService", () => {
  beforeEach(() => fakeDb.clear());

  it("defaults every feature flag to true and visualQa to 80/2 when nothing is stored", async () => {
    const settings = await getAiSettings();
    expect(settings.features.contentAnalysis).toBe(true);
    expect(settings.visualQa).toEqual({ threshold: 80, maxAttempts: 2 });
    expect(settings.configured).toBe(false);
  });

  it("updateAiSettings persists and returns the updated flags", async () => {
    await updateAiSettings({
      features: { ...AIFeatureFlagsSchema.parse({}), contentAnalysis: false },
      visualQa: VisualQaSettingsSchema.parse({}),
    });
    const settings = await getAiSettings();
    expect(settings.features.contentAnalysis).toBe(false);
  });

  it("configured becomes true once an apiKey is stored", async () => {
    await updateAiSettings({ features: AIFeatureFlagsSchema.parse({}), visualQa: VisualQaSettingsSchema.parse({}), apiKey: "sk-x" });
    expect((await getAiSettings()).configured).toBe(true);
  });
});
