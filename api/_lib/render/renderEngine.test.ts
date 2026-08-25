import { describe, expect, it } from "vitest";
import { renderSlideToPng, renderSlideToSvg } from "./renderEngine";
import { DesignSystemSchema, type Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

const LAYOUT: Layout = { id: "l1", name: "L1", type: "hero", canvas: { width: 960, height: 540 }, slots: [] };
const DESIGN_SYSTEM = DesignSystemSchema.parse({});

const SLIDE: Slide = {
  order: 0,
  layoutId: "l1",
  purpose: "introduction",
  elements: [
    { slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Segurança da Informação", fontSize: 44, overflow: false },
    { slotId: "body", kind: "text", role: "body", position: { x: 10, y: 35, w: 80, h: 30 }, text: "Boas práticas pra todos os colaboradores.", fontSize: 20, overflow: false },
  ],
};

describe("renderEngine (live satori+resvg)", () => {
  it("renders a real SVG at the layout's canvas size, with glyph paths for both text elements", async () => {
    // satori desenha texto como contorno vetorial — um <path> por bloco de
    // texto, combinando todos os glifos dele num único `d` com vários
    // subpaths. Confirmar o SVG aqui é confirmar tamanho do canvas e que
    // saiu um path por elemento de texto (título + corpo = 2), cada um com
    // conteúdo real (não vazio).
    const svg = await renderSlideToSvg(SLIDE, LAYOUT, DESIGN_SYSTEM);
    expect(svg).toContain('width="960" height="540"');
    const paths = [...svg.matchAll(/<path fill="[^"]*" d="([^"]+)"/g)];
    expect(paths).toHaveLength(2);
    for (const [, d] of paths) expect(d.length).toBeGreaterThan(100);
  }, 20000);

  it("renders a real, non-empty PNG buffer with the correct signature", async () => {
    const png = await renderSlideToPng(SLIDE, LAYOUT, DESIGN_SYSTEM);
    expect(png.length).toBeGreaterThan(1000);
    // Assinatura PNG: 89 50 4E 47 0D 0A 1A 0A
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 20000);
});
