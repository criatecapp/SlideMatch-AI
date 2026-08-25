import type { PresentationPlan } from "../schemas/ai";

// A IA devolve `order` como um inteiro qualquer (schema só exige int ≥ 0,
// sem garantir início em 0 nem contiguidade) — mas todo consumidor rio
// abaixo (Slide Composer, AI Editor por slideOrder, o frontend) trata
// `order` como o índice 0-based real do slide na apresentação. Puro,
// determinístico: ordena pelo `order` que a IA deu e reatribui 0..n-1,
// preservando a ordem relativa pretendida sem herdar os valores brutos.
export function normalizePlanSections(plan: PresentationPlan): PresentationPlan {
  const sorted = [...plan.sections].sort((a, b) => a.order - b.order);
  return { ...plan, sections: sorted.map((section, i) => ({ ...section, order: i })) };
}
