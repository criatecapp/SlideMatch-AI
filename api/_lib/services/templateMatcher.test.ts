import { describe, expect, it } from "vitest";
import { matchLayout, rankLayouts } from "./templateMatcher";
import type { Layout } from "../schemas/template";
import type { PlanSection } from "../schemas/ai";

function layout(id: string, type: string, slots: Layout["slots"]): Layout {
  return { id, name: id, type, canvas: { width: 1920, height: 1080 }, slots };
}

const TEXT_SLOT = { id: "body", kind: "text" as const, role: "body", position: { x: 10, y: 10, w: 80, h: 60 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const, maxCharacters: 500 };
const IMAGE_SLOT = { id: "hero", kind: "image" as const, role: "image", position: { x: 10, y: 10, w: 80, h: 60 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const };
const STAT_SLOT = { id: "stat1", kind: "text" as const, role: "statistic", position: { x: 10, y: 10, w: 30, h: 30 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font" as const, responsiveBehavior: "scale" as const };

const TEXT_ONLY = layout("text_only", "text", [TEXT_SLOT]);
const TEXT_IMAGE = layout("text_image", "text_image", [TEXT_SLOT, IMAGE_SLOT]);
const STATS = layout("stats", "stats", [STAT_SLOT, STAT_SLOT]);

function section(overrides: Partial<PlanSection> = {}): PlanSection {
  return { order: 0, purpose: "introduction", contentType: "text", estimatedImages: 0, textDensity: "medium", ...overrides };
}

describe("matchLayout", () => {
  it("returns null when there are no layouts", () => {
    expect(matchLayout(section(), [], 0)).toBeNull();
  });

  it("prefers a layout with an image slot when the section expects an image", () => {
    const match = matchLayout(section({ contentType: "image", estimatedImages: 1 }), [TEXT_ONLY, TEXT_IMAGE], 1);
    expect(match?.layout.id).toBe("text_image");
  });

  it("prefers a text-only layout when the section has no images", () => {
    const match = matchLayout(section({ contentType: "text", estimatedImages: 0 }), [TEXT_ONLY, TEXT_IMAGE], 0);
    expect(match?.layout.id).toBe("text_only");
  });

  it("prefers a stats layout for data content", () => {
    const match = matchLayout(section({ contentType: "data" }), [TEXT_ONLY, STATS], 0);
    expect(match?.layout.id).toBe("stats");
  });

  it("penalizes an image layout when no images are available", () => {
    const ranked = rankLayouts(section({ contentType: "image", estimatedImages: 1 }), [TEXT_IMAGE], 0);
    expect(ranked[0].reasoning).toContain("nenhuma está disponível");
  });

  it("prefers a leaner layout when the Art Director asks for low density", () => {
    const heavy = layout("heavy", "mixed", [TEXT_SLOT, STAT_SLOT, STAT_SLOT, IMAGE_SLOT]);
    const lean = layout("lean", "mixed", [TEXT_SLOT]);
    const direction = { style: "x", density: "low" as const, imageTreatment: "inset", textDensity: "low" as const, accentUsage: "subtle" as const, rationale: "x" };
    const ranked = rankLayouts(section(), [heavy, lean], 1, direction);
    expect(ranked[0].layout.id).toBe("lean");
  });

  it("rankLayouts returns every layout sorted by score descending", () => {
    const ranked = rankLayouts(section(), [TEXT_ONLY, TEXT_IMAGE, STATS], 0);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
    expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
  });
});
