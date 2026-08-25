import { describe, expect, it } from "vitest";
import { normalizePlanSections } from "./planNormalizer";
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
});
