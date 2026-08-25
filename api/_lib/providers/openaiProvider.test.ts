import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockOpenAIConstructor } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const mockOpenAIConstructor = vi.fn(function MockOpenAI() {
    return { chat: { completions: { create: mockCreate } } };
  });
  return { mockCreate, mockOpenAIConstructor };
});

vi.mock("openai", () => ({ default: mockOpenAIConstructor }));

import { OpenAIProvider } from "./openaiProvider";
import { AIGenerationError } from "../errors";

function responseWith(content: string) {
  return { choices: [{ message: { content } }] };
}

const LAYOUT = {
  id: "hero_01",
  name: "Hero",
  type: "hero",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

describe("OpenAIProvider", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockOpenAIConstructor.mockClear();
  });

  it("throws when OPENAI_API_KEY is not configured", async () => {
    const provider = new OpenAIProvider({ apiKey: undefined });
    await expect(provider.analyzeContent({ text: "x", objective: "y", audience: "z", style: "w" })).rejects.toThrow(
      "OPENAI_API_KEY is not configured",
    );
  });

  it("analyzeContent returns a parsed ContentAnalysis", async () => {
    mockCreate.mockResolvedValue(
      responseWith(JSON.stringify({ topic: "Segurança", audience: "colaboradores", tone: "corporativo", summary: "x", keyPoints: [], suggestedPurposes: ["introduction"] })),
    );
    const provider = new OpenAIProvider({ apiKey: "fake" });
    const result = await provider.analyzeContent({ text: "x", objective: "y", audience: "z", style: "w" });
    expect(result.topic).toBe("Segurança");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("repairs on a second attempt when the first response is invalid JSON", async () => {
    mockCreate
      .mockResolvedValueOnce(responseWith("not json"))
      .mockResolvedValueOnce(responseWith(JSON.stringify({ topic: "T", audience: "A", tone: "x", summary: "s", keyPoints: [], suggestedPurposes: [] })));
    const provider = new OpenAIProvider({ apiKey: "fake" });
    const result = await provider.analyzeContent({ text: "x", objective: "y", audience: "z", style: "w" });
    expect(result.topic).toBe("T");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("throws AIGenerationError when both attempts fail", async () => {
    mockCreate.mockResolvedValue(responseWith("not json"));
    const provider = new OpenAIProvider({ apiKey: "fake" });
    await expect(provider.analyzeContent({ text: "x", objective: "y", audience: "z", style: "w" })).rejects.toThrow(AIGenerationError);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("planPresentation returns a parsed PresentationPlan", async () => {
    mockCreate.mockResolvedValue(
      responseWith(JSON.stringify({ slideCount: 5, reasoning: "x", sections: [{ order: 0, purpose: "introduction", contentType: "text" }] })),
    );
    const provider = new OpenAIProvider({ apiKey: "fake" });
    const result = await provider.planPresentation({
      contentAnalysis: { topic: "T", audience: "A", tone: "x", summary: "s", keyPoints: [], suggestedPurposes: [] },
      constraints: { minSlides: 3, maxSlides: 10 },
    });
    expect(result.slideCount).toBe(5);
  });

  it("mapContentToSlots sends only the layout's real slot ids and system prompt forbids inventing slotIds", async () => {
    mockCreate.mockResolvedValue(responseWith(JSON.stringify({ slotAssignments: [{ slotId: "title", textValue: "Olá" }] })));
    const provider = new OpenAIProvider({ apiKey: "fake" });
    await provider.mapContentToSlots({
      contentAnalysis: { topic: "T", audience: "A", tone: "x", summary: "s", keyPoints: [], suggestedPurposes: [] },
      section: { order: 0, purpose: "introduction", contentType: "text" },
      layout: LAYOUT as any,
      availableImages: [],
    });
    const call = mockCreate.mock.calls[0][0];
    const systemPrompt = (call.messages[0].content as string).toLowerCase();
    const userContent = JSON.parse(call.messages[1].content as string);
    expect(systemPrompt).toContain("não invente");
    expect(userContent.availableSlotIds).toEqual(["title"]);
  });

  it("planArtDirection returns a parsed DesignDirection", async () => {
    mockCreate.mockResolvedValue(
      responseWith(JSON.stringify({ style: "premium_corporate", density: "low", imageTreatment: "full_bleed", textDensity: "low", accentUsage: "moderate", rationale: "x" })),
    );
    const provider = new OpenAIProvider({ apiKey: "fake" });
    const result = await provider.planArtDirection({
      contentAnalysis: { topic: "T", audience: "A", tone: "x", summary: "s", keyPoints: [], suggestedPurposes: [] },
      presentationPlan: { slideCount: 1, reasoning: "x", sections: [{ order: 0, purpose: "introduction", contentType: "text", estimatedImages: 0, textDensity: "medium" }] },
    });
    expect(result.style).toBe("premium_corporate");
  });

  it("editSlide's system prompt instructs to change only what's necessary", async () => {
    mockCreate.mockResolvedValue(responseWith(JSON.stringify({ summary: "Troquei a imagem", ops: [{ action: "replace_image", slotId: "hero_image" }] })));
    const provider = new OpenAIProvider({ apiKey: "fake" });
    await provider.editSlide({ slide: { order: 0 }, command: "Troque a imagem" });
    const systemPrompt = (mockCreate.mock.calls[0][0].messages[0].content as string).toLowerCase();
    expect(systemPrompt).toContain("só o necessário");
  });
});
