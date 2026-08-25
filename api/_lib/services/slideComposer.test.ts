import { describe, expect, it } from "vitest";
import { composeSlide, missingRequiredSlots, slideNeedsOverflowSlide } from "./slideComposer";
import { DesignSystemSchema, type Layout } from "../schemas/template";

const DESIGN_SYSTEM = DesignSystemSchema.parse({});

const LAYOUT: Layout = {
  id: "hero_01",
  name: "Hero",
  type: "hero",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale", maxCharacters: 80 },
    { id: "hero_image", kind: "image", role: "image", position: { x: 10, y: 40, w: 80, h: 50 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
    { id: "subtitle", kind: "text", role: "subtitle", position: { x: 10, y: 32, w: 80, h: 10 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

describe("composeSlide", () => {
  it("composes elements for every slot that has a matching assignment or image", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "title", textValue: "Segurança da Informação" }] },
      resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
    });
    expect(slide.elements).toHaveLength(2);
    const title = slide.elements.find((e) => e.slotId === "title")!;
    expect(title.text).toBe("Segurança da Informação");
    expect(title.fontSize).toBe(DESIGN_SYSTEM.typography.scale.title);
    const image = slide.elements.find((e) => e.slotId === "hero_image")!;
    expect(image.imageUrl).toBe("https://x/img.png");
  });

  it("skips an optional slot with no assignment and no image", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "title", textValue: "T" }] },
      resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
    });
    expect(slide.elements.find((e) => e.slotId === "subtitle")).toBeUndefined();
  });

  it("shrinks the font via the Content Fit Engine when text overflows maxCharacters", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "title", textValue: "x".repeat(85) }] },
      resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
    });
    const title = slide.elements.find((e) => e.slotId === "title")!;
    expect(title.fontSize).toBeLessThan(DESIGN_SYSTEM.typography.scale.title);
    expect(title.overflow).toBe(false);
  });
});

describe("slideNeedsOverflowSlide", () => {
  it("is true when any element overflowed", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "title", textValue: "x".repeat(500) }] },
      resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
    });
    expect(slideNeedsOverflowSlide(slide)).toBe(true);
  });

  it("is false when nothing overflowed", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "title", textValue: "curto" }] },
      resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
    });
    expect(slideNeedsOverflowSlide(slide)).toBe(false);
  });
});

describe("missingRequiredSlots", () => {
  it("lists required slots that got no element", () => {
    const slide = composeSlide({
      order: 0,
      purpose: "introduction",
      layout: LAYOUT,
      designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [] },
      resolvedImages: [],
    });
    const missing = missingRequiredSlots(LAYOUT, slide);
    expect(missing.map((s) => s.id).sort()).toEqual(["hero_image", "title"]);
  });
});
