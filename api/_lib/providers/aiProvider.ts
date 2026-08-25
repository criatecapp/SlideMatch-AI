import type { ContentAnalysis, ContentMap, DesignDirection, EditCommandResult, ImageAnalysis, PresentationPlan } from "../schemas/ai";
import type { Layout } from "../schemas/template";

export interface ImageInput {
  mediaId: string;
  url: string | null;
}

// Única porta de entrada pra qualquer chamada de IA do sistema — nenhum
// serviço chama OpenAI (ou qualquer provedor) diretamente. Cada método
// segue o mesmo contrato: entrada tipada, saída validada por Zod na
// implementação, nunca texto livre pra decisão estrutural (section 30).
export interface AIProvider {
  analyzeContent(params: { text: string; objective: string; audience: string; style: string }): Promise<ContentAnalysis>;

  analyzeImages(params: { images: ImageInput[] }): Promise<ImageAnalysis[]>;

  planPresentation(params: {
    contentAnalysis: ContentAnalysis;
    constraints: { minSlides: number; maxSlides: number };
  }): Promise<PresentationPlan>;

  // Content Mapper — conteúdo real pra dentro dos slots de UM layout já
  // escolhido pelo Template Matcher (determinístico, não é IA).
  mapContentToSlots(params: {
    contentAnalysis: ContentAnalysis;
    section: { order: number; purpose: string; contentType: string };
    layout: Layout;
    availableImages: ImageAnalysis[];
  }): Promise<ContentMap>;

  planArtDirection(params: {
    contentAnalysis: ContentAnalysis;
    presentationPlan: PresentationPlan;
  }): Promise<DesignDirection>;

  // AI Editor — comando em linguagem natural sobre UM slide já composto.
  editSlide(params: { slide: Record<string, unknown>; command: string }): Promise<EditCommandResult>;
}
