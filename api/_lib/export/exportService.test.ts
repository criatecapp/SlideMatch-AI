import { describe, expect, it } from "vitest";
import { exportToPdf, exportToPngs, exportToPptx } from "./exportService";
import { DesignSystemSchema, type Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

const LAYOUT: Layout = { id: "l1", name: "L1", type: "hero", canvas: { width: 960, height: 540 }, slots: [] };
const DESIGN_SYSTEM = DesignSystemSchema.parse({});
const SLIDES: Slide[] = [
  {
    order: 0, layoutId: "l1", purpose: "introduction",
    elements: [{ slotId: "title", kind: "text", role: "title", position: { x: 10, y: 10, w: 80, h: 20 }, text: "Título", fontSize: 44, overflow: false }],
  },
];

describe("exportToPptx", () => {
  it("produces a real, non-empty .pptx (zip signature PK)", async () => {
    const buf = await exportToPptx(SLIDES, [LAYOUT], DESIGN_SYSTEM, "16:9");
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // .pptx é um zip
  }, 20000);

  it("throws a clear error when a slide references a layoutId not in the given layouts", async () => {
    const badSlide: Slide = { ...SLIDES[0], layoutId: "missing" };
    await expect(exportToPptx([badSlide], [LAYOUT], DESIGN_SYSTEM, "16:9")).rejects.toThrow('Layout "missing"');
  });

  it("embeds a real chart (adds an embedded workbook, so the zip grows noticeably) without throwing", async () => {
    const chartSlide: Slide = {
      order: 0, layoutId: "l1", purpose: "data",
      elements: [{ slotId: "chart1", kind: "chart", role: "chart", position: { x: 10, y: 10, w: 80, h: 70 }, chartTitle: "Incidentes", dataPoints: [{ label: "Jan", value: 12 }, { label: "Fev", value: 8 }], overflow: false }],
    };
    const buf = await exportToPptx([chartSlide], [LAYOUT], DESIGN_SYSTEM, "16:9");
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(5000); // gráfico embute um workbook real, não é um texto simples
  }, 20000);

  it("embeds a real table without throwing", async () => {
    const tableSlide: Slide = {
      order: 0, layoutId: "l1", purpose: "data",
      elements: [{ slotId: "table1", kind: "table", role: "table", position: { x: 10, y: 10, w: 80, h: 70 }, tableRows: [["Risco", "Nível"], ["Phishing", "Alto"]], overflow: false }],
    };
    const buf = await exportToPptx([tableSlide], [LAYOUT], DESIGN_SYSTEM, "16:9");
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(1000);
  }, 20000);
});

describe("exportToPngs", () => {
  it("renders one real PNG per slide", async () => {
    const pngs = await exportToPngs(SLIDES, [LAYOUT], DESIGN_SYSTEM);
    expect(pngs).toHaveLength(1);
    expect(pngs[0].subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 20000);
});

describe("exportToPdf", () => {
  it("produces a real, non-empty PDF (%PDF signature)", async () => {
    const buf = await exportToPdf(SLIDES, [LAYOUT], DESIGN_SYSTEM);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(500);
  }, 20000);
});
