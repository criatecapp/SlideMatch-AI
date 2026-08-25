import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

vi.mock("../storage", () => ({
  buildStoragePath: (userId: string, projectId: string, kind: string, filename: string) => `users/${userId}/projects/${projectId}/${kind}/${filename}`,
  uploadBytes: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
  signedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

import { createProject } from "./projectService";
import { createPresentation, commitVersion } from "./presentationService";
import { createTemplate } from "./templateService";
import { uploadMedia } from "./mediaService";
import { editSlideWithCommand } from "./editOrchestrator";
import type { AIProvider } from "../providers/aiProvider";
import type { Slide } from "../schemas/presentation";

const LAYOUT = {
  id: "hero_01", name: "Hero", type: "hero", canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text" as const, role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
    { id: "hero_image", kind: "image" as const, role: "image", position: { x: 0, y: 20, w: 100, h: 80 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
  ],
};

function fakeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    analyzeContent: vi.fn(), analyzeImages: vi.fn(), planPresentation: vi.fn(), mapContentToSlots: vi.fn(), planArtDirection: vi.fn(),
    editSlide: vi.fn(async () => ({ summary: "Troquei a imagem", ops: [{ action: "replace_image" as const, slotId: "hero_image", value: "MEDIA_ID" }] })),
    ...overrides,
  };
}

async function landscapePng(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 10, g: 10, b: 10 } } }).png().toBuffer();
}

describe("editSlideWithCommand", () => {
  beforeEach(() => fakeDb.clear());

  it("applies an AI-proposed replace_image op and creates a new version", async () => {
    const project = await createProject("user-1", { title: "P" } as any);
    const template = await createTemplate(null, { name: "T", active: true, layouts: [LAYOUT] } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A", templateId: template.id } as any);
    const media = await uploadMedia({ ownerId: "user-1", projectId: project.id, filename: "new.png", contentType: "image/png", data: await landscapePng() });

    const slide: Slide = {
      order: 0, layoutId: "hero_01", purpose: "introduction",
      elements: [
        { slotId: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, text: "Título", overflow: false },
        { slotId: "hero_image", kind: "image", role: "image", position: { x: 0, y: 20, w: 100, h: 80 }, imageUrl: "https://old.png", imageMediaId: "old", overflow: false },
      ],
    };
    await commitVersion("user-1", presentation.id, [slide], "ai", "inicial");

    const provider = fakeProvider({
      editSlide: vi.fn(async () => ({ summary: "Troquei a imagem", ops: [{ action: "replace_image" as const, slotId: "hero_image", value: media.id }] })),
    });

    const result = await editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Troque a imagem", provider });

    expect(result.slide.elements.find((e) => e.slotId === "hero_image")!.imageUrl).toContain("signed.example");
    expect(result.slide.elements.find((e) => e.slotId === "title")!.text).toBe("Título"); // não mexeu no título
  });

  it("throws when the presentation has no template yet", async () => {
    const project = await createProject("user-1", { title: "P" } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A" } as any);
    await expect(
      editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "x", provider: fakeProvider() }),
    ).rejects.toThrow("sem template");
  });
});
