import { describe, expect, it } from "vitest";
import { resolveImagesForLayout } from "./imageResolver";
import type { Layout } from "../schemas/template";
import type { ImageAnalysis } from "../schemas/ai";

const LAYOUT: Layout = {
  id: "l1", name: "L1", type: "hero", canvas: { width: 1920, height: 1080 },
  slots: [{ id: "hero", kind: "image", role: "image", position: { x: 0, y: 0, w: 100, h: 100 }, required: true, editable: true, locked: false, aiEditable: true, priority: 5, overflowBehavior: "shrink_font", responsiveBehavior: "scale", allowedImageRatio: "16:9" }],
};

function image(mediaId: string, orientation: ImageAnalysis["orientation"]): ImageAnalysis {
  return { mediaId, role: "hero_image", subject: "x", orientation, aspectRatio: "16:9", focalPoint: { x: 0.5, y: 0.5 } };
}

describe("resolveImagesForLayout", () => {
  it("assigns an available image to the slot", () => {
    const used = new Set<string>();
    const result = resolveImagesForLayout(LAYOUT, [image("m1", "landscape")], { m1: "https://x/m1.png" }, used);
    expect(result).toEqual([{ slotId: "hero", url: "https://x/m1.png", mediaId: "m1" }]);
    expect(used.has("m1")).toBe(true);
  });

  it("never reuses a mediaId already marked as used", () => {
    const used = new Set(["m1"]);
    const result = resolveImagesForLayout(LAYOUT, [image("m1", "landscape")], { m1: "https://x/m1.png" }, used);
    expect(result).toEqual([]);
  });

  it("prefers an image whose orientation matches the slot's allowedImageRatio", () => {
    const used = new Set<string>();
    const result = resolveImagesForLayout(
      LAYOUT,
      [image("portrait1", "portrait"), image("landscape1", "landscape")],
      { portrait1: "https://x/p.png", landscape1: "https://x/l.png" },
      used,
    );
    expect(result[0].mediaId).toBe("landscape1");
  });

  it("returns an empty list when there are no candidate images", () => {
    const used = new Set<string>();
    const result = resolveImagesForLayout(LAYOUT, [], {}, used);
    expect(result).toEqual([]);
  });
});
