import PptxGenJS from "pptxgenjs";
import { PDFDocument } from "pdf-lib";
import { renderSlideToPng } from "../render/renderEngine";
import type { DesignSystem, Layout } from "../schemas/template";
import type { Slide } from "../schemas/presentation";

// Polegadas por aspect ratio — mesma convenção do PowerPoint.
const SLIDE_SIZE: Record<string, { w: number; h: number }> = {
  "16:9": { w: 10, h: 5.63 },
  "4:3": { w: 10, h: 7.5 },
};

async function fetchAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "image/png";
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function layoutById(layouts: Layout[], id: string): Layout {
  const layout = layouts.find((l) => l.id === id);
  if (!layout) throw new Error(`Layout "${id}" não encontrado pra exportação`);
  return layout;
}

// Export .pptx (section 25) — respeita fonte, posição, imagem, cor e
// proporção: cada elemento vira um objeto pptxgenjs posicionado em
// polegadas a partir do mesmo x/y/w/h em % que o Renderer usa, garantindo
// que o .pptx e o preview HTML nunca divirjam.
export async function exportToPptx(slides: Slide[], layouts: Layout[], designSystem: DesignSystem, aspectRatio: "16:9" | "4:3"): Promise<Buffer> {
  const size = SLIDE_SIZE[aspectRatio];
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "CUSTOM", width: size.w, height: size.h });
  pres.layout = "CUSTOM";

  for (const slide of slides) {
    const layout = layoutById(layouts, slide.layoutId);
    const pptxSlide = pres.addSlide();
    pptxSlide.background = { color: designSystem.palette.background.replace("#", "") };

    for (const el of slide.elements) {
      const x = (el.position.x / 100) * size.w;
      const y = (el.position.y / 100) * size.h;
      const w = (el.position.w / 100) * size.w;
      const h = (el.position.h / 100) * size.h;

      if (el.kind === "image" && el.imageUrl) {
        const dataUri = await fetchAsDataUri(el.imageUrl);
        if (dataUri) pptxSlide.addImage({ data: dataUri, x, y, w, h, sizing: { type: "cover", w, h } });
        continue;
      }

      if (el.kind === "chart" && el.dataPoints && el.dataPoints.length > 0) {
        pptxSlide.addChart(
          pres.ChartType.bar,
          [{ name: el.chartTitle ?? "", labels: el.dataPoints.map((p) => p.label), values: el.dataPoints.map((p) => p.value) }],
          { x, y, w, h, chartColors: [designSystem.palette.accent.replace("#", "")], showTitle: Boolean(el.chartTitle), title: el.chartTitle, showLegend: false },
        );
        continue;
      }

      if (el.kind === "table" && el.tableRows && el.tableRows.length > 0) {
        const rows = el.tableRows.map((row, ri) =>
          row.map((cell) => ({
            text: cell,
            options: {
              bold: ri === 0,
              fill: { color: ri === 0 ? designSystem.palette.surface.replace("#", "") : "FFFFFF" },
              color: designSystem.palette.ink.replace("#", ""),
              fontSize: 12,
            },
          })),
        );
        pptxSlide.addTable(rows, { x, y, w, h, border: { type: "solid", color: designSystem.palette.surface.replace("#", ""), pt: 1 } });
        continue;
      }

      const text = el.text ?? (el.listItems ? el.listItems.map((i) => `• ${i}`).join("\n") : el.statValue);
      if (!text) continue;
      const isTitleLike = el.role === "title" || el.role === "subtitle" || el.role === "heading";
      pptxSlide.addText(text, {
        x, y, w, h,
        fontFace: isTitleLike ? designSystem.typography.titleFont : designSystem.typography.bodyFont,
        fontSize: el.fontSize ?? designSystem.typography.scale.body,
        bold: isTitleLike,
        color: (el.role === "statistic" ? designSystem.palette.accent : designSystem.palette.ink).replace("#", ""),
      });
    }
  }

  const arrayBuffer = (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}

export async function exportToPngs(slides: Slide[], layouts: Layout[], designSystem: DesignSystem): Promise<Buffer[]> {
  const pngs: Buffer[] = [];
  for (const slide of slides) {
    const layout = layoutById(layouts, slide.layoutId);
    pngs.push(await renderSlideToPng(slide, layout, designSystem));
  }
  return pngs;
}

export async function exportToPdf(slides: Slide[], layouts: Layout[], designSystem: DesignSystem): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (const slide of slides) {
    const layout = layoutById(layouts, slide.layoutId);
    const png = await renderSlideToPng(slide, layout, designSystem);
    const image = await doc.embedPng(png);
    const page = doc.addPage([layout.canvas.width, layout.canvas.height]);
    page.drawImage(image, { x: 0, y: 0, width: layout.canvas.width, height: layout.canvas.height });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
