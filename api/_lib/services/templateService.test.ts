import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

import { NotFoundAppError } from "../errors";
import { createTemplate, deleteTemplate, getTemplate, listTemplates, updateTemplate } from "./templateService";

describe("templateService", () => {
  beforeEach(() => fakeDb.clear());

  it("creates a template with a default design system", async () => {
    const template = await createTemplate(null, { name: "Corporate Hero" } as any);
    expect(template.designSystem.palette.background).toBe("#FFFFFF");
    expect(template.active).toBe(true);
  });

  it("getTemplate throws NotFoundAppError for an unknown id", async () => {
    await expect(getTemplate("missing")).rejects.toThrow(NotFoundAppError);
  });

  it("listTemplates(true) filters out inactive templates", async () => {
    await createTemplate(null, { name: "A", active: true } as any);
    await createTemplate(null, { name: "B", active: false } as any);
    const active = await listTemplates(true);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("A");
  });

  it("updateTemplate merges layouts", async () => {
    const template = await createTemplate(null, { name: "A" } as any);
    const updated = await updateTemplate(template.id, {
      layouts: [{ id: "l1", name: "Hero", type: "hero", canvas: { width: 1920, height: 1080 }, slots: [] }],
    });
    expect(updated.layouts).toHaveLength(1);
  });

  it("deleteTemplate removes it", async () => {
    const template = await createTemplate(null, { name: "A" } as any);
    await deleteTemplate(template.id);
    await expect(getTemplate(template.id)).rejects.toThrow(NotFoundAppError);
  });
});
