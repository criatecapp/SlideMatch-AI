import type { ContentMap } from "../schemas/ai";
import type { Layout } from "../schemas/template";

// Checagem referencial que Zod não faz sozinho: slotId precisa existir de
// verdade no layout escolhido. Puro, sem I/O — degradação graciosa (descarta
// a atribuição inválida, não derruba o mapeamento inteiro), mesmo padrão já
// provado em sanitizeDesignDirection/matchSlideImages de gerações anteriores
// deste sistema.
export function sanitizeContentMap(map: ContentMap, layout: Layout): ContentMap {
  const validIds = new Set(layout.slots.map((s) => s.id));
  return {
    slotAssignments: map.slotAssignments.filter((a) => validIds.has(a.slotId)),
  };
}
