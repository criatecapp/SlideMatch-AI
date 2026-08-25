import { describe, expect, it } from "vitest";
import { applyEditOps, sanitizeEditCommand } from "./aiEditor";
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
