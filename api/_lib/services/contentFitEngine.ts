import type { Slot } from "../schemas/template";

export interface FitResult {
  text: string;
  fontSize: number;
  overflow: boolean;
}

// Piso de fonte — nunca deixa a IA (ou este motor) espremer texto abaixo de
// algo legível só pra caber. "Nunca simplesmente diminua a fonte para 8px."
const MIN_FONT_SIZE = 12;
const MIN_SHRINK_RATIO = 0.6; // não encolhe a fonte abaixo de 60% do base

// Puro e determinístico — dado um texto e o slot que vai recebê-lo, decide
// como fazer caber. Ordem de prioridade (section 14):
//   1. preservar layout (texto cabe como está → não mexe em nada)
//   2/5. encolher fonte dentro do piso mínimo
//   3. truncar como último recurso, sinalizando overflow=true — quem chama
//      (Slide Composer) decide se cria um slide extra ou aceita o corte.
// Quebra de linha/espaçamento (passos 3-4 do spec) ficam a cargo do
// Renderer, que já quebra linha automaticamente dentro da caixa.
export function fitText(value: string, slot: Slot, baseFontSize: number): FitResult {
  const maxChars = slot.maxCharacters;
  if (!maxChars || value.length <= maxChars) {
    return { text: value, fontSize: baseFontSize, overflow: false };
  }

  const scale = maxChars / value.length;
  const floor = Math.max(MIN_FONT_SIZE, Math.round(baseFontSize * MIN_SHRINK_RATIO));

  if (scale >= MIN_SHRINK_RATIO) {
    const fontSize = Math.max(floor, Math.round(baseFontSize * scale));
    return { text: value, fontSize, overflow: false };
  }

  const truncated = value.slice(0, Math.max(0, maxChars - 1)).trimEnd() + "…";
  return { text: truncated, fontSize: floor, overflow: true };
}

// Estima se um bloco de texto excede o espaço vertical do slot considerando
// linhas — usado pelo Slide Composer pra decidir se um slot precisa de
// overflowBehavior "new_slide" em vez de encolher/truncar.
export function estimateLineCount(value: string, approxCharsPerLine: number): number {
  if (approxCharsPerLine <= 0) return 1;
  return Math.max(1, Math.ceil(value.length / approxCharsPerLine));
}

export function exceedsMaxLines(value: string, slot: Slot, approxCharsPerLine: number): boolean {
  if (!slot.maxLines) return false;
  return estimateLineCount(value, approxCharsPerLine) > slot.maxLines;
}
