import { describe, expect, it } from "vitest";
import { runVisualQa } from "./visualQa";
import { DesignSystemSchema, type Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

const DESIGN_SYSTEM = DesignSystemSchema.parse({ palette: { background: "#FFFFFF", ink: "#14181F" } });

const LAYOUT: Layout = {
  id: "l1",
  name: "L1",
  type: "hero",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
    { id: "subtitle", kind: "text", role: "subtitle", position: { x: 10, y: 30, w: 80, h: 10 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

function slide(elements: Slide["elements"]): Slide {
  return { order: 0, layoutId: "l1", purpose: "introduction", elements };
}

describe("runVisualQa", () => {
  it("scores 100 with no issues for a clean slide", () => {
    const result = runVisualQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Título", fontSize: 44, overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.score).toBe(100);
    expect(result.issues).toEqual([]);
  });

  it("flags text_cut when an element overflowed", () => {
    const result = runVisualQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "x…", fontSize: 12, overflow: true }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "text_cut")).toBe(true);
  });

  it("flags out_of_canvas when a position overflows the slide", () => {
    const result = runVisualQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 80, y: 10, w: 50, h: 20 }, text: "T", fontSize: 44, overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "out_of_canvas")).toBe(true);
  });

  it("flags overlap between two elements whose boxes intersect", () => {
    const result = runVisualQa(
      slide([
        { slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 50, h: 30 }, text: "T", fontSize: 44, overflow: false },
        { slotId: "subtitle", kind: "text", role: "subtitle", position: { x: 30, y: 20, w: 50, h: 30 }, text: "S", fontSize: 24, overflow: false },
      ]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "overlap")).toBe(true);
  });

  it("flags low_contrast when ink and background are too close", () => {
    const lowContrastDesign = DesignSystemSchema.parse({ palette: { background: "#FFFFFF", ink: "#EEEEEE" } });
    const result = runVisualQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "T", fontSize: 18, overflow: false }]),
      LAYOUT,
      lowContrastDesign,
    );
    expect(result.issues.some((i) => i.code === "low_contrast")).toBe(true);
  });

  it("flags missing_required when a required slot has no element", () => {
    const result = runVisualQa(slide([]), LAYOUT, DESIGN_SYSTEM);
    expect(result.issues.some((i) => i.code === "missing_required" && i.slotId === "title")).toBe(true);
    expect(result.score).toBeLessThan(100);
  });
});
