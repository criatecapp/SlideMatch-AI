import { getAiSettings } from "./settingsService";
import { getProject } from "./projectService";
import { listMedia } from "./mediaService";
import { getTemplate, listTemplates } from "./templateService";
import { commitVersion, getPresentation, updatePresentation } from "./presentationService";
import { rankLayouts } from "./templateMatcher";
import { normalizePlanSections } from "./planNormalizer";
import { sanitizeContentMap } from "./contentMapper";
import { resolveImagesForLayout } from "./imageResolver";
import { composeSlide } from "./slideComposer";
import { runVisualQa, type VisualQaIssue } from "./visualQa";
import { logError, logGeneration } from "./aiLogging";
import { ValidationAppError } from "../errors";
import type { AIProvider } from "../providers/aiProvider";
import type { ContentAnalysis, DesignDirection, ImageAnalysis, PlanSection, PresentationPlan } from "../schemas/ai";
import type { Layout, Template } from "../schemas/template";
import type { Presentation, Slide } from "../schemas/presentation";

export interface GenerationResult {
  presentation: Presentation;
  slides: Slide[];
  qaIssues: VisualQaIssue[];
}

// O fluxo principal (section 27) inteiro, ponta a ponta. Cada etapa é
// opcional via feature flag (settings.features) — desligar uma não quebra
// as outras, só pula o refinamento que ela ofereceria.
export async function generatePresentation(ownerId: string, presentationId: string, provider: AIProvider): Promise<GenerationResult> {
  const settings = await getAiSettings();
  const presentation = await getPresentation(ownerId, presentationId);
  const project = await getProject(ownerId, presentation.projectId);

  try {
    await updatePresentation(ownerId, presentationId, { status: "analyzing" });

    // 1. Content Analyzer
    let contentAnalysis: ContentAnalysis;
    if (settings.features.contentAnalysis) {
      contentAnalysis = await provider.analyzeContent({
        text: project.content || project.description,
        objective: project.objective,
        audience: project.audience,
        style: project.style,
      });
      await logGeneration(ownerId, presentationId, "content_analysis", { objective: project.objective }, contentAnalysis);
    } else {
      contentAnalysis = { topic: project.title, audience: project.audience, tone: project.style, summary: project.description, keyPoints: [], suggestedPurposes: [] };
    }

    // 2. Image Intelligence
    const mediaItems = await listMedia(ownerId, presentation.projectId);
    let imageAnalysis: ImageAnalysis[] = [];
    if (settings.features.imageAnalysis && mediaItems.length > 0) {
      imageAnalysis = await provider.analyzeImages({ images: mediaItems.map((m) => ({ mediaId: m.id, url: m.url })) });
      await logGeneration(ownerId, presentationId, "image_analysis", { count: mediaItems.length }, imageAnalysis);
    }
    const urlByMediaId = Object.fromEntries(mediaItems.filter((m) => m.url).map((m) => [m.id, m.url as string]));

    // 3. Template Matcher precisa de UM template escolhido (biblioteca de
    // layouts) — a escolha de QUAL template ainda não é orientada por IA
    // nesta versão (fica como próxima fase: pontuar templates inteiros
    // como o gerador anterior fazia); por ora usa o explicitamente
    // escolhido ou o primeiro ativo disponível, documentado como
    // simplificação deliberada.
    const template = await resolveTemplate(presentation.templateId);

    // 4. Presentation Planner
    let plan: PresentationPlan;
    if (settings.features.presentationPlanning) {
      plan = await provider.planPresentation({ contentAnalysis, constraints: { minSlides: project.minSlides, maxSlides: project.maxSlides } });
      await logGeneration(ownerId, presentationId, "presentation_plan", { constraints: { minSlides: project.minSlides, maxSlides: project.maxSlides } }, plan);
    } else {
      plan = { slideCount: project.minSlides, reasoning: "Planning desativado — usando minSlides seções genéricas", sections: Array.from({ length: project.minSlides }, (_, i) => ({ order: i, purpose: "content", contentType: "text" as const, estimatedImages: 0, textDensity: "medium" as const })) };
    }
    // A IA pode devolver `order` em qualquer numeração — todo consumidor
    // depois daqui (Slide Composer, AI Editor por slideOrder, frontend)
    // espera 0..n-1 contíguo.
    plan = normalizePlanSections(plan);

    // 5. Art Director
    let designDirection: DesignDirection | null = null;
    if (settings.features.artDirection) {
      designDirection = await provider.planArtDirection({ contentAnalysis, presentationPlan: plan });
      await logGeneration(ownerId, presentationId, "art_direction", {}, designDirection);
    }

    await updatePresentation(ownerId, presentationId, { status: "generating", contentAnalysis, presentationPlan: plan, designDirection });

    // 6-9. Template Matcher → Content Mapper → Slide Composer → Visual QA,
    // por seção, com correção automática (section 20).
    const usedMediaIds = new Set<string>();
    const slides: Slide[] = [];
    const allIssues: VisualQaIssue[] = [];

    for (const section of plan.sections) {
      const outcome = await composeSectionWithRetries({
        ownerId, presentationId, section, template, contentAnalysis, imageAnalysis, urlByMediaId, usedMediaIds,
        designDirection, provider, maxAttempts: settings.visualQa.maxAttempts, threshold: settings.visualQa.threshold,
        featureMapping: settings.features.contentMapping,
      });
      if (outcome) {
        slides.push(outcome.slide);
        allIssues.push(...outcome.qa.issues);
      }
    }

    // Terminar com 0 slides depois de planejar N seções não é sucesso —
    // é o template escolhido não ter nenhum layout usável. Section 34:
    // nunca deixar isso passar como "generated" silencioso.
    if (slides.length === 0 && plan.sections.length > 0) {
      throw new ValidationAppError(
        `Nenhum slide pôde ser composto — o template "${template.name}" não tem nenhum layout com slots. Adicione ao menos um layout com slots ao template antes de gerar.`,
      );
    }

    const visualQaScore = { overall: averageScore(slides, allIssues), issueCount: allIssues.length, issues: allIssues.slice(0, 50) };

    await commitVersion(ownerId, presentationId, slides, "ai", "Geração inicial via IA");
    const final = await updatePresentation(ownerId, presentationId, { status: "generated", visualQaScore });

    return { presentation: final, slides, qaIssues: allIssues };
  } catch (err: any) {
    await logError(ownerId, presentationId, "generate", err?.message ?? String(err));
    await updatePresentation(ownerId, presentationId, { status: "failed", lastError: err?.message ?? String(err) });
    throw err;
  }
}

async function resolveTemplate(templateId: string | null): Promise<Template> {
  if (templateId) return getTemplate(templateId);
  const templates = await listTemplates(true);
  if (templates.length === 0) throw new ValidationAppError("Nenhum template ativo disponível. Crie um template antes de gerar.");
  return templates[0];
}

interface SectionOutcome {
  slide: Slide;
  qa: ReturnType<typeof runVisualQa>;
  layout: Layout;
}

async function composeSectionWithRetries(params: {
  ownerId: string;
  presentationId: string;
  section: PlanSection;
  template: Template;
  contentAnalysis: ContentAnalysis;
  imageAnalysis: ImageAnalysis[];
  urlByMediaId: Record<string, string>;
  usedMediaIds: Set<string>;
  designDirection: DesignDirection | null;
  provider: AIProvider;
  maxAttempts: number;
  threshold: number;
  featureMapping: boolean;
}): Promise<SectionOutcome | null> {
  const ranked = rankLayouts(params.section, params.template.layouts, params.imageAnalysis.length, params.designDirection ?? undefined);
  if (ranked.length === 0) {
    await logError(params.ownerId, params.presentationId, "template_match", `Nenhum layout disponível pra seção "${params.section.purpose}"`);
    return null;
  }

  let best: SectionOutcome | null = null;

  for (let attempt = 0; attempt < Math.min(params.maxAttempts, ranked.length); attempt++) {
    const layout = ranked[attempt].layout;

    let contentMap = { slotAssignments: [] as { slotId: string; textValue?: string }[] };
    if (params.featureMapping) {
      const raw = await params.provider.mapContentToSlots({
        contentAnalysis: params.contentAnalysis,
        section: { order: params.section.order, purpose: params.section.purpose, contentType: params.section.contentType },
        layout,
        availableImages: params.imageAnalysis,
      });
      contentMap = sanitizeContentMap(raw, layout);
      await logGeneration(params.ownerId, params.presentationId, "content_map", { section: params.section.order, layoutId: layout.id }, contentMap);
    }

    const resolvedImages = resolveImagesForLayout(layout, params.imageAnalysis, params.urlByMediaId, params.usedMediaIds);
    const slide = composeSlide({
      order: params.section.order,
      purpose: params.section.purpose,
      layout,
      designSystem: params.template.designSystem,
      contentMap,
      resolvedImages,
    });

    const qa = runVisualQa(slide, layout, params.template.designSystem);
    if (!best || qa.score > best.qa.score) best = { slide, qa, layout };
    if (qa.score >= params.threshold) return best;

    // Corrigiu não o suficiente — libera as imagens usadas nesta tentativa
    // pra próxima tentativa poder escolher de novo (evita "gastar" a
    // imagem boa numa composição que vai ser descartada).
    for (const img of resolvedImages) params.usedMediaIds.delete(img.mediaId);
  }

  // Reaplica o uso de imagem da MELHOR tentativa (a última liberação acima
  // pode ter sido a vencedora).
  if (best) {
    for (const el of best.slide.elements) {
      if (el.kind === "image" && el.imageMediaId) params.usedMediaIds.add(el.imageMediaId);
    }
  }

  return best;
}

function averageScore(slides: Slide[], issues: VisualQaIssue[]): number {
  if (slides.length === 0) return 0;
  // Recalcula a partir das issues coletadas globalmente seria impreciso por
  // slide; como runVisualQa já roda por slide dentro do loop de tentativas,
  // aqui só penaliza a média-base pela quantidade total de issues restantes.
  const penalty = Math.min(60, issues.length * 5);
  return Math.max(0, 100 - penalty);
}
