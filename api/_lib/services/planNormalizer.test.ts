import { describe, expect, it } from "vitest";
import { normalizePlanSections } from "./planNormalizer";
import { MAX_SLIDES } from "../limits";
import type { PresentationPlan } from "../schemas/ai";

function section(order: number, purpose: string) {
  return { order, purpose, contentType: "text" as const, estimatedImages: 0, textDensity: "medium" as const };
}

describe("normalizePlanSections", () => {
  it("reassigns order to a contiguous 0-based sequence, preserving relative order", () => {
    const plan: PresentationPlan = { slideCount: 3, reasoning: "x", sections: [section(1, "intro"), section(2, "risks"), section(3, "conclusion")] };
    const result = normalizePlanSections(plan);
    expect(result.sections.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(result.sections.map((s) => s.purpose)).toEqual(["intro", "risks", "conclusion"]);
  });

  it("sorts out-of-order sections before reindexing", () => {
    const plan: PresentationPlan = { slideCount: 3, reasoning: "x", sections: [section(5, "last"), section(1, "first"), section(3, "middle")] };
    const result = normalizePlanSections(plan);
    expect(result.sections.map((s) => s.purpose)).toEqual(["first", "middle", "last"]);
    expect(result.sections.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("already-0-based contiguous input stays unchanged in content", () => {
    const plan: PresentationPlan = { slideCount: 2, reasoning: "x", sections: [section(0, "a"), section(1, "b")] };
    const result = normalizePlanSections(plan);
    expect(result.sections.map((s) => s.order)).toEqual([0, 1]);
  });

  it("does not mutate the input plan", () => {
    const plan: PresentationPlan = { slideCount: 1, reasoning: "x", sections: [section(7, "only")] };
    normalizePlanSections(plan);
    expect(plan.sections[0].order).toBe(7);
  });

  // P1#1 — este é o ÚNICO ponto por onde todo plano passa antes de virar
  // trabalho real (seções → chamadas OpenAI → render). Trunca aqui pega
  // qualquer origem: resposta da IA, fallback heurístico, futuro caminho
  // que ninguém pensou ainda.
  it(`trunca pra MAX_SLIDES (${MAX_SLIDES}) mesmo se o plano vier com mais seções`, () => {
    const many = Array.from({ length: MAX_SLIDES + 20 }, (_, i) => section(i, `s${i}`));
    const plan: PresentationPlan = { slideCount: many.length, reasoning: "x", sections: many };
    const result = normalizePlanSections(plan);
    expect(result.sections).toHaveLength(MAX_SLIDES);
    expect(result.sections.map((s) => s.order)).toEqual(Array.from({ length: MAX_SLIDES }, (_, i) => i));
  });

  it("não trunca quando o plano já está dentro do limite", () => {
    const plan: PresentationPlan = { slideCount: 5, reasoning: "x", sections: Array.from({ length: 5 }, (_, i) => section(i, `s${i}`)) };
    const result = normalizePlanSections(plan);
    expect(result.sections).toHaveLength(5);
  });
});
