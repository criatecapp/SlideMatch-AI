import type { DesignDirection, PlanSection } from "../schemas/ai";
import type { Layout } from "../schemas/template";

export interface LayoutMatch {
  layout: Layout;
  score: number; // 0-100
  reasoning: string;
}

const CONTENT_TYPE_PREFERRED_ROLES: Record<string, string[]> = {
  data: ["statistic", "percentage", "currency", "chart", "table"],
  list: ["bullet_list", "numbered_list"],
  quote: ["quote"],
  timeline: ["timeline"],
  image: ["image", "logo"],
};

// Puro, sem I/O e sem IA — "nunca dependa exclusivamente da IA" (section 8)
// aplicado ao Template Matcher inteiro: a escolha de layout é 100%
// determinística a partir de sinais objetivos (quantidade de imagens,
// tipos de slot disponíveis, densidade de texto).
export function matchLayout(
  section: PlanSection,
  layouts: Layout[],
  availableImageCount: number,
  designDirection?: DesignDirection,
): LayoutMatch | null {
  if (layouts.length === 0) return null;

  const scored = layouts.map((layout) => scoreLayout(section, layout, availableImageCount, designDirection));
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

export function rankLayouts(
  section: PlanSection,
  layouts: Layout[],
  availableImageCount: number,
  designDirection?: DesignDirection,
): LayoutMatch[] {
  return layouts.map((layout) => scoreLayout(section, layout, availableImageCount, designDirection)).sort((a, b) => b.score - a.score);
}

function scoreLayout(section: PlanSection, layout: Layout, availableImageCount: number, designDirection?: DesignDirection): LayoutMatch {
  const reasons: string[] = [];
  let score = 50; // baseline — qualquer layout serve até prova em contrário

  const imageSlots = layout.slots.filter((s) => s.kind === "image").length;
  const textSlots = layout.slots.filter((s) => s.kind === "text").length;

  // Ajuste por quantidade de imagens disponíveis vs. slots de imagem.
  const imageDelta = Math.abs(section.estimatedImages - imageSlots);
  if (imageDelta === 0) {
    score += 20;
    reasons.push(`${imageSlots} slot(s) de imagem batem com o estimado`);
  } else {
    score -= Math.min(20, imageDelta * 8);
    reasons.push(`diferença de ${imageDelta} entre imagens estimadas e slots de imagem`);
  }
  if (imageSlots > 0 && availableImageCount === 0) {
    score -= 15;
    reasons.push("layout pede imagem mas nenhuma está disponível");
  }

  // Ajuste por contentType → papéis preferidos presentes no layout.
  const preferredRoles = CONTENT_TYPE_PREFERRED_ROLES[section.contentType];
  if (preferredRoles) {
    const hasPreferred = layout.slots.some((s) => preferredRoles.includes(s.role));
    if (hasPreferred) {
      score += 20;
      reasons.push(`possui slot de papel adequado a contentType=${section.contentType}`);
    } else {
      score -= 15;
      reasons.push(`sem slot de papel adequado a contentType=${section.contentType}`);
    }
  } else if (section.contentType === "text" || section.contentType === "mixed") {
    if (textSlots > 0) {
      score += 10;
      reasons.push("possui slots de texto");
    }
  }

  // Ajuste por densidade de texto — alta densidade prefere layouts com
  // mais capacidade de texto (maxCharacters somado maior).
  const textCapacity = layout.slots
    .filter((s) => s.kind === "text")
    .reduce((sum, s) => sum + (s.maxCharacters ?? 400), 0);
  if (section.textDensity === "high" && textCapacity < 300) {
    score -= 10;
    reasons.push("pouca capacidade de texto pra densidade alta");
  }
  if (section.textDensity === "low" && textSlots > 3) {
    score -= 5;
    reasons.push("muitos slots de texto pra densidade baixa");
  }

  // Art Director (section 15) influencia a escolha sem desenhar nada: em
  // densidade baixa prefere layouts enxutos (poucos slots), em densidade
  // alta prefere layouts com mais capacidade.
  if (designDirection) {
    if (designDirection.density === "low" && layout.slots.length > 3) {
      score -= 10;
      reasons.push("direção pede densidade baixa e o layout tem muitos slots");
    }
    if (designDirection.density === "high" && layout.slots.length <= 2) {
      score -= 5;
      reasons.push("direção pede densidade alta e o layout tem poucos slots");
    }
    if (designDirection.imageTreatment.toLowerCase().includes("full_bleed") && imageSlots > 0) {
      const fullBleedFit = layout.slots.find((s) => s.kind === "image")!.position;
      if (fullBleedFit.w >= 90 && fullBleedFit.h >= 90) {
        score += 10;
        reasons.push("slot de imagem ocupa quase todo o slide, combina com full_bleed");
      }
    }
  }

  return {
    layout,
    score: Math.max(0, Math.min(100, score)),
    reasoning: reasons.join("; "),
  };
}
