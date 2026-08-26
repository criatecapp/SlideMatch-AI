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
import { createPresentation, commitVersion, getCurrentSlides } from "./presentationService";
import { createTemplate } from "./templateService";
import { uploadMedia } from "./mediaService";
import { editSlideWithCommand } from "./editOrchestrator";
import { ValidationAppError } from "../errors";
import type { AIProvider } from "../providers/aiProvider";
import type { Slide } from "../schemas/presentation";

const LAYOUT = {
  id: "hero_01", name: "Hero", type: "hero", canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text" as const, role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
    { id: "hero_image", kind: "image" as const, role: "image", position: { x: 0, y: 20, w: 100, h: 80 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
  ],
};

// Layout com um slot de gráfico (regenerate_content/add_element) e um slot
// protegido contra edição por IA (aiEditable=false) — pra testar o
// fluxo completo (ponta a ponta) de P0#2 e P1#1, sem mexer no LAYOUT acima.
const RICH_LAYOUT = {
  id: "stats_01", name: "Stats", type: "stats", canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text" as const, role: "title", position: { x: 0, y: 0, w: 100, h: 15 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
    { id: "chart_1", kind: "chart" as const, role: "chart", position: { x: 5, y: 20, w: 90, h: 65 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
    { id: "protected_note", kind: "text" as const, role: "caption", position: { x: 0, y: 92, w: 100, h: 8 }, required: false, editable: true, locked: false, aiEditable: false, priority: 1, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const },
  ],
};

function richSlide(): Slide {
  return {
    order: 0, layoutId: "stats_01", purpose: "data",
    elements: [
      { slotId: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 15 }, text: "Resultados", overflow: false },
      { slotId: "protected_note", kind: "text", role: "caption", position: { x: 0, y: 92, w: 100, h: 8 }, text: "Confidencial", overflow: false },
    ],
  };
}

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

  async function setupRich() {
    const project = await createProject("user-1", { title: "P" } as any);
    const template = await createTemplate(null, { name: "T", active: true, layouts: [RICH_LAYOUT] } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A", templateId: template.id } as any);
    await commitVersion("user-1", presentation.id, [richSlide()], "ai", "inicial");
    return { presentation };
  }

  it("regenerate_content: 'transforme esses dados em um gráfico' preenche o slot de gráfico de verdade", async () => {
    const { presentation } = await setupRich();
    const provider = fakeProvider({
      editSlide: vi.fn(async () => ({
        summary: "Adicionei o gráfico",
        ops: [{ action: "regenerate_content" as const, slotId: "chart_1", content: { chartTitle: "Vendas", dataPoints: [{ label: "Q1", value: 10 }, { label: "Q2", value: 20 }] } }],
      })),
    });

    const result = await editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Transforme esses dados em um gráfico", provider });

    const chart = result.slide.elements.find((e) => e.slotId === "chart_1");
    expect(chart?.dataPoints).toHaveLength(2);
    const persisted = await getCurrentSlides("user-1", presentation.id);
    expect(persisted[0].elements.find((e) => e.slotId === "chart_1")?.dataPoints).toHaveLength(2);
  });

  it("add_element: 'crie um card' insere um elemento novo sem sobrepor nada, e persiste", async () => {
    const { presentation } = await setupRich();
    const provider = fakeProvider({
      editSlide: vi.fn(async () => ({
        summary: "Criei um card",
        ops: [{ action: "add_element" as const, newElement: { kind: "text" as const, role: "card", textValue: "87%", position: { x: 10, y: 25, w: 30, h: 25 } } }],
      })),
    });

    const result = await editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Crie um card com 87%", provider });

    expect(result.slide.elements.some((e) => e.role === "card" && e.text === "87%")).toBe(true);
  });

  it("regra fundamental: uma operação sem efeito real (regenerate_content pro tipo errado de slot) NÃO commita e retorna erro explícito", async () => {
    const { presentation } = await setupRich();
    const provider = fakeProvider({
      editSlide: vi.fn(async () => ({
        summary: "ok",
        ops: [{ action: "regenerate_content" as const, slotId: "chart_1", content: { textValue: "isso não é dado de gráfico" } }],
      })),
    });

    await expect(
      editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Transforme em gráfico", provider }),
    ).rejects.toThrow(ValidationAppError);

    const persisted = await getCurrentSlides("user-1", presentation.id);
    expect(persisted[0].elements.find((e) => e.slotId === "chart_1")).toBeUndefined(); // nada foi commitado
  });

  it("aiEditable=false: comando tentando alterar o slot protegido é bloqueado e não commita", async () => {
    const { presentation } = await setupRich();
    const provider = fakeProvider({
      editSlide: vi.fn(async () => ({ summary: "ok", ops: [{ action: "set_text" as const, slotId: "protected_note", value: "Alterado" }] })),
    });

    await expect(
      editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Mude a nota de rodapé", provider }),
    ).rejects.toThrow(/protegid/);

    const persisted = await getCurrentSlides("user-1", presentation.id);
    expect(persisted[0].elements.find((e) => e.slotId === "protected_note")!.text).toBe("Confidencial");
  });

  it("operação inexistente/vazia não gera falso sucesso: IA não propõe nenhuma op válida → erro explícito, sem commit", async () => {
    const { presentation } = await setupRich();
    const provider = fakeProvider({
      // slotId inexistente no layout → sanitizeEditCommand descarta tudo
      editSlide: vi.fn(async () => ({ summary: "fiz algo", ops: [{ action: "set_text" as const, slotId: "slot_que_nao_existe", value: "x" }] })),
    });

    await expect(
      editSlideWithCommand({ ownerId: "user-1", presentationId: presentation.id, slideOrder: 0, command: "Comando incompreensível", provider }),
    ).rejects.toThrow(ValidationAppError);
  });
});
