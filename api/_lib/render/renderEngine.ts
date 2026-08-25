import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { fetchGoogleFontFiles } from "./googleFonts";
import type { DesignSystem, Layout } from "../schemas/template";
import type { Slide, SlideElement } from "../schemas/presentation";

// Satori node — sem JSX/React, o mesmo formato de árvore que satori aceita
// crua (type + props.style + props.children).
interface SNode {
  type: string;
  props: { style?: Record<string, unknown>; children?: SNode[] | string; src?: string };
}

function div(style: Record<string, unknown>, children: SNode[] | string = []): SNode {
  return { type: "div", props: { style, children } };
}

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

async function elementToNode(el: SlideElement, canvas: { width: number; height: number }, designSystem: DesignSystem): Promise<SNode | null> {
  const left = (el.position.x / 100) * canvas.width;
  const top = (el.position.y / 100) * canvas.height;
  const width = (el.position.w / 100) * canvas.width;
  const height = (el.position.h / 100) * canvas.height;
  const positionStyle = { position: "absolute", left, top, width, height, display: "flex" };

  if (el.kind === "image") {
    if (!el.imageUrl) return null;
    const dataUri = await fetchAsDataUri(el.imageUrl);
    if (!dataUri) return null;
    return { type: "img", props: { src: dataUri, style: { ...positionStyle, objectFit: "cover" } } };
  }

  if (el.kind === "chart" && el.dataPoints && el.dataPoints.length > 0) {
    const titleHeight = el.chartTitle ? 32 : 0;
    const maxValue = Math.max(...el.dataPoints.map((p) => p.value), 1);
    const barsRowHeight = height - titleHeight;
    const bars = el.dataPoints.map((p) =>
      div(
        { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: barsRowHeight, flexGrow: 1 },
        [
          div({ display: "flex", fontSize: 13, color: designSystem.palette.ink, marginBottom: 4 }, String(p.value)),
          div({ display: "flex", width: "60%", height: Math.max(2, (p.value / maxValue) * (barsRowHeight - 40)), background: designSystem.palette.accent, borderRadius: 4 }),
          div({ display: "flex", fontSize: 12, color: designSystem.palette.muted, marginTop: 6 }, p.label),
        ],
      ),
    );
    const children: SNode[] = [];
    if (el.chartTitle) children.push(div({ display: "flex", height: titleHeight, fontSize: 16, fontWeight: 700, color: designSystem.palette.ink }, el.chartTitle));
    children.push(div({ display: "flex", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", height: barsRowHeight, width: "100%", gap: 12 }, bars));
    return div({ ...positionStyle, flexDirection: "column" }, children);
  }

  if (el.kind === "table" && el.tableRows && el.tableRows.length > 0) {
    const rowHeight = height / el.tableRows.length;
    const rows = el.tableRows.map((row, ri) =>
      div(
        {
          display: "flex", flexDirection: "row", height: rowHeight, width: "100%",
          background: ri === 0 ? designSystem.palette.surface : "transparent",
          borderBottom: `1px solid ${designSystem.palette.surface}`,
        },
        row.map((cell) =>
          div(
            { display: "flex", flexGrow: 1, alignItems: "center", padding: 8, fontSize: 14, fontWeight: ri === 0 ? 700 : 400, color: designSystem.palette.ink },
            cell,
          ),
        ),
      ),
    );
    return div({ ...positionStyle, flexDirection: "column" }, rows);
  }

  if (el.listItems) {
    return div(
      { ...positionStyle, flexDirection: "column", gap: 8, color: designSystem.palette.ink, fontSize: el.fontSize ?? designSystem.typography.scale.body },
      el.listItems.map((item) => div({ display: "flex" }, `• ${item}`)),
    );
  }

  if (el.statValue) {
    return div(
      { ...positionStyle, flexDirection: "column", justifyContent: "center", color: designSystem.palette.accent, fontSize: el.fontSize ?? designSystem.typography.scale.statistic, fontWeight: 700 },
      el.statValue,
    );
  }

  if (el.text) {
    const isTitleLike = el.role === "title" || el.role === "subtitle" || el.role === "heading";
    return div(
      {
        ...positionStyle,
        alignItems: "center",
        color: designSystem.palette.ink,
        fontSize: el.fontSize ?? designSystem.typography.scale.body,
        fontWeight: isTitleLike ? 700 : 400,
      },
      el.text,
    );
  }

  return null;
}

export interface RenderedFonts {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: "normal";
}

// 3 níveis, mesmo padrão já provado: fonte pedida pelo Design System →
// Google Fonts ao vivo → Inter como fallback garantido (nunca falha por
// fonte ausente).
async function resolveFonts(fontFamily: string): Promise<{ family: string; files: RenderedFonts[] }> {
  const requested = await fetchGoogleFontFiles(fontFamily);
  if (requested) {
    return { family: fontFamily, files: requested.map((f) => ({ name: fontFamily, data: f.data, weight: f.weight, style: "normal" as const })) };
  }
  if (fontFamily !== "Inter") {
    const fallback = await fetchGoogleFontFiles("Inter");
    if (fallback) return { family: "Inter", files: fallback.map((f) => ({ name: "Inter", data: f.data, weight: f.weight, style: "normal" as const })) };
  }
  throw new Error(`Não foi possível carregar nenhuma fonte (pedida: ${fontFamily}, fallback: Inter) — sem rede?`);
}

// Render Engine (section 21) — determinístico: o mesmo Slide JSON sempre
// produz o mesmo PNG (dado o mesmo conteúdo de imagem remota). A IA nunca
// controla HTML arbitrário — só os dados tipados de Slide/Layout/
// DesignSystem chegam até aqui.
export async function renderSlideToSvg(slide: Slide, layout: Layout, designSystem: DesignSystem): Promise<string> {
  const { family, files } = await resolveFonts(designSystem.typography.bodyFont);

  const nodes = (await Promise.all(slide.elements.map((el) => elementToNode(el, layout.canvas, designSystem)))).filter((n): n is SNode => n !== null);

  const root = div(
    { width: layout.canvas.width, height: layout.canvas.height, display: "flex", backgroundColor: designSystem.palette.background, fontFamily: family },
    nodes,
  );

  return satori(root as any, { width: layout.canvas.width, height: layout.canvas.height, fonts: files });
}

export async function renderSlideToPng(slide: Slide, layout: Layout, designSystem: DesignSystem): Promise<Buffer> {
  const svg = await renderSlideToSvg(slide, layout, designSystem);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: layout.canvas.width } });
  return resvg.render().asPng();
}
