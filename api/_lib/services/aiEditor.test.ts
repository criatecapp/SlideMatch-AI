import { describe, expect, it } from "vitest";
import { applyEditOps, applyEditOpsWithReport, sanitizeEditCommand } from "./aiEditor";
import type { Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

const LAYOUT: Layout = {
  id: "l1",
  name: "L1",
  type: "hero",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
    { id: "hero_image", kind: "image", role: "image", position: { x: 0, y: 20, w: 100, h: 80 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

// Layout com um slot de gráfico vazio (regenerate_content) e um slot
// protegido contra edição por IA (P1#1) — separado do LAYOUT acima pra não
// mexer nos testes já existentes.
const RICH_LAYOUT: Layout = {
  id: "l2",
  name: "L2",
  type: "stats",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 15 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
    { id: "chart_1", kind: "chart", role: "chart", position: { x: 5, y: 20, w: 90, h: 70 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
    { id: "protected_note", kind: "text", role: "caption", position: { x: 0, y: 92, w: 100, h: 8 }, required: false, editable: true, locked: false, aiEditable: false, priority: 1, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

function richSlide(): Slide {
  return {
    order: 0,
    layoutId: "l2",
    purpose: "data",
    elements: [
      { slotId: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 15 }, text: "Resultados", overflow: false },
      { slotId: "protected_note", kind: "text", role: "caption", position: { x: 0, y: 92, w: 100, h: 8 }, text: "Confidencial — não editar", overflow: false },
    ],
  };
}

function baseSlide(): Slide {
  return {
    order: 0,
    layoutId: "l1",
    purpose: "introduction",
    elements: [
      { slotId: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, text: "Original", fontSize: 44, overflow: false },
      { slotId: "hero_image", kind: "image", role: "image", position: { x: 0, y: 20, w: 100, h: 80 }, imageUrl: "https://old.png", imageMediaId: "old", overflow: false },
    ],
  };
}

describe("sanitizeEditCommand", () => {
  it("drops ops referencing a slotId that doesn't exist in the layout", () => {
    const result = sanitizeEditCommand({ summary: "x", ops: [{ action: "set_text", slotId: "invented", value: "x" }] }, LAYOUT);
    expect(result.ops).toEqual([]);
  });

  it("keeps ops with no slotId (whole-presentation ops) and ops with a real slotId", () => {
    const result = sanitizeEditCommand({ summary: "x", ops: [{ action: "set_text", slotId: "title", value: "x" }] }, LAYOUT);
    expect(result.ops).toHaveLength(1);
  });
});

describe("applyEditOps", () => {
  it("set_text changes only the target slot's text, leaving the image untouched", () => {
    const result = applyEditOps({ slide: baseSlide(), layout: LAYOUT, ops: [{ action: "set_text", slotId: "title", value: "Novo título" }] });
    expect(result.elements.find((e) => e.slotId === "title")!.text).toBe("Novo título");
    expect(result.elements.find((e) => e.slotId === "hero_image")!.imageUrl).toBe("https://old.png");
  });

  it("replace_image changes only the target slot's image, leaving the title untouched", () => {
    const result = applyEditOps({
      slide: baseSlide(),
      layout: LAYOUT,
      ops: [{ action: "replace_image", slotId: "hero_image" }],
      resolvedImages: { hero_image: { url: "https://new.png", mediaId: "new" } },
    });
    expect(result.elements.find((e) => e.slotId === "hero_image")!.imageUrl).toBe("https://new.png");
    expect(result.elements.find((e) => e.slotId === "title")!.text).toBe("Original");
  });

  it("remove_element drops the element entirely", () => {
    const result = applyEditOps({ slide: baseSlide(), layout: LAYOUT, ops: [{ action: "remove_element", slotId: "hero_image" }] });
    expect(result.elements.find((e) => e.slotId === "hero_image")).toBeUndefined();
    expect(result.elements).toHaveLength(1);
  });

  it("adjust_style 'larger' increases font size within a sane bound", () => {
    const result = applyEditOps({ slide: baseSlide(), layout: LAYOUT, ops: [{ action: "adjust_style", slotId: "title", value: "larger" }] });
    expect(result.elements.find((e) => e.slotId === "title")!.fontSize).toBeGreaterThan(44);
  });

  it("does nothing when replace_image has no resolved image for the slot", () => {
    const result = applyEditOps({ slide: baseSlide(), layout: LAYOUT, ops: [{ action: "replace_image", slotId: "hero_image" }] });
    expect(result.elements.find((e) => e.slotId === "hero_image")!.imageUrl).toBe("https://old.png");
  });
});

// P0#2 — regenerate_content e add_element deixam de ser no-op silencioso.
describe("regenerate_content", () => {
  it("preenche um slot de gráfico vazio com dataPoints reais e marca a operação como aplicada", () => {
    const { slide, outcomes } = applyEditOpsWithReport({
      slide: richSlide(),
      layout: RICH_LAYOUT,
      ops: [{ action: "regenerate_content", slotId: "chart_1", content: { chartTitle: "Vendas", dataPoints: [{ label: "Q1", value: 10 }, { label: "Q2", value: 18 }] } }],
    });
    const chart = slide.elements.find((e) => e.slotId === "chart_1");
    expect(chart?.dataPoints).toHaveLength(2);
    expect(chart?.chartTitle).toBe("Vendas");
    expect(outcomes[0].applied).toBe(true);
  });

  it("não aplica e reporta motivo quando o conteúdo não bate com o tipo do slot (texto pedido pra slot de gráfico)", () => {
    const { slide, outcomes } = applyEditOpsWithReport({
      slide: richSlide(),
      layout: RICH_LAYOUT,
      ops: [{ action: "regenerate_content", slotId: "chart_1", content: { textValue: "isso não é um gráfico" } }],
    });
    expect(slide.elements.find((e) => e.slotId === "chart_1")).toBeUndefined();
    expect(outcomes[0].applied).toBe(false);
    expect(outcomes[0].reason).toContain("chart_1");
  });
});

describe("add_element", () => {
  it("insere um novo elemento numa posição livre, sem sobrepor os existentes", () => {
    const { slide, outcomes } = applyEditOpsWithReport({
      slide: richSlide(),
      layout: RICH_LAYOUT,
      ops: [{ action: "add_element", newElement: { kind: "text", role: "card", textValue: "Card novo", position: { x: 5, y: 20, w: 25, h: 20 } } }],
    });
    expect(outcomes[0].applied).toBe(true);
    const added = slide.elements.find((e) => e.role === "card");
    expect(added?.text).toBe("Card novo");
  });

  it("rejeita (sem commit) quando não há espaço válido pra encaixar o elemento sem sobrepor nada", () => {
    const fullSlide: Slide = {
      order: 0, layoutId: "l2", purpose: "data",
      elements: Array.from({ length: 12 }, (_, row) => ({
        slotId: `filler_${row}`, kind: "text" as const, role: "filler", overflow: false,
        position: { x: 5 + (row % 4) * (90 / 4), y: 5 + Math.floor(row / 4) * (90 / 3), w: 28, h: 30 },
        text: "x",
      })),
    };
    const { slide, outcomes } = applyEditOpsWithReport({
      slide: fullSlide,
      layout: RICH_LAYOUT,
      ops: [{ action: "add_element", newElement: { kind: "text", role: "card", textValue: "Sem espaço" } }],
    });
    expect(outcomes[0].applied).toBe(false);
    expect(slide.elements).toHaveLength(12);
  });

  it("rejeita add_element sem nenhum conteúdo (nada pra mostrar)", () => {
    const { outcomes } = applyEditOpsWithReport({
      slide: richSlide(),
      layout: RICH_LAYOUT,
      ops: [{ action: "add_element", newElement: { kind: "text", role: "card" } }],
    });
    expect(outcomes[0].applied).toBe(false);
  });
});

// P1#1 — aiEditable=false bloqueia QUALQUER ação da IA sobre aquele slot
// (distinto de `locked`, que não é tocado por este gate).
describe("aiEditable", () => {
  it("aiEditable=true (padrão dos slots normais) → a IA consegue editar", () => {
    const { outcomes } = applyEditOpsWithReport({ slide: baseSlide(), layout: LAYOUT, ops: [{ action: "set_text", slotId: "title", value: "Novo" }] });
    expect(outcomes[0].applied).toBe(true);
  });

  it("set_text num slot protegido (aiEditable=false) é bloqueado", () => {
    const { slide, outcomes } = applyEditOpsWithReport({
      slide: richSlide(), layout: RICH_LAYOUT, ops: [{ action: "set_text", slotId: "protected_note", value: "Alterado pela IA" }],
    });
    expect(outcomes[0].applied).toBe(false);
    expect(outcomes[0].reason).toContain("protegido");
    expect(slide.elements.find((e) => e.slotId === "protected_note")!.text).toBe("Confidencial — não editar");
  });

  it("replace_image num slot protegido é bloqueado", () => {
    const { outcomes } = applyEditOpsWithReport({
      slide: richSlide(), layout: RICH_LAYOUT, ops: [{ action: "replace_image", slotId: "protected_note" }],
      resolvedImages: { protected_note: { url: "https://x.png", mediaId: "x" } },
    });
    expect(outcomes[0].applied).toBe(false);
    expect(outcomes[0].reason).toContain("protegido");
  });

  it("regenerate_content num slot protegido é bloqueado", () => {
    const { outcomes } = applyEditOpsWithReport({
      slide: richSlide(), layout: RICH_LAYOUT,
      ops: [{ action: "regenerate_content", slotId: "protected_note", content: { textValue: "Novo texto" } }],
    });
    expect(outcomes[0].applied).toBe(false);
    expect(outcomes[0].reason).toContain("protegido");
  });
});

// Regra fundamental (P0#2) — nenhuma operação pode reportar sucesso sem
// efeito real verificável.
describe("verificação de efeito real", () => {
  it("remove_element num slot que já não existe no slide é reportado como não aplicado, não como sucesso", () => {
    const { outcomes } = applyEditOpsWithReport({ slide: richSlide(), layout: RICH_LAYOUT, ops: [{ action: "remove_element", slotId: "chart_1" }] });
    expect(outcomes[0].applied).toBe(false);
  });

  it("adjust_style num slot sem fontSize é reportado como não aplicado", () => {
    const { outcomes } = applyEditOpsWithReport({
      slide: richSlide(), layout: RICH_LAYOUT, ops: [{ action: "adjust_style", slotId: "chart_1", value: "larger" }],
    });
    expect(outcomes[0].applied).toBe(false);
  });
});
