import { describe, expect, it } from "vitest";
import { composeSlide, missingRequiredSlots, slideNeedsOverflowSlide, splitOverflowSlide } from "./slideComposer";
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

describe("composeSlide — chart/table", () => {
  const CHART_LAYOUT: Layout = {
    id: "chart_01", name: "Chart", type: "chart", canvas: { width: 1920, height: 1080 },
    slots: [{ id: "chart1", kind: "chart", role: "chart", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" }],
  };
  const TABLE_LAYOUT: Layout = {
    id: "table_01", name: "Table", type: "table", canvas: { width: 1920, height: 1080 },
    slots: [{ id: "table1", kind: "table", role: "table", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" }],
  };

  it("composes a chart element when dataPoints are assigned", () => {
    const slide = composeSlide({
      order: 0, purpose: "data", layout: CHART_LAYOUT, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "chart1", chartTitle: "Incidentes por mês", dataPoints: [{ label: "Jan", value: 12 }, { label: "Fev", value: 8 }] }] },
    });
    expect(slide.elements).toHaveLength(1);
    expect(slide.elements[0].dataPoints).toEqual([{ label: "Jan", value: 12 }, { label: "Fev", value: 8 }]);
    expect(slide.elements[0].chartTitle).toBe("Incidentes por mês");
  });

  it("skips a chart slot when dataPoints is empty or missing", () => {
    const slide = composeSlide({ order: 0, purpose: "data", layout: CHART_LAYOUT, designSystem: DESIGN_SYSTEM, contentMap: { slotAssignments: [{ slotId: "chart1" }] } });
    expect(slide.elements).toHaveLength(0);
  });

  it("composes a table element when tableRows are assigned", () => {
    const slide = composeSlide({
      order: 0, purpose: "data", layout: TABLE_LAYOUT, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "table1", tableRows: [["Risco", "Probabilidade"], ["Phishing", "Alta"]] }] },
    });
    expect(slide.elements[0].tableRows).toEqual([["Risco", "Probabilidade"], ["Phishing", "Alta"]]);
  });
});

// P1#4 — lista/tabela grande demais pro slot passam a sinalizar overflow
// (antes, elas nunca sinalizavam, então slideNeedsOverflowSlide nunca via
// esse caso).
describe("composeSlide — overflow de lista/tabela", () => {
  const LIST_LAYOUT: Layout = {
    id: "list_01", name: "List", type: "list", canvas: { width: 1920, height: 1080 },
    slots: [{ id: "items", kind: "text", role: "bullet_list", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale", maxLines: 5 }],
  };
  const TABLE_LAYOUT_MAXLINES: Layout = {
    id: "table_02", name: "Table", type: "table", canvas: { width: 1920, height: 1080 },
    slots: [{ id: "table1", kind: "table", role: "table", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale", maxLines: 3 }],
  };
  const TABLE_LAYOUT_NO_MAXLINES: Layout = {
    id: "table_03", name: "Table", type: "table", canvas: { width: 1920, height: 1080 },
    slots: [{ id: "table1", kind: "table", role: "table", position: { x: 10, y: 20, w: 80, h: 60 }, required: false, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" }],
  };

  it("marks a list as overflow when it has more items than the slot's maxLines", () => {
    const slide = composeSlide({
      order: 0, purpose: "list", layout: LIST_LAYOUT, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "items", listItems: ["a", "b", "c", "d", "e", "f", "g"] }] },
    });
    expect(slide.elements[0].overflow).toBe(true);
  });

  it("does not mark a list as overflow when it fits within maxLines", () => {
    const slide = composeSlide({
      order: 0, purpose: "list", layout: LIST_LAYOUT, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "items", listItems: ["a", "b"] }] },
    });
    expect(slide.elements[0].overflow).toBe(false);
  });

  it("marks a table as overflow when it has more data rows than the slot's maxLines (header excluded)", () => {
    const slide = composeSlide({
      order: 0, purpose: "data", layout: TABLE_LAYOUT_MAXLINES, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "table1", tableRows: [["H1", "H2"], ["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"]] }] },
    });
    expect(slide.elements[0].overflow).toBe(true);
  });

  it("does not mark a table without maxLines as overflow, regardless of size (preserves old behavior)", () => {
    const slide = composeSlide({
      order: 0, purpose: "data", layout: TABLE_LAYOUT_NO_MAXLINES, designSystem: DESIGN_SYSTEM,
      contentMap: { slotAssignments: [{ slotId: "table1", tableRows: Array.from({ length: 50 }, (_, i) => [`r${i}`, "x"]) }] },
    });
    expect(slide.elements[0].overflow).toBe(false);
  });

  describe("splitOverflowSlide", () => {
    it("splits a list that overflowed into a primary slide (fits maxLines) and a continuation slide with the rest", () => {
      const slide = composeSlide({
        order: 0, purpose: "list", layout: LIST_LAYOUT, designSystem: DESIGN_SYSTEM,
        contentMap: { slotAssignments: [{ slotId: "items", listItems: ["1", "2", "3", "4", "5", "6", "7"] }] },
      });
      const { primary, overflow } = splitOverflowSlide(slide, LIST_LAYOUT);
      expect(primary.elements[0].listItems).toEqual(["1", "2", "3", "4", "5"]);
      expect(primary.elements[0].overflow).toBe(false);
      expect(overflow?.elements[0].listItems).toEqual(["6", "7"]);
      expect(overflow?.purpose).toContain("continuação");
    });

    it("splits a table that overflowed, repeating the header row on the continuation slide", () => {
      const slide = composeSlide({
        order: 0, purpose: "data", layout: TABLE_LAYOUT_MAXLINES, designSystem: DESIGN_SYSTEM,
        contentMap: { slotAssignments: [{ slotId: "table1", tableRows: [["H1", "H2"], ["a", "1"], ["b", "2"], ["c", "3"], ["d", "4"]] }] },
      });
      const { primary, overflow } = splitOverflowSlide(slide, TABLE_LAYOUT_MAXLINES);
      expect(primary.elements[0].tableRows).toEqual([["H1", "H2"], ["a", "1"], ["b", "2"], ["c", "3"]]);
      expect(overflow?.elements[0].tableRows).toEqual([["H1", "H2"], ["d", "4"]]);
    });

    it("does not split (overflow=null) when nothing overflowed", () => {
      const slide = composeSlide({
        order: 0, purpose: "list", layout: LIST_LAYOUT, designSystem: DESIGN_SYSTEM,
        contentMap: { slotAssignments: [{ slotId: "items", listItems: ["1", "2"] }] },
      });
      const { primary, overflow } = splitOverflowSlide(slide, LIST_LAYOUT);
      expect(overflow).toBeNull();
      expect(primary).toBe(slide);
    });

    it("does not split plain text overflow (title too long) — no safe way to split a sentence", () => {
      const slide = composeSlide({
        order: 0, purpose: "introduction", layout: LAYOUT, designSystem: DESIGN_SYSTEM,
        contentMap: { slotAssignments: [{ slotId: "title", textValue: "x".repeat(500) }] },
        resolvedImages: [{ slotId: "hero_image", url: "https://x/img.png", mediaId: "m1" }],
      });
      expect(slideNeedsOverflowSlide(slide)).toBe(true); // ainda sinaliza overflow…
      const { overflow } = splitOverflowSlide(slide, LAYOUT); // …mas não há como splitar
      expect(overflow).toBeNull();
    });
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
