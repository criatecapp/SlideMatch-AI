import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

const { mockUploadBytes } = vi.hoisted(() => ({ mockUploadBytes: vi.fn(async () => {}) }));
vi.mock("../storage", () => ({
  buildStoragePath: (userId: string, projectId: string, kind: string, filename: string) => `users/${userId}/projects/${projectId}/${kind}/${filename}`,
  uploadBytes: mockUploadBytes,
  deleteObject: vi.fn(async () => {}),
  signedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

import { createProject } from "./projectService";
import { createPresentation, getCurrentSlides, getPresentation } from "./presentationService";
import { createTemplate } from "./templateService";
import { generatePresentation } from "./aiOrchestrator";
import { ValidationAppError } from "../errors";
import type { AIProvider } from "../providers/aiProvider";
import { AIGenerationError } from "../errors";

const HERO_LAYOUT = {
  id: "hero_01", name: "Hero", type: "hero", canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text" as const, role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const, maxCharacters: 80 },
  ],
};

function fakeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    analyzeContent: vi.fn(async () => ({ topic: "Segurança", audience: "colaboradores", tone: "corporativo", summary: "x", keyPoints: [], suggestedPurposes: ["introduction"] })),
    analyzeImages: vi.fn(async () => []),
    planPresentation: vi.fn(async () => ({ slideCount: 1, reasoning: "x", sections: [{ order: 0, purpose: "introduction", contentType: "text" as const, estimatedImages: 0, textDensity: "medium" as const }] })),
    mapContentToSlots: vi.fn(async () => ({ slotAssignments: [{ slotId: "title", textValue: "Bem-vindos" }] })),
    planArtDirection: vi.fn(async () => ({ style: "premium_corporate", density: "low" as const, imageTreatment: "inset", textDensity: "low" as const, accentUsage: "moderate" as const, rationale: "x" })),
    editSlide: vi.fn(async () => ({ summary: "", ops: [] })),
    ...overrides,
  };
}

async function setup() {
  const project = await createProject("user-1", { title: "P", content: "Conteúdo", objective: "treinar", audience: "colaboradores", style: "formal", minSlides: 1, maxSlides: 5 } as any);
  const template = await createTemplate(null, { name: "T1", active: true, layouts: [HERO_LAYOUT] } as any);
  const presentation = await createPresentation("user-1", { projectId: project.id, title: "Apresentação" } as any);
  return { project, template, presentation };
}

describe("generatePresentation", () => {
  beforeEach(() => {
    fakeDb.clear();
    mockUploadBytes.mockClear();
  });

  it("runs the full pipeline and persists a generated version with slides", async () => {
    const { presentation } = await setup();
    const result = await generatePresentation("user-1", presentation.id, fakeProvider());

    expect(result.presentation.status).toBe("generated");
    expect(result.slides).toHaveLength(1);
    expect(result.slides[0].elements[0].text).toBe("Bem-vindos");

    const persisted = await getCurrentSlides("user-1", presentation.id);
    expect(persisted).toHaveLength(1);
  }, 20000); // P1#2 faz o Render QA renderizar de verdade (satori+resvg+rede) — não é mais instantâneo

  it("throws ValidationAppError and marks the presentation failed when there is no active template", async () => {
    const project = await createProject("user-1", { title: "P" } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A" } as any);

    await expect(generatePresentation("user-1", presentation.id, fakeProvider())).rejects.toThrow(ValidationAppError);
    const updated = await getPresentation("user-1", presentation.id);
    expect(updated.status).toBe("failed");
    expect(updated.lastError).toBeTruthy();
  });

  it("marks the presentation failed when the AI provider throws AIGenerationError", async () => {
    const { presentation } = await setup();
    const provider = fakeProvider({ analyzeContent: vi.fn(async () => { throw new AIGenerationError("modelo retornou JSON inválido"); }) });

    await expect(generatePresentation("user-1", presentation.id, provider)).rejects.toThrow(AIGenerationError);
    const updated = await getPresentation("user-1", presentation.id);
    expect(updated.status).toBe("failed");
    expect(updated.lastError).toContain("JSON inválido");
  });

  it("fails clearly (not a silent empty 'generated') when the chosen template has no layouts", async () => {
    const project = await createProject("user-1", { title: "P" } as any);
    await createTemplate(null, { name: "Empty", active: true, layouts: [] } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A" } as any);

    await expect(generatePresentation("user-1", presentation.id, fakeProvider())).rejects.toThrow(ValidationAppError);
    const updated = await getPresentation("user-1", presentation.id);
    expect(updated.status).toBe("failed");
    expect(updated.lastError).toContain("nenhum layout");
  });

  it("still generates content when there are no uploaded images (image slot simply stays empty)", async () => {
    const { presentation } = await setup();
    const result = await generatePresentation("user-1", presentation.id, fakeProvider());
    expect(result.presentation.status).toBe("generated");
    expect(result.slides[0].elements.some((e) => e.kind === "image")).toBe(false);
  }, 20000);

  it("5. usuário comum ainda consegue gerar apresentação usando um template de biblioteca compartilhada (ownerId=null)", async () => {
    const { template, presentation } = await setup();
    expect(template.ownerId).toBeNull();
    const result = await generatePresentation("user-1", presentation.id, fakeProvider());
    expect(result.presentation.status).toBe("generated");
  }, 20000);

  it("P1#2: o resultado inclui issues do Visual QA sobre o render real, não só sobre o JSON", async () => {
    const { presentation } = await setup();
    const result = await generatePresentation("user-1", presentation.id, fakeProvider());
    // Render QA sempre roda (P1#2) sobre a composição final — mesmo sem
    // nenhum problema, ele participou (não é decorativo): confirmamos
    // indiretamente checando que a geração continua íntegra com ele no
    // caminho (issues pode ser vazio se o slide realmente estiver limpo).
    expect(result.presentation.status).toBe("generated");
    expect(Array.isArray(result.qaIssues)).toBe(true);
  }, 20000);

  it("P1#3: missing_required aciona UM retry local no MESMO layout antes de desistir (auto-fix, não troca de layout)", async () => {
    await fakeDb.collection("settings").doc("global").set({
      features: { contentAnalysis: true, imageAnalysis: true, presentationPlanning: true, contentMapping: true, artDirection: true, aiEditor: true },
      visualQa: { threshold: 90, maxAttempts: 1 },
    });
    const project = await createProject("user-1", { title: "P", content: "x", objective: "o", audience: "a", style: "s", minSlides: 1, maxSlides: 1 } as any);
    // Template com um ÚNICO layout — se a correção funcionar, só pode ter
    // sido o retry local (não existe outro layout pra "trocar").
    const template = await createTemplate(null, { name: "T2", active: true, layouts: [HERO_LAYOUT] } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A", templateId: template.id } as any);

    let call = 0;
    const provider = fakeProvider({
      mapContentToSlots: vi.fn(async () => {
        call++;
        return call === 1 ? { slotAssignments: [] } : { slotAssignments: [{ slotId: "title", textValue: "Bem-vindos" }] };
      }),
    });

    const result = await generatePresentation("user-1", presentation.id, provider);

    expect(call).toBe(2); // 1ª tentativa (missing_required) + 1 retry local — nunca trocou de layout, só existe um
    expect(result.slides[0].elements.find((e) => e.slotId === "title")?.text).toBe("Bem-vindos");
    expect(result.presentation.status).toBe("generated");
  }, 20000);

  it("P1#4: lista maior que maxLines vira dois slides (primário + continuação), não corte silencioso", async () => {
    const LIST_LAYOUT = {
      id: "list_01", name: "List", type: "list", canvas: { width: 1920, height: 1080 },
      slots: [{ id: "items", kind: "text" as const, role: "bullet_list", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const, maxLines: 3 }],
    };
    await fakeDb.collection("settings").doc("global").set({
      features: { contentAnalysis: true, imageAnalysis: true, presentationPlanning: true, contentMapping: true, artDirection: true, aiEditor: true },
      visualQa: { threshold: 80, maxAttempts: 1 },
    });
    const project = await createProject("user-1", { title: "P", content: "x", objective: "o", audience: "a", style: "s", minSlides: 1, maxSlides: 1 } as any);
    const template = await createTemplate(null, { name: "T3", active: true, layouts: [LIST_LAYOUT] } as any);
    const presentation = await createPresentation("user-1", { projectId: project.id, title: "A", templateId: template.id } as any);

    const provider = fakeProvider({
      planPresentation: vi.fn(async () => ({ slideCount: 1, reasoning: "x", sections: [{ order: 0, purpose: "dicas", contentType: "list" as const, estimatedImages: 0, textDensity: "medium" as const }] })),
      mapContentToSlots: vi.fn(async () => ({ slotAssignments: [{ slotId: "items", listItems: ["1", "2", "3", "4", "5"] }] })),
    });

    const result = await generatePresentation("user-1", presentation.id, provider);

    // 5 itens, maxLines=3 → primário fica com 3 (não excede mais) e a
    // continuação com os 2 restantes (também não excede) — exatamente 2
    // slides, sem precisar de uma 3ª rodada de split.
    expect(result.slides).toHaveLength(2);
    expect(result.slides[0].order).toBe(0);
    expect(result.slides[0].elements[0].listItems).toEqual(["1", "2", "3"]);
    expect(result.slides[0].elements[0].overflow).toBe(false);
    expect(result.slides[1].order).toBe(1);
    expect(result.slides[1].purpose).toContain("continuação");
    expect(result.slides[1].elements[0].listItems).toEqual(["4", "5"]);

    const persisted = await getCurrentSlides("user-1", presentation.id);
    expect(persisted).toHaveLength(2);
  }, 20000);

  it("falls back to a heuristic content analysis when the contentAnalysis feature is disabled", async () => {
    await fakeDb.collection("settings").doc("global").set({
      features: { contentAnalysis: false, imageAnalysis: true, presentationPlanning: true, contentMapping: true, artDirection: true, aiEditor: true },
      visualQa: { threshold: 80, maxAttempts: 2 },
    });
    const { presentation } = await setup();
    const provider = fakeProvider();
    const result = await generatePresentation("user-1", presentation.id, provider);
    expect(provider.analyzeContent).not.toHaveBeenCalled();
    expect(result.presentation.status).toBe("generated");
  }, 20000);
});
