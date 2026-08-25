import { applyEditOps, sanitizeEditCommand } from "./aiEditor";
import { getMedia } from "./mediaService";
import { commitVersion, getCurrentSlides, getPresentation } from "./presentationService";
import { getTemplate } from "./templateService";
import { logGeneration } from "./aiLogging";
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

  // replace_image precisa da URL real da mídia — resolve aqui (I/O), fora
  // da função pura applyEditOps.
  const resolvedImages: Record<string, { url: string; mediaId: string }> = {};
  for (const op of sanitized.ops) {
    if (op.action === "replace_image" && op.slotId && op.value) {
      const media = await getMedia(params.ownerId, op.value).catch(() => null);
      if (media?.url) resolvedImages[op.slotId] = { url: media.url, mediaId: media.id };
    }
  }

  const updatedSlide = applyEditOps({ slide, layout, ops: sanitized.ops, resolvedImages });
  const newSlides = slides.map((s) => (s.order === params.slideOrder ? updatedSlide : s));
  await commitVersion(params.ownerId, params.presentationId, newSlides, "ai", sanitized.summary || `Comando: "${params.command}"`);

  return { slide: updatedSlide, summary: sanitized.summary };
}
