import { describe, expect, it } from "vitest";
import { LayoutSchema, SlotSchema, TemplateCreateSchema } from "./template";

const BASE_SLOT = { id: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 } };

describe("SlotSchema", () => {
  it("fills in defaults for optional flags", () => {
    const slot = SlotSchema.parse(BASE_SLOT);
    expect(slot.required).toBe(false);
    expect(slot.editable).toBe(true);
    expect(slot.aiEditable).toBe(true);
    expect(slot.overflowBehavior).toBe("shrink_font");
  });

  it("rejects an invalid kind", () => {
    expect(() => SlotSchema.parse({ ...BASE_SLOT, kind: "bogus" })).toThrow();
  });

  it("accepts a free-text role not in the curated list", () => {
    const slot = SlotSchema.parse({ ...BASE_SLOT, role: "custom_widget" });
    expect(slot.role).toBe("custom_widget");
  });

  it("accepts a gridPlacement", () => {
    const slot = SlotSchema.parse({ ...BASE_SLOT, gridPlacement: { column: 0, columnSpan: 6 } });
    expect(slot.gridPlacement?.columnSpan).toBe(6);
  });
});

describe("LayoutSchema", () => {
  it("defaults canvas to 1920x1080 and slots to an empty list", () => {
    const layout = LayoutSchema.parse({ id: "l1", name: "Hero", type: "hero" });
    expect(layout.canvas).toEqual({ width: 1920, height: 1080 });
    expect(layout.slots).toEqual([]);
  });
});

describe("TemplateCreateSchema", () => {
  it("fills in a full default design system when omitted", () => {
    const template = TemplateCreateSchema.parse({ name: "Corporate Hero" });
    expect(template.designSystem.palette.background).toBe("#FFFFFF");
    expect(template.designSystem.typography.scale.title).toBe(44);
    expect(template.designSystem.grid.columns).toBe(12);
    expect(template.aspectRatio).toBe("16:9");
  });

  it("rejects a name over 120 characters", () => {
    expect(() => TemplateCreateSchema.parse({ name: "x".repeat(121) })).toThrow();
  });
});
