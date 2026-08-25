import { describe, expect, it } from "vitest";
import { exceedsMaxLines, estimateLineCount, fitText } from "./contentFitEngine";
import type { Slot } from "../schemas/template";

function slot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: "s1", kind: "text", role: "body", position: { x: 0, y: 0, w: 100, h: 100 },
    required: false, editable: true, locked: false, aiEditable: true, priority: 5,
    overflowBehavior: "shrink_font", responsiveBehavior: "scale", ...overrides,
  };
}

describe("fitText", () => {
  it("leaves text and font untouched when there is no maxCharacters", () => {
    const result = fitText("qualquer coisa", slot(), 18);
    expect(result).toEqual({ text: "qualquer coisa", fontSize: 18, overflow: false });
  });

  it("leaves text untouched when it already fits", () => {
    const result = fitText("curto", slot({ maxCharacters: 100 }), 18);
    expect(result).toEqual({ text: "curto", fontSize: 18, overflow: false });
  });

  it("shrinks the font (never below the floor) when text mildly overflows", () => {
    const value = "x".repeat(90); // maxChars=80 → scale=0.888, dentro do piso de 0.6
    const result = fitText(value, slot({ maxCharacters: 80 }), 20);
    expect(result.text).toBe(value);
    expect(result.overflow).toBe(false);
    expect(result.fontSize).toBeLessThan(20);
    expect(result.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("truncates with an ellipsis and flags overflow when shrinking alone wouldn't be enough", () => {
    const value = "x".repeat(500); // maxChars=50 → scale=0.1, muito abaixo do piso
    const result = fitText(value, slot({ maxCharacters: 50 }), 20);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.length).toBe(50);
    expect(result.overflow).toBe(true);
    expect(result.fontSize).toBeGreaterThanOrEqual(12);
  });

  it("never returns a font size below the absolute floor of 12", () => {
    const value = "x".repeat(1000);
    const result = fitText(value, slot({ maxCharacters: 20 }), 14);
    expect(result.fontSize).toBeGreaterThanOrEqual(12);
  });
});

describe("estimateLineCount / exceedsMaxLines", () => {
  it("estimates line count from character length", () => {
    expect(estimateLineCount("x".repeat(100), 40)).toBe(3);
  });

  it("exceedsMaxLines is false when the slot has no maxLines", () => {
    expect(exceedsMaxLines("x".repeat(1000), slot(), 40)).toBe(false);
  });

  it("exceedsMaxLines is true when estimated lines exceed the slot's maxLines", () => {
    expect(exceedsMaxLines("x".repeat(200), slot({ maxLines: 2 }), 40)).toBe(true);
  });
});
