import { describe, expect, it } from "vitest";
import { runRenderQa } from "./renderQa";
import { DesignSystemSchema, type Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

// P1#2 — segunda camada do Visual QA, rodando o Render Engine de verdade
// (mesma rede real que renderEngine.test.ts já usa) e analisando o PNG.

const LAYOUT: Layout = { id: "l1", name: "L1", type: "hero", canvas: { width: 960, height: 540 }, slots: [] };
const DESIGN_SYSTEM = DesignSystemSchema.parse({});

function slide(elements: Slide["elements"]): Slide {
  return { order: 0, layoutId: "l1", purpose: "introduction", elements };
}

describe("runRenderQa (live satori+resvg)", () => {
  it("flags image_crop_severe when the slot ratio and the real media ratio are very different", async () => {
    const result = await runRenderQa(
      slide([{ slotId: "img", kind: "image", role: "image", position: { x: 5, y: 5, w: 90, h: 8 }, imageMediaId: "m1", overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
      { m1: { width: 400, height: 1600 } }, // retrato bem alto num slot bem largo e baixo
    );
    expect(result.issues.some((i) => i.code === "image_crop_severe" && i.slotId === "img")).toBe(true);
  }, 20000);

  it("does not flag image_crop_severe when the slot ratio matches the real media ratio", async () => {
    const result = await runRenderQa(
      slide([{ slotId: "img", kind: "image", role: "image", position: { x: 5, y: 5, w: 80, h: 45 }, imageMediaId: "m1", overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
      { m1: { width: 1600, height: 900 } }, // ~16:9, perto do slot (80%*960)/(45%*540) ≈ 3.16 vs 1.78 — dentro da tolerância 0.5x-2x
    );
    expect(result.issues.some((i) => i.code === "image_crop_severe")).toBe(false);
  }, 20000);

  it("flags sparse_content when almost the whole slide is background", async () => {
    const result = await runRenderQa(
      slide([{ slotId: "tiny", kind: "text", role: "caption", position: { x: 2, y: 2, w: 12, h: 6 }, text: "Oi", fontSize: 14, overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "sparse_content")).toBe(true);
  }, 20000);

  it("does not flag sparse_content when the slide has real content coverage", async () => {
    const result = await runRenderQa(
      slide([
        { slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Segurança da Informação pra todos", fontSize: 44, overflow: false },
        { slotId: "body", kind: "text", role: "body", position: { x: 10, y: 35, w: 80, h: 40 }, text: "Boas práticas de senha e autenticação de dois fatores pra todos os colaboradores da empresa.", fontSize: 22, overflow: false },
      ]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "sparse_content")).toBe(false);
  }, 20000);

  it("flags low_contrast_render with real pixels when ink and background are too close", async () => {
    const lowContrast = DesignSystemSchema.parse({ palette: { background: "#FFFFFF", ink: "#EEEEEE" } });
    const result = await runRenderQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Título quase invisível", fontSize: 44, overflow: false }]),
      LAYOUT,
      lowContrast,
    );
    expect(result.issues.some((i) => i.code === "low_contrast_render" && i.slotId === "title")).toBe(true);
  }, 20000);

  it("does not flag low_contrast_render for normal ink-on-white text", async () => {
    const result = await runRenderQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Título bem legível", fontSize: 44, overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "low_contrast_render")).toBe(false);
  }, 20000);

  it("flags text_overflow_render when real rendered text spills past a box too small for it, even though overflow=false", async () => {
    const result = await runRenderQa(
      slide([
        {
          slotId: "cramped", kind: "text", role: "body",
          position: { x: 10, y: 45, w: 80, h: 4 }, // caixa bem baixa
          text: "Este texto é longo o bastante pra não caber de jeito nenhum numa caixa desse tamanho de altura.",
          fontSize: 28, overflow: false, // Content Fit (estimativa) achou que cabia
        },
      ]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "text_overflow_render" && i.slotId === "cramped")).toBe(true);
  }, 20000);

  it("does not flag text_overflow_render when the text genuinely fits", async () => {
    const result = await runRenderQa(
      slide([{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 30 }, text: "Curto", fontSize: 30, overflow: false }]),
      LAYOUT,
      DESIGN_SYSTEM,
    );
    expect(result.issues.some((i) => i.code === "text_overflow_render")).toBe(false);
  }, 20000);
});
