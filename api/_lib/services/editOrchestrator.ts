import { applyEditOpsWithReport, sanitizeEditCommand } from "./aiEditor";
import { getMedia } from "./mediaService";
import { commitVersion, getCurrentSlides, getPresentation } from "./presentationService";
import { getTemplate } from "./templateService";
import { runVisualQa } from "./visualQa";
import { logError, logGeneration } from "./aiLogging";
import { ValidationAppError } from "../errors";
import type { AIProvider } from "../providers/aiProvider";
import type { EditCommandResult } from "../schemas/ai";
import type { Slide } from "../schemas/presentation";

// Fecha o loop do AI Editor (section 17-18) ponta a ponta: comando em
// linguagem natural → IA propõe ops → sanitiza contra o layout real →
// aplica só o necessário → checkpoint versionado.
export async function editSlideWithCommand(params: {
  ownerId: string;
  presentationId: string;
  slideOrder: number;
  command: string;
  provider: AIProvider;
}): Promise<{ slide: Slide; summary: string }> {
  const presentation = await getPresentation(params.ownerId, params.presentationId);
  if (!presentation.templateId) throw new Error("Apresentação sem template — gere antes de editar");
  const template = await getTemplate(presentation.templateId);

  const slides = await getCurrentSlides(params.ownerId, params.presentationId);
  const slide = slides.find((s) => s.order === params.slideOrder);
  if (!slide) throw new Error(`Slide de ordem ${params.slideOrder} não encontrado`);

  const layout = template.layouts.find((l) => l.id === slide.layoutId);
  if (!layout) throw new Error(`Layout "${slide.layoutId}" não encontrado no template`);

  const raw: EditCommandResult = await params.provider.editSlide({ slide: slide as unknown as Record<string, unknown>, command: params.command });
  const sanitized = sanitizeEditCommand(raw, layout);
  await logGeneration(params.ownerId, params.presentationId, "ai_edit", { slideOrder: params.slideOrder, command: params.command }, sanitized);

  // Regra fundamental do AI Editor (nenhuma operação pode gerar falso
  // sucesso): se a IA não propôs nenhuma operação válida pro layout real
  // (tudo filtrado por sanitizeEditCommand, ou resposta vazia), não há o
  // que commitar — erro explícito em vez de "sucesso" silencioso sem
  // mudança nenhuma.
  if (sanitized.ops.length === 0) {
    await logError(params.ownerId, params.presentationId, "ai_edit", `Nenhuma operação válida pro comando: "${params.command}"`);
    throw new ValidationAppError(`Não foi possível interpretar o comando "${params.command}" em uma alteração válida deste slide.`);
  }

  // replace_image precisa da URL real da mídia — resolve aqui (I/O), fora
  // da função pura applyEditOps.
  const resolvedImages: Record<string, { url: string; mediaId: string }> = {};
  for (const op of sanitized.ops) {
    if (op.action === "replace_image" && op.slotId && op.value) {
      const media = await getMedia(params.ownerId, op.value).catch(() => null);
      if (media?.url) resolvedImages[op.slotId] = { url: media.url, mediaId: media.id };
    }
  }

  const { slide: updatedSlide, outcomes } = applyEditOpsWithReport({ slide, layout, ops: sanitized.ops, resolvedImages });

  // Nenhuma operação pode virar "sucesso" sem efeito verificável (P0#2) —
  // se qualquer uma não aplicou (bloqueada por aiEditable, slot inexistente,
  // conteúdo incompatível, sem espaço válido…), a alteração inteira não é
  // commitada: melhor um erro claro do que um commit parcial/confuso.
  const failed = outcomes.filter((o) => !o.applied);
  if (failed.length > 0) {
    const detail = failed.map((o) => `${o.op.action}${o.op.slotId ? ` (slot "${o.op.slotId}")` : ""}: ${o.reason}`).join(" | ");
    await logError(params.ownerId, params.presentationId, "ai_edit", detail);
    throw new ValidationAppError(`Não foi possível aplicar a alteração com segurança: ${detail}`);
  }

  // Visual QA sobre o resultado antes do commit — bloqueia só se a edição
  // introduziu um problema NOVO (severidade error) que o slide não tinha
  // antes; não se torna mais rígido que a geração original (que já podia
  // conviver com warnings) e não trava edições legítimas por causa de um
  // aviso preexistente.
  const qaBefore = runVisualQa(slide, layout, template.designSystem);
  const qaAfter = runVisualQa(updatedSlide, layout, template.designSystem);
  const newErrors = qaAfter.issues.filter(
    (issue) => issue.severity === "error" && !qaBefore.issues.some((prev) => prev.code === issue.code && prev.slotId === issue.slotId),
  );
  if (newErrors.length > 0) {
    const detail = newErrors.map((i) => i.message).join(" | ");
    await logError(params.ownerId, params.presentationId, "ai_edit", `Visual QA rejeitou a alteração: ${detail}`);
    throw new ValidationAppError(`A alteração deixaria o slide inválido: ${detail}`);
  }

  const newSlides = slides.map((s) => (s.order === params.slideOrder ? updatedSlide : s));
  await commitVersion(params.ownerId, params.presentationId, newSlides, "ai", sanitized.summary || `Comando: "${params.command}"`);

  return { slide: updatedSlide, summary: sanitized.summary };
}
