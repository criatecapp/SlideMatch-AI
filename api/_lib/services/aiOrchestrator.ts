import { getAiSettings } from "./settingsService";
import { getProject } from "./projectService";
import { listMedia } from "./mediaService";
import { getTemplate, listTemplates } from "./templateService";
import { commitVersion, getPresentation, updatePresentation } from "./presentationService";
import { rankLayouts } from "./templateMatcher";
import { normalizePlanSections } from "./planNormalizer";
import { sanitizeContentMap } from "./contentMapper";
import { resolveImagesForLayout } from "./imageResolver";
import { composeSlide, slideNeedsOverflowSlide, splitOverflowSlide } from "./slideComposer";
import { runVisualQa, type VisualQaIssue } from "./visualQa";
import { runRenderQa, type MediaDimensions } from "./renderQa";
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
    // P1#1 — marca o início real da geração; se o processo morrer por
    // timeout antes do catch abaixo rodar, `getPresentation` (chamada em
    // toda leitura desta apresentação) detecta e recupera sozinha depois
    // de STALE_GENERATION_MS.
    await updatePresentation(ownerId, presentationId, { status: "analyzing", generationStartedAt: new Date().toISOString() });

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
    // Dimensão real da mídia — só o Render QA usa (P1#2: crop severo de
    // imagem precisa da proporção real, não só do que a IA estimou).
    const mediaDimensionsById: Record<string, MediaDimensions> = Object.fromEntries(
      mediaItems.map((m) => [m.id, { width: m.width, height: m.height }]),
    );

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
        featureMapping: settings.features.contentMapping, mediaDimensionsById,
      });
      if (!outcome) continue;

      allIssues.push(...outcome.qa.issues);
      if (outcome.renderQa) allIssues.push(...outcome.renderQa.issues);

      // P1#4 — se sobrou conteúdo (lista/tabela grande demais pro slot),
      // divide em slides de continuação em vez de aceitar o corte
      // silencioso. Texto solto que só encostou no limite não passa por
      // aqui (splitOverflowSlide devolve overflow:null pra esses casos) —
      // fica como o Content Fit já resolveu (encolher/truncar).
      let pending: Slide | null = outcome.slide;
      let splitGuard = 0;
      while (pending && slideNeedsOverflowSlide(pending) && splitGuard < 10) {
        splitGuard++;
        const { primary, overflow } = splitOverflowSlide(pending, outcome.layout);
        slides.push(primary);
        pending = overflow;
      }
      if (pending) slides.push(pending);
    }

    // Splits podem ter inserido slides extras no meio da sequência —
    // renumera pra manter `order` contíguo 0..n-1 (mesmo contrato que
    // normalizePlanSections já garante pro plano).
    slides.forEach((s, i) => { s.order = i; });

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
    const final = await updatePresentation(ownerId, presentationId, { status: "generated", visualQaScore, generationStartedAt: null });

    return { presentation: final, slides, qaIssues: allIssues };
  } catch (err: any) {
    await logError(ownerId, presentationId, "generate", err?.message ?? String(err));
    await updatePresentation(ownerId, presentationId, { status: "failed", lastError: err?.message ?? String(err), generationStartedAt: null });
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
  renderQa: Awaited<ReturnType<typeof runRenderQa>> | null;
}

// P1#3 — Auto-Fix: antes de trocar de layout (o fallback que já existia),
// classifica o motivo da falha e tenta UMA correção local, quando existe
// uma segura dentro da arquitetura atual:
//   missing_required → o Content Mapper é IA não-determinística; uma
//     segunda chamada pro MESMO layout é uma correção local legítima
//     (não muda nada estrutural, só dá outra chance da IA preencher os
//     slots obrigatórios que faltaram).
// overlap/low_contrast/image_ratio não têm correção local segura ainda
// nesta arquitetura (mexer nisso exigiria mover posição fixa do slot ou
// sobrescrever cor por elemento — nenhum dos dois existe hoje) — esses
// continuam caindo no fallback de trocar layout, e ficam documentados
// aqui como o limite atual, não escondidos.
function canRetryLocally(qa: ReturnType<typeof runVisualQa>): boolean {
  return qa.issues.some((i) => i.code === "missing_required");
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
  mediaDimensionsById: Record<string, MediaDimensions>;
}): Promise<SectionOutcome | null> {
  const ranked = rankLayouts(params.section, params.template.layouts, params.imageAnalysis.length, params.designDirection ?? undefined);
  if (ranked.length === 0) {
    await logError(params.ownerId, params.presentationId, "template_match", `Nenhum layout disponível pra seção "${params.section.purpose}"`);
    return null;
  }

  async function composeAttempt(layout: Layout) {
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
    return { slide, qa, resolvedImages };
  }

  let best: { slide: Slide; qa: ReturnType<typeof runVisualQa>; layout: Layout } | null = null;

  for (let attempt = 0; attempt < Math.min(params.maxAttempts, ranked.length); attempt++) {
    const layout = ranked[attempt].layout;
    let outcome = await composeAttempt(layout);

    // Auto-Fix local (P1#3) — só UMA tentativa extra, no MESMO layout,
    // antes de aceitar a troca de layout como próximo passo.
    if (outcome.qa.score < params.threshold && canRetryLocally(outcome.qa)) {
      for (const img of outcome.resolvedImages) params.usedMediaIds.delete(img.mediaId);
      const retried = await composeAttempt(layout);
      if (retried.qa.score > outcome.qa.score) {
        outcome = retried;
      } else {
        // Fica com o outcome original — desfaz a liberação de imagem de
        // cima (era só pra dar à tentativa local a mesma chance de
        // escolher imagem) e libera a da tentativa local descartada.
        for (const img of retried.resolvedImages) params.usedMediaIds.delete(img.mediaId);
        for (const img of outcome.resolvedImages) params.usedMediaIds.add(img.mediaId);
      }
    }

    if (!best || outcome.qa.score > best.qa.score) best = { slide: outcome.slide, qa: outcome.qa, layout };
    if (outcome.qa.score >= params.threshold) break;

    // Corrigiu não o suficiente — libera as imagens usadas nesta tentativa
    // pra próxima tentativa poder escolher de novo (evita "gastar" a
    // imagem boa numa composição que vai ser descartada).
    for (const img of outcome.resolvedImages) params.usedMediaIds.delete(img.mediaId);
  }

  // Reaplica o uso de imagem da MELHOR tentativa (a última liberação acima
  // pode ter sido a vencedora).
  if (best) {
    for (const el of best.slide.elements) {
      if (el.kind === "image" && el.imageMediaId) params.usedMediaIds.add(el.imageMediaId);
    }
  }

  if (!best) return null;

  // P1#2 — segunda camada do Visual QA, sobre o render real (não o JSON).
  // Roda só UMA vez, sobre a composição final escolhida — não a cada
  // tentativa do loop acima (isso multiplicaria o custo de renderizar por
  // até maxAttempts×seções sem necessidade: a troca de layout já é
  // decidida pela camada JSON, que é instantânea; o render real serve pra
  // registrar problemas que só aparecem depois de renderizar de verdade,
  // não pra guiar a escolha de layout).
  const renderQa = await runRenderQa(best.slide, best.layout, params.template.designSystem, params.mediaDimensionsById);

  return { ...best, renderQa };
}

function averageScore(slides: Slide[], issues: VisualQaIssue[]): number {
  if (slides.length === 0) return 0;
  // Recalcula a partir das issues coletadas globalmente seria impreciso por
  // slide; como runVisualQa já roda por slide dentro do loop de tentativas,
  // aqui só penaliza a média-base pela quantidade total de issues restantes.
  const penalty = Math.min(60, issues.length * 5);
  return Math.max(0, 100 - penalty);
}
