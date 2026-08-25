import { contrastRatio } from "./contrast";
import { isWithinSafeArea } from "./gridEngine";
import { missingRequiredSlots } from "./slideComposer";
import type { DesignSystem, Layout } from "../schemas/template";
import type { Slide, SlideElement } from "../schemas/presentation";

export type IssueSeverity = "warning" | "error";

export interface VisualQaIssue {
  code: string;
  severity: IssueSeverity;
  slotId?: string;
  message: string;
}

export interface VisualQaResult {
  score: number; // 0-100
  issues: VisualQaIssue[];
}

// Section 20 — verifica cada checagem pedida. Tudo determinístico: nenhuma
// chamada de IA nova, só sinais que o Composer/Content Fit já produziram
// mais geometria/paleta que já existem. Mesmo princípio provado em versões
// anteriores deste sistema (Fase E): QA visual não precisa de IA pra
// detectar overflow, sobreposição ou contraste ruim — só matemática.
export function runVisualQa(slide: Slide, layout: Layout, designSystem: DesignSystem): VisualQaResult {
  const issues: VisualQaIssue[] = [];

  for (const el of slide.elements) {
    if (el.overflow) {
      issues.push({ code: "text_cut", severity: "error", slotId: el.slotId, message: `Texto truncado no slot "${el.slotId}"` });
    }
    if (!isWithinSafeArea(layout.canvas, el.position)) {
      issues.push({ code: "out_of_canvas", severity: "error", slotId: el.slotId, message: `Elemento "${el.slotId}" ultrapassa a área do slide` });
    }
  }

  for (const pair of overlappingPairs(slide.elements)) {
    issues.push({
      code: "overlap",
      severity: "warning",
      message: `Elementos "${pair[0].slotId}" e "${pair[1].slotId}" se sobrepõem`,
    });
  }

  for (const el of slide.elements) {
    if (el.kind !== "text" || !el.text) continue;
    const ink = designSystem.palette.ink;
    const background = designSystem.palette.background;
    const isLarge = (el.fontSize ?? designSystem.typography.scale.body) >= 24;
    const ratio = contrastRatio(ink, background);
    if (ratio < (isLarge ? 3 : 4.5)) {
      issues.push({ code: "low_contrast", severity: "warning", slotId: el.slotId, message: `Contraste ${ratio.toFixed(2)}:1 abaixo do mínimo WCAG AA` });
    }
  }

  for (const slot of missingRequiredSlots(layout, slide)) {
    issues.push({ code: "missing_required", severity: "error", slotId: slot.id, message: `Slot obrigatório "${slot.id}" ficou sem conteúdo` });
  }

  const score = scoreFromIssues(issues);
  return { score, issues };
}

function overlappingPairs(elements: SlideElement[]): [SlideElement, SlideElement][] {
  const pairs: [SlideElement, SlideElement][] = [];
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      if (boxesOverlap(elements[i], elements[j])) pairs.push([elements[i], elements[j]]);
    }
  }
  return pairs;
}

function boxesOverlap(a: SlideElement, b: SlideElement): boolean {
  const ax2 = a.position.x + a.position.w;
  const ay2 = a.position.y + a.position.h;
  const bx2 = b.position.x + b.position.w;
  const by2 = b.position.y + b.position.h;
  const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.position.x, b.position.x));
  const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.position.y, b.position.y));
  const overlapArea = overlapX * overlapY;
  // Tolerância pequena (< 1% da área do slide) pra não sinalizar toque de
  // borda como sobreposição real.
  return overlapArea > 1;
}

function scoreFromIssues(issues: VisualQaIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    score -= issue.severity === "error" ? 15 : 6;
  }
  return Math.max(0, Math.min(100, score));
}
