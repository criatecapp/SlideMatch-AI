import { describe, expect, it } from "vitest";
import { sanitizeContentMap } from "./contentMapper";
import type { Layout } from "../schemas/template";

const LAYOUT: Layout = {
  id: "l1",
  name: "L1",
  type: "hero",
  canvas: { width: 1920, height: 1080 },
  slots: [
    { id: "title", kind: "text", role: "title", position: { x: 0, y: 0, w: 100, h: 20 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale" },
  ],
};

describe("sanitizeContentMap", () => {
  it("keeps assignments that reference a real slot id", () => {
    const result = sanitizeContentMap({ slotAssignments: [{ slotId: "title", textValue: "Oi" }] }, LAYOUT);
    expect(result.slotAssignments).toHaveLength(1);
  });

  it("drops assignments referencing a slotId that doesn't exist in the layout", () => {
    const result = sanitizeContentMap(
      { slotAssignments: [{ slotId: "title", textValue: "Oi" }, { slotId: "invented", textValue: "x" }] },
      LAYOUT,
    );
    expect(result.slotAssignments).toEqual([{ slotId: "title", textValue: "Oi" }]);
  });
});
