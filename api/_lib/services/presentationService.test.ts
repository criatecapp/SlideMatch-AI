import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

import { NotFoundAppError } from "../errors";
import {
  autosaveSlides,
  commitVersion,
  createPresentation,
  deletePresentation,
  getCurrentSlides,
  getPresentation,
  listVersions,
  revertToVersion,
} from "./presentationService";
import type { Slide } from "../schemas/presentation";

function slide(text: string): Slide {
  return { order: 0, layoutId: "l1", purpose: "introduction", elements: [{ slotId: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, text, overflow: false }] };
}

describe("presentationService", () => {
  beforeEach(() => fakeDb.clear());

  it("creates a presentation in draft status with an empty export state", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    expect(p.status).toBe("draft");
    expect(p.currentVersion).toBe(0);
    expect(p.exportPaths).toEqual({ pptx: null, pdf: null, png: [] });
  });

  it("commitVersion creates a new version and advances currentVersion + slideCount", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    const updated = await commitVersion("u1", p.id, [slide("Oi")], "ai", "Geração inicial");
    expect(updated.currentVersion).toBe(1);
    expect(updated.slideCount).toBe(1);
  });

  it("getCurrentSlides returns the slides of the current version", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    await commitVersion("u1", p.id, [slide("Oi")], "ai", "Geração inicial");
    const slides = await getCurrentSlides("u1", p.id);
    expect(slides).toHaveLength(1);
    expect(slides[0].elements[0].text).toBe("Oi");
  });

  it("autosaveSlides overwrites the current version without creating a new one", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    await commitVersion("u1", p.id, [slide("Oi")], "ai", "Geração inicial");
    await autosaveSlides("u1", p.id, [slide("Editado")]);
    const slides = await getCurrentSlides("u1", p.id);
    expect(slides[0].elements[0].text).toBe("Editado");
    const versions = await listVersions("u1", p.id);
    expect(versions).toHaveLength(1); // não criou versão nova
  });

  it("revertToVersion creates a new checkpoint with the old content, preserving history", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    await commitVersion("u1", p.id, [slide("V1")], "ai", "v1");
    await commitVersion("u1", p.id, [slide("V2")], "user", "v2");
    const reverted = await revertToVersion("u1", p.id, 1);
    expect(reverted.currentVersion).toBe(3);
    const slides = await getCurrentSlides("u1", p.id);
    expect(slides[0].elements[0].text).toBe("V1");
    const versions = await listVersions("u1", p.id);
    expect(versions).toHaveLength(3);
  });

  it("deletePresentation removes the presentation and its versions", async () => {
    const p = await createPresentation("u1", { projectId: "p1", title: "T" } as any);
    await commitVersion("u1", p.id, [slide("Oi")], "ai", "v1");
    await deletePresentation("u1", p.id);
    await expect(getPresentation("u1", p.id)).rejects.toThrow(NotFoundAppError);
  });
});
