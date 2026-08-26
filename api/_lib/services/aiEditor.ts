import { fitText } from "./contentFitEngine";
import { isWithinSafeArea } from "./gridEngine";
import type { EditCommandResult, EditContent, EditOp, NewElementSpec } from "../schemas/ai";
import type { Canvas, Layout, Slot, SlotPosition } from "../schemas/template";
import type { Slide, SlideElement } from "../schemas/presentation";

// Checagem referencial — mesmo princípio de sanitizeContentMap: um op que
// referencia um slotId inexistente no layout é descartado, não derruba o
// comando inteiro.
export function sanitizeEditCommand(result: EditCommandResult, layout: Layout): EditCommandResult {
  const validIds = new Set(layout.slots.map((s) => s.id));
  return {
    ...result,
    ops: result.ops.filter((op) => !op.slotId || validIds.has(op.slotId)),
  };
}

export interface ApplyEditParams {
  slide: Slide;
  layout: Layout;
  ops: EditOp[];
  // replace_image resolve a URL fora deste módulo puro (precisa de
  // mediaService) — o chamador informa a URL/mediaId já resolvidos por op.
  resolvedImages?: Record<string, { url: string; mediaId: string }>;
}

// Section P1#1 (aiEditable) — resultado de UMA operação, usado pelo
// orquestrador pra decidir se pode fazer commit (regra fundamental do AI
// Editor: toda operação precisa produzir efeito verificável — seção P0#2).
export interface OpOutcome {
  op: EditOp;
  applied: boolean;
  reason?: string;
}

export interface ApplyEditResult {
  slide: Slide;
  outcomes: OpOutcome[];
}

const LIST_ROLES = new Set(["bullet_list", "numbered_list"]);
const STAT_ROLES = new Set(["statistic", "percentage", "currency"]);

// Puro — aplica cada op e reporta se ela de fato mudou o slide, pra o
// orquestrador nunca fazer commit de um "sucesso" que não alterou nada
// (regra fundamental do AI Editor, seção P0#2). `aiEditable=false` bloqueia
// QUALQUER ação sobre aquele slot — distinto de `locked` (bloqueio
// estrutural/manual, não tratado aqui).
export function applyEditOpsWithReport(params: ApplyEditParams): ApplyEditResult {
  const resolvedImages = params.resolvedImages ?? {};
  let elements = [...params.slide.elements];
  const outcomes: OpOutcome[] = [];

  for (const op of params.ops) {
    const before = elements;

    if (op.slotId) {
      const slot = params.layout.slots.find((s) => s.id === op.slotId);
      if (slot && slot.aiEditable === false) {
        outcomes.push({ op, applied: false, reason: "Este elemento está protegido contra edição por IA." });
        continue;
      }
    }

    const { elements: after, reason } = applyOpChecked(op, before, params.layout, resolvedImages);
    const applied = !reason && !sameElements(before, after);
    outcomes.push({
      op,
      applied,
      reason: reason ?? (applied ? undefined : "A operação não produziu nenhuma alteração no slide."),
    });
    elements = after;
  }

  return { slide: { ...params.slide, elements }, outcomes };
}

// Mantido pra compatibilidade com os chamadores/testes existentes que só
// querem o slide resultante, sem o relatório por operação.
export function applyEditOps(params: ApplyEditParams): Slide {
  return applyEditOpsWithReport(params).slide;
}

function sameElements(a: SlideElement[], b: SlideElement[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyOpChecked(
  op: EditOp,
  elements: SlideElement[],
  layout: Layout,
  resolvedImages: Record<string, { url: string; mediaId: string }>,
): { elements: SlideElement[]; reason?: string } {
  switch (op.action) {
    case "set_text": {
      if (!op.slotId || op.value === undefined) return { elements, reason: "set_text exige slotId e value." };
      const slot = layout.slots.find((s) => s.id === op.slotId);
      if (!slot) return { elements, reason: `Slot "${op.slotId}" não existe no layout.` };
      return {
        elements: elements.map((el) => {
          if (el.slotId !== op.slotId) return el;
          const fit = fitText(op.value!, slot, el.fontSize ?? 18);
          return { ...el, text: fit.text, fontSize: fit.fontSize, overflow: fit.overflow };
        }),
      };
    }
    case "replace_image": {
      if (!op.slotId) return { elements, reason: "replace_image exige slotId." };
      const image = resolvedImages[op.slotId];
      if (!image) return { elements, reason: "Nenhuma mídia resolvida pra este slot." };
      return { elements: elements.map((el) => (el.slotId === op.slotId ? { ...el, imageUrl: image.url, imageMediaId: image.mediaId } : el)) };
    }
    case "remove_element": {
      if (!op.slotId) return { elements, reason: "remove_element exige slotId." };
      if (!elements.some((el) => el.slotId === op.slotId)) return { elements, reason: `Slot "${op.slotId}" já não tem elemento pra remover.` };
      return { elements: elements.filter((el) => el.slotId !== op.slotId) };
    }
    case "adjust_style": {
      if (!op.slotId || !op.value) return { elements, reason: "adjust_style exige slotId e value." };
      const direction = op.value.toLowerCase();
      if (direction !== "larger" && direction !== "smaller") return { elements, reason: `Direção de estilo desconhecida: "${op.value}".` };
      let touched = false;
      const next = elements.map((el) => {
        if (el.slotId !== op.slotId || el.fontSize === undefined) return el;
        touched = true;
        const delta = direction === "larger" ? 1.1 : 0.9;
        return { ...el, fontSize: Math.max(12, Math.round(el.fontSize * delta)) };
      });
      return touched ? { elements: next } : { elements, reason: `Slot "${op.slotId}" não tem fontSize pra ajustar.` };
    }
    case "regenerate_content": {
      if (!op.slotId || !op.content) return { elements, reason: "regenerate_content exige slotId e content." };
      const slot = layout.slots.find((s) => s.id === op.slotId);
      if (!slot) return { elements, reason: `Slot "${op.slotId}" não existe no layout.` };
      const existing = elements.find((el) => el.slotId === op.slotId);
      const built = buildElementForSlot(slot, op.content, existing?.position ?? slot.position);
      if (!built) {
        return {
          elements,
          reason: `O conteúdo enviado não é compatível com o tipo do slot "${op.slotId}" (kind="${slot.kind}", role="${slot.role}").`,
        };
      }
      return {
        elements: existing ? elements.map((el) => (el.slotId === op.slotId ? built : el)) : [...elements, built],
      };
    }
    case "add_element": {
      if (!op.newElement) return { elements, reason: "add_element exige newElement." };
      if (!hasRenderableContent(op.newElement)) {
        return { elements, reason: "add_element sem conteúdo (texto, lista, estatística, gráfico ou tabela) — nada pra mostrar." };
      }
      const placed = placeNewElement(op.newElement, elements, layout.canvas);
      if (!placed) {
        return {
          elements,
          reason: "Não havia espaço válido no slide pra encaixar o novo elemento sem sobrepor outro ou sair da área do slide.",
        };
      }
      return { elements: [...elements, placed] };
    }
    default:
      return { elements, reason: `Ação desconhecida: "${op.action}".` };
  }
}

// Puro — a IA propõe conteúdo pro tipo do slot que ela mesma recebeu
// (kind/role vêm do layout, imutáveis nesta operação); aqui só decide se o
// conteúdo enviado bate com o que aquele slot sabe exibir. Mesmo critério
// de ramificação por kind/role que o Slide Composer usa.
function buildElementForSlot(slot: Slot, content: EditContent, position: SlotPosition): SlideElement | null {
  const base = { slotId: slot.id, kind: slot.kind, role: slot.role, position, overflow: false as const };

  if (slot.kind === "chart" && content.dataPoints && content.dataPoints.length > 0) {
    return { ...base, chartTitle: content.chartTitle, dataPoints: content.dataPoints };
  }
  if (slot.kind === "table" && content.tableRows && content.tableRows.length > 0) {
    return { ...base, tableRows: content.tableRows };
  }
  if (LIST_ROLES.has(slot.role) && content.listItems && content.listItems.length > 0) {
    return { ...base, listItems: content.listItems };
  }
  if (STAT_ROLES.has(slot.role) && content.statValue) {
    return { ...base, statValue: content.statValue };
  }
  if (slot.kind === "text" && content.textValue) {
    const fit = fitText(content.textValue, slot, slot.fontSize ?? 18);
    return { ...base, text: fit.text, fontSize: fit.fontSize, overflow: fit.overflow };
  }
  return null;
}

const DEFAULT_NEW_ELEMENT_SIZE = { w: 28, h: 30 };
// Grade grosseira de posições candidatas (4 colunas x 3 linhas, com margem
// de 5%) — fallback determinístico quando a posição proposta pela IA (ou a
// ausência de uma) não cabe sem sobrepor nada. Não é bin-packing real, só
// o suficiente pra achar UM lugar válido sem forçar uma composição ruim.
function candidatePositions(spec: NewElementSpec): SlotPosition[] {
  const size = spec.position ? { w: spec.position.w, h: spec.position.h } : DEFAULT_NEW_ELEMENT_SIZE;
  const candidates: SlotPosition[] = [];
  if (spec.position) candidates.push(spec.position);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      candidates.push({ x: 5 + col * (90 / 4), y: 5 + row * (90 / 3), w: size.w, h: size.h });
    }
  }
  return candidates;
}

function hasRenderableContent(spec: NewElementSpec): boolean {
  return Boolean(
    spec.textValue || (spec.listItems && spec.listItems.length > 0) || spec.statValue ||
      (spec.dataPoints && spec.dataPoints.length > 0) || (spec.tableRows && spec.tableRows.length > 0),
  );
}

function positionsOverlap(a: SlotPosition, b: SlotPosition): boolean {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const overlapX = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  return overlapX * overlapY > 1; // mesma tolerância de borda do Visual QA
}

function placeNewElement(spec: NewElementSpec, existing: SlideElement[], canvas: Canvas): SlideElement | null {
  for (const candidate of candidatePositions(spec)) {
    if (!isWithinSafeArea(canvas, candidate)) continue;
    if (existing.some((el) => positionsOverlap(el.position, candidate))) continue;
    return buildNewElement(spec, candidate, existing.length);
  }
  return null;
}

function buildNewElement(spec: NewElementSpec, position: SlotPosition, index: number): SlideElement {
  const base = { slotId: `ai_${spec.role.replace(/\s+/g, "_")}_${index}`, kind: spec.kind, role: spec.role, position, overflow: false as const };

  if (spec.kind === "chart" && spec.dataPoints && spec.dataPoints.length > 0) {
    return { ...base, chartTitle: spec.chartTitle, dataPoints: spec.dataPoints };
  }
  if (spec.kind === "table" && spec.tableRows && spec.tableRows.length > 0) {
    return { ...base, tableRows: spec.tableRows };
  }
  if (spec.listItems && spec.listItems.length > 0) {
    return { ...base, listItems: spec.listItems };
  }
  if (spec.statValue) {
    return { ...base, statValue: spec.statValue };
  }
  if (spec.textValue) {
    return { ...base, text: spec.textValue };
  }
  return base;
}
