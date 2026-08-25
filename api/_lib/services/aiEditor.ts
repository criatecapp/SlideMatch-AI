import { fitText } from "./contentFitEngine";
import type { EditCommandResult, EditOp } from "../schemas/ai";
import type { Layout } from "../schemas/template";
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

// Puro — aplica só os ops pedidos, nunca regenera o slide inteiro. "Se o
// usuário pedir 'troque a imagem', NÃO altere título, cores, posição ou
// tipografia" (section 17) fica garantido estruturalmente: cada op só toca
// o campo que sua action declara.
export function applyEditOps(params: ApplyEditParams): Slide {
  let elements = [...params.slide.elements];

  for (const op of params.ops) {
    elements = applyOp(op, elements, params.layout, params.resolvedImages ?? {});
  }

  return { ...params.slide, elements };
}

function applyOp(op: EditOp, elements: SlideElement[], layout: Layout, resolvedImages: Record<string, { url: string; mediaId: string }>): SlideElement[] {
  switch (op.action) {
    case "set_text": {
      if (!op.slotId || op.value === undefined) return elements;
      const slot = layout.slots.find((s) => s.id === op.slotId);
      if (!slot) return elements;
      return elements.map((el) => {
        if (el.slotId !== op.slotId) return el;
        const fit = fitText(op.value!, slot, el.fontSize ?? 18);
        return { ...el, text: fit.text, fontSize: fit.fontSize, overflow: fit.overflow };
      });
    }
    case "replace_image": {
      if (!op.slotId) return elements;
      const image = resolvedImages[op.slotId];
      if (!image) return elements;
      return elements.map((el) => (el.slotId === op.slotId ? { ...el, imageUrl: image.url, imageMediaId: image.mediaId } : el));
    }
    case "remove_element": {
      if (!op.slotId) return elements;
      return elements.filter((el) => el.slotId !== op.slotId);
    }
    case "adjust_style": {
      if (!op.slotId || !op.value) return elements;
      const direction = op.value.toLowerCase();
      if (direction !== "larger" && direction !== "smaller") return elements;
      return elements.map((el) => {
        if (el.slotId !== op.slotId || el.fontSize === undefined) return el;
        const delta = direction === "larger" ? 1.1 : 0.9;
        return { ...el, fontSize: Math.max(12, Math.round(el.fontSize * delta)) };
      });
    }
    // regenerate_content e add_element precisam de uma nova chamada de IA
    // (Content Mapper) ou de dados do slot que não cabem numa função pura —
    // o orquestrador trata esses dois fora daqui.
    default:
      return elements;
  }
}
