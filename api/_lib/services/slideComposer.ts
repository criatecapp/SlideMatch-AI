import { fitText } from "./contentFitEngine";
import { resolveGridPosition } from "./gridEngine";
import type { ContentMap } from "../schemas/ai";
import type { DesignSystem, Layout, Slot, TypeScale } from "../schemas/template";
import type { Slide, SlideElement } from "../schemas/presentation";

export interface ResolvedImage {
  slotId: string;
  url: string;
  mediaId: string;
}

const LIST_ROLES = new Set(["bullet_list", "numbered_list"]);
const STAT_ROLES = new Set(["statistic", "percentage", "currency"]);
const CAPTION_ROLES = new Set(["caption", "label", "badge"]);

function baseFontSizeForRole(scale: TypeScale, role: string): number {
  if (role === "title") return scale.title;
  if (role === "subtitle") return scale.subtitle;
  if (role === "heading") return scale.heading;
  if (STAT_ROLES.has(role)) return scale.statistic;
  if (CAPTION_ROLES.has(role)) return scale.caption;
  return scale.body;
}

// Determinístico — mesma entrada sempre produz a mesma saída (section 21).
// Não inventa conteúdo: um slot required sem atribuição correspondente
// simplesmente não entra em `elements` — a etapa anterior (Content Mapper)
// é quem decide o que existe, o Composer só posiciona e ajusta.
export function composeSlide(params: {
  order: number;
  purpose: string;
  layout: Layout;
  designSystem: DesignSystem;
  contentMap: ContentMap;
  resolvedImages?: ResolvedImage[];
}): Slide {
  const { order, purpose, layout, designSystem, contentMap, resolvedImages = [] } = params;
  const assignmentBySlot = new Map(contentMap.slotAssignments.map((a) => [a.slotId, a]));
  const imageBySlot = new Map(resolvedImages.map((i) => [i.slotId, i]));

  const elements: SlideElement[] = [];

  for (const slot of layout.slots) {
    const position = slot.gridPlacement
      ? resolveGridPosition(designSystem.grid, layout.canvas, slot.gridPlacement)
      : slot.position;

    if (slot.kind === "image") {
      const image = imageBySlot.get(slot.id);
      if (!image) continue; // sem imagem resolvida: slot fica ausente, não vira placeholder vazio
      elements.push({
        slotId: slot.id,
        kind: slot.kind,
        role: slot.role,
        position,
        imageUrl: image?.url ?? null,
        imageMediaId: image?.mediaId,
        overflow: false,
      });
      continue;
    }

    const assignment = assignmentBySlot.get(slot.id);
    if (!assignment) continue;

    if (slot.kind === "chart" && assignment.dataPoints && assignment.dataPoints.length > 0) {
      elements.push({ slotId: slot.id, kind: slot.kind, role: slot.role, position, chartTitle: assignment.chartTitle, dataPoints: assignment.dataPoints, overflow: false });
      continue;
    }

    if (slot.kind === "table" && assignment.tableRows && assignment.tableRows.length > 0) {
      // Mesma lógica da lista: linha de cabeçalho não conta como "linha de
      // conteúdo" pro limite de maxLines.
      const overflow = Boolean(slot.maxLines && assignment.tableRows.length - 1 > slot.maxLines);
      elements.push({ slotId: slot.id, kind: slot.kind, role: slot.role, position, tableRows: assignment.tableRows, overflow });
      continue;
    }

    if (LIST_ROLES.has(slot.role) && assignment.listItems) {
      // Cada item de lista ocupa ~1 linha — reaproveita o mesmo maxLines
      // do slot (já existe no schema, section 14) como piso de capacidade;
      // sem maxLines definido, mantém o comportamento anterior (nunca
      // sinaliza overflow). Isso é o que liga slideNeedsOverflowSlide a
      // listas grandes (P1#4) — antes disso, uma lista nunca sinalizava
      // overflow, por maior que fosse.
      const overflow = Boolean(slot.maxLines && assignment.listItems.length > slot.maxLines);
      elements.push({ slotId: slot.id, kind: slot.kind, role: slot.role, position, listItems: assignment.listItems, overflow });
      continue;
    }

    if (STAT_ROLES.has(slot.role) && assignment.statValue) {
      elements.push({ slotId: slot.id, kind: slot.kind, role: slot.role, position, statValue: assignment.statValue, overflow: false });
      continue;
    }

    if (assignment.textValue) {
      const baseFontSize = slot.fontSize ?? baseFontSizeForRole(designSystem.typography.scale, slot.role);
      const fit = fitText(assignment.textValue, slot, baseFontSize);
      elements.push({
        slotId: slot.id,
        kind: slot.kind,
        role: slot.role,
        position,
        text: fit.text,
        fontSize: fit.fontSize,
        overflow: fit.overflow,
      });
    }
  }

  return { order, layoutId: layout.id, purpose, elements };
}

// Um slide "excede o espaço": pelo menos um elemento sofreu truncamento
// (overflow=true) mesmo depois do Content Fit Engine já ter tentado
// encolher a fonte. Sinal pro orquestrador decidir se cria slide extra
// (prioridade 8 do section 14) — o Composer não decide isso sozinho.
export function slideNeedsOverflowSlide(slide: Slide): boolean {
  return slide.elements.some((e) => e.overflow);
}

// P1#4 — conecta slideNeedsOverflowSlide a uma ação real: divide o
// elemento que estourou em dois, SE ele for uma coleção divisível
// (lista/tabela — cada item "cabe" ou "não cabe" independente dos
// vizinhos). Texto solto (título/parágrafo) não é dividido — não existe
// um jeito seguro de partir uma frase ao meio sem IA, e um leve excesso
// de título já é resolvido pelo Content Fit Engine (encolher/truncar);
// forçar slide extra pra isso violaria "não force fonte ilegível pra
// evitar slide extra" ao contrário — forçaria slide extra desnecessário.
// `layout` fornece o `maxLines` do slot (mesmo campo que já sinalizou o
// overflow em composeSlide) — é o piso que decide onde cortar.
export function splitOverflowSlide(slide: Slide, layout: Layout): { primary: Slide; overflow: Slide | null } {
  const target = slide.elements.find((el) => el.overflow && (el.listItems || (el.tableRows && el.tableRows.length > 0)));
  if (!target) return { primary: slide, overflow: null };

  const slot = layout.slots.find((s) => s.id === target.slotId);
  const maxLines = slot?.maxLines;
  if (!maxLines) return { primary: slide, overflow: null }; // sem limite conhecido, não há onde cortar com segurança

  if (target.listItems) {
    const primaryItems = target.listItems.slice(0, maxLines);
    const restItems = target.listItems.slice(maxLines);
    if (restItems.length === 0) return { primary: slide, overflow: null };
    return {
      primary: withElement(slide, target.slotId, { listItems: primaryItems, overflow: false }),
      overflow: continuationSlide(slide, target.slotId, { listItems: restItems, overflow: restItems.length > maxLines }),
    };
  }

  if (target.tableRows && target.tableRows.length > 0) {
    const [header, ...rows] = target.tableRows;
    const primaryRows = [header, ...rows.slice(0, maxLines)];
    const restRows = rows.slice(maxLines);
    if (restRows.length === 0) return { primary: slide, overflow: null };
    return {
      primary: withElement(slide, target.slotId, { tableRows: primaryRows, overflow: false }),
      overflow: continuationSlide(slide, target.slotId, { tableRows: [header, ...restRows], overflow: restRows.length > maxLines }),
    };
  }

  return { primary: slide, overflow: null };
}

function withElement(slide: Slide, slotId: string, patch: Partial<SlideElement>): Slide {
  return { ...slide, elements: slide.elements.map((el) => (el.slotId === slotId ? { ...el, ...patch } : el)) };
}

function continuationSlide(original: Slide, slotId: string, patch: Partial<SlideElement>): Slide {
  return {
    order: original.order, // renumerado pelo chamador junto com o resto da apresentação
    layoutId: original.layoutId,
    purpose: `${original.purpose} (continuação)`,
    elements: original.elements.map((el) => (el.slotId === slotId ? { ...el, ...patch } : el)),
  };
}

export function missingRequiredSlots(layout: Layout, slide: Slide): Slot[] {
  const present = new Set(slide.elements.map((e) => e.slotId));
  return layout.slots.filter((s) => s.required && !present.has(s.id));
}
