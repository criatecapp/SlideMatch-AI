import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { renderSlideToSvg } from "../render/renderEngine";
import type { Canvas, DesignSystem, Layout } from "../schemas/template";
import type { Slide, SlideElement } from "../schemas/presentation";
import type { IssueSeverity, VisualQaIssue, VisualQaResult } from "./visualQa";

// Segunda camada do Visual QA (P1#2, seção 12 da auditoria) — roda o
// Render Engine de verdade (satori+resvg, os mesmos usados no export) e
// analisa o PNG resultante em pixels. NÃO substitui runVisualQa (que
// continua sendo a checagem geométrica/JSON, rápida e sem I/O) — esta
// camada só existe pra pegar o que só aparece depois de renderizar de
// verdade: fonte real (não a estimativa por contagem de caracteres),
// contraste real por pixel (não só os dois hex do Design System), corte
// severo de imagem (usando as dimensões reais da mídia), e slide
// visualmente vazio.
//
// Deliberadamente NÃO tenta: detectar sobreposição (a camada JSON já é
// mais precisa pra isso, geometria exata) nem elemento fora do canvas
// (idem). Pixel só entra onde geometria sozinha não basta.

export interface MediaDimensions {
  width: number | null;
  height: number | null;
}

const BG_THRESHOLD = 24; // soma de |Δr|+|Δg|+|Δb| abaixo disso = "é fundo"

export async function runRenderQa(
  slide: Slide,
  layout: Layout,
  designSystem: DesignSystem,
  mediaDimensionsById: Record<string, MediaDimensions> = {},
): Promise<VisualQaResult> {
  const issues: VisualQaIssue[] = [];

  // 1. Crop severo — não precisa renderizar: geometria do slot x
  // dimensão real da mídia (a camada JSON nunca olha pra isso, e o
  // objectFit:cover do Render Engine nunca deforma, mas CORTA).
  for (const el of slide.elements) {
    if (el.kind !== "image" || !el.imageMediaId) continue;
    const dims = mediaDimensionsById[el.imageMediaId];
    if (!dims?.width || !dims?.height) continue;
    const imageRatio = dims.width / dims.height;
    const slotRatio = (el.position.w * layout.canvas.width) / (el.position.h * layout.canvas.height);
    const ratioOfRatios = imageRatio / slotRatio;
    if (ratioOfRatios > 2 || ratioOfRatios < 0.5) {
      issues.push({
        code: "image_crop_severe",
        severity: "warning",
        slotId: el.slotId,
        message: `Imagem do slot "${el.slotId}" tem proporção muito diferente da caixa (imagem ${imageRatio.toFixed(2)}:1, slot ${slotRatio.toFixed(2)}:1) — o recorte automático (cover) pode remover o assunto principal.`,
      });
    }
  }

  let pixels: { data: Buffer; width: number; height: number; channels: number };
  try {
    pixels = await renderToPixels(slide, layout, designSystem);
  } catch (err: any) {
    // Falha de render (sem rede pra fonte/imagem, etc.) não pode travar a
    // geração — vira warning e as checagens de pixel simplesmente não
    // rodam pra este slide.
    issues.push({ code: "render_unavailable", severity: "warning", message: `Não foi possível renderizar o slide pra análise visual: ${err?.message ?? String(err)}` });
    return { score: scoreFromRenderIssues(issues), issues };
  }

  const bg = hexToRgb(designSystem.palette.background);

  // 2. Slide quase vazio — fração de pixels que diferem visivelmente do
  // fundo declarado, no PNG inteiro.
  const coverage = inkDensity(pixels, { x: 0, y: 0, w: pixels.width, h: pixels.height }, bg);
  if (coverage < 0.03) {
    issues.push({ code: "sparse_content", severity: "warning", message: `Só ${(coverage * 100).toFixed(1)}% da área do slide tem conteúdo visível — pode estar quase vazio.` });
  }

  for (const el of slide.elements) {
    if (el.kind !== "text" || !el.text) continue;
    const box = pixelBox(el.position, layout.canvas, pixels.width, pixels.height);
    if (box.w < 2 || box.h < 2) continue;

    // 3. Contraste real medido no render — separa os pixels mais claros
    // dos mais escuros dentro da própria caixa do texto (percentil 10/90,
    // não média) e mede o contraste real entre eles. Funciona mesmo se o
    // slot sobrescreve `color`/`background`, ou se o texto está sobre uma
    // imagem — casos que a camada JSON (que só compara os dois hex do
    // Design System) não enxerga.
    const localRatio = localContrastRatio(pixels, box);
    if (localRatio !== null) {
      const isLarge = (el.fontSize ?? designSystem.typography.scale.body) >= 24;
      if (localRatio < (isLarge ? 3 : 4.5)) {
        issues.push({
          code: "low_contrast_render",
          severity: "warning",
          slotId: el.slotId,
          message: `Contraste real medido no render do slot "${el.slotId}" (${localRatio.toFixed(2)}:1) abaixo do mínimo WCAG AA.`,
        });
      }
    }

    // 4. Extrapolação real de conteúdo — mesmo quando o Content Fit
    // Engine (estimativa por contagem de caracteres) marcou `overflow:
    // false`, a fonte REAL (peso, largura proporcional real) pode ocupar
    // mais espaço do que a caixa declarada. Mede densidade de tinta numa
    // faixa logo fora da caixa (embaixo); se há tinta lá, o conteúdo
    // realmente extrapolou a área no render, não só na estimativa.
    if (!el.overflow) {
      const spill = spilloverBand(box, pixels.width, pixels.height);
      if (spill) {
        const spillDensity = inkDensity(pixels, spill, bg);
        if (spillDensity > 0.05) {
          issues.push({
            code: "text_overflow_render",
            severity: "warning",
            slotId: el.slotId,
            message: `Conteúdo do slot "${el.slotId}" extrapola visualmente a área declarada no render real, apesar do Content Fit ter marcado como cabendo.`,
          });
        }
      }
    }
  }

  return { score: scoreFromRenderIssues(issues), issues };
}

async function renderToPixels(slide: Slide, layout: Layout, designSystem: DesignSystem) {
  const svg = await renderSlideToSvg(slide, layout, designSystem);
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: layout.canvas.width } });
  const png = resvg.render().asPng();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

type PixelBuffer = { data: Buffer; width: number; height: number; channels: number };
type PxBox = { x: number; y: number; w: number; h: number };

function pixelBox(position: SlideElement["position"], canvas: Canvas, imgWidth: number, imgHeight: number): PxBox {
  const scaleX = imgWidth / canvas.width;
  const scaleY = imgHeight / canvas.height;
  const x = clamp(Math.round((position.x / 100) * canvas.width * scaleX), 0, imgWidth - 1);
  const y = clamp(Math.round((position.y / 100) * canvas.height * scaleY), 0, imgHeight - 1);
  const w = clamp(Math.round((position.w / 100) * canvas.width * scaleX), 1, imgWidth - x);
  const h = clamp(Math.round((position.h / 100) * canvas.height * scaleY), 1, imgHeight - y);
  return { x, y, w, h };
}

function spilloverBand(box: PxBox, imgWidth: number, imgHeight: number): PxBox | null {
  const bandPx = Math.max(4, Math.round(box.h * 0.08));
  const bandY = box.y + box.h;
  if (bandY >= imgHeight) return null;
  return { x: box.x, y: bandY, w: box.w, h: clamp(bandPx, 1, imgHeight - bandY) };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const int = parseInt(full, 16) || 0;
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function inkDensity(pixels: PixelBuffer, box: PxBox, bg: [number, number, number]): number {
  let ink = 0;
  let total = 0;
  for (let yy = box.y; yy < box.y + box.h; yy++) {
    for (let xx = box.x; xx < box.x + box.w; xx++) {
      const idx = (yy * pixels.width + xx) * pixels.channels;
      const r = pixels.data[idx];
      const g = pixels.data[idx + 1];
      const b = pixels.data[idx + 2];
      total++;
      if (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) >= BG_THRESHOLD) ink++;
    }
  }
  return total > 0 ? ink / total : 0;
}

function luminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// Contraste entre o percentil 2 e o percentil 98 de luminância dentro da
// caixa — não média (que esconde texto pequeno num fundo grande) nem
// classificação de "qual pixel é texto" (complexo demais pra valer a
// pena). Precisa ser um percentil BEM extremo (não 10/90): uma linha de
// texto normal ocupa uma fração pequena da área da própria caixa (o resto
// é o respiro do line-height) — com 10/90 os dois lados caem no fundo pra
// qualquer texto com menos de ~10% de cobertura de tinta, dando falso
// positivo. 2/98 tolera isso e ainda ignora outliers de antialiasing.
function localContrastRatio(pixels: PixelBuffer, box: PxBox): number | null {
  const lums: number[] = [];
  for (let yy = box.y; yy < box.y + box.h; yy++) {
    for (let xx = box.x; xx < box.x + box.w; xx++) {
      const idx = (yy * pixels.width + xx) * pixels.channels;
      lums.push(luminance(pixels.data[idx], pixels.data[idx + 1], pixels.data[idx + 2]));
    }
  }
  if (lums.length < 16) return null;
  lums.sort((a, b) => a - b);
  const lo = lums[Math.floor(lums.length * 0.02)];
  const hi = lums[Math.floor(lums.length * 0.98)];
  return (hi + 0.05) / (lo + 0.05);
}

function scoreFromRenderIssues(issues: VisualQaIssue[]): number {
  let score = 100;
  for (const issue of issues) score -= issue.severity === ("error" as IssueSeverity) ? 15 : 6;
  return Math.max(0, Math.min(100, score));
}
