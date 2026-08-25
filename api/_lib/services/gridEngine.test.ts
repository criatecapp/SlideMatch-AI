import { describe, expect, it } from "vitest";
import { isWithinSafeArea, resolveGridPosition } from "./gridEngine";

const CANVAS = { width: 1920, height: 1080 };
const GRID = { columns: 12, gutter: 24, margin: 80 };

describe("resolveGridPosition", () => {
  it("places column 0 span 12 flush against both margins", () => {
    const pos = resolveGridPosition(GRID, CANVAS, { column: 0, columnSpan: 12 });
    const usableWidthPct = ((CANVAS.width - 2 * GRID.margin) / CANVAS.width) * 100;
    expect(pos.x).toBeCloseTo((GRID.margin / CANVAS.width) * 100, 5);
    expect(pos.w).toBeCloseTo(usableWidthPct, 5);
  });

  it("places two adjacent half-width columns without overlapping", () => {
    const left = resolveGridPosition(GRID, CANVAS, { column: 0, columnSpan: 6 });
    const right = resolveGridPosition(GRID, CANVAS, { column: 6, columnSpan: 6 });
    expect(left.x + left.w).toBeLessThanOrEqual(right.x + 0.01);
  });

  it("respects row/rowSpan for vertical placement", () => {
    const top = resolveGridPosition(GRID, CANVAS, { column: 0, columnSpan: 12, row: 0, rowSpan: 2 });
    const bottom = resolveGridPosition(GRID, CANVAS, { column: 0, columnSpan: 12, row: 2, rowSpan: 2 });
    expect(top.y).toBeLessThan(bottom.y);
    expect(top.y + top.h).toBeLessThanOrEqual(bottom.y + 0.01);
  });

  it("defaults row to 0 and rowSpan to 1 when omitted", () => {
    const pos = resolveGridPosition(GRID, CANVAS, { column: 0, columnSpan: 12 });
    expect(pos.y).toBeCloseTo((GRID.margin / CANVAS.height) * 100, 5);
  });

  it("produces a position within the safe area for any valid column span", () => {
    const pos = resolveGridPosition(GRID, CANVAS, { column: 3, columnSpan: 6, row: 1, rowSpan: 2 });
    expect(isWithinSafeArea(CANVAS, pos)).toBe(true);
  });
});

describe("isWithinSafeArea", () => {
  it("rejects a position that overflows the right edge", () => {
    expect(isWithinSafeArea(CANVAS, { x: 60, y: 10, w: 50, h: 10 })).toBe(false);
  });

  it("rejects a position that overflows the bottom edge", () => {
    expect(isWithinSafeArea(CANVAS, { x: 10, y: 60, w: 10, h: 50 })).toBe(false);
  });

  it("accepts a position exactly at the edges", () => {
    expect(isWithinSafeArea(CANVAS, { x: 0, y: 0, w: 100, h: 100 })).toBe(true);
  });
});
