import { z } from "zod";
import { SlotKindSchema, SlotPositionSchema } from "./template";
import { ChartDataPointSchema } from "./ai";

export type PresentationStatus = "draft" | "analyzing" | "planned" | "generating" | "generated" | "optimized" | "failed";

// ---------------------------------------------------------------------------
// Slide — a saída determinística do Slide Composer. Isso é o que o Renderer
// consome; a IA nunca escreve isso diretamente, só os componentes rio-acima
// (Content Map, Content Fit) contribuem dados que o Composer monta aqui.
// ---------------------------------------------------------------------------
export const SlideElementSchema = z.object({
  slotId: z.string(),
  kind: SlotKindSchema,
  role: z.string(),
  position: SlotPositionSchema,
  text: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  imageMediaId: z.string().optional(),
  listItems: z.array(z.string()).optional(),
  statValue: z.string().optional(),
  chartTitle: z.string().optional(),
  dataPoints: z.array(ChartDataPointSchema).optional(),
  tableRows: z.array(z.array(z.string())).optional(),
  // Preenchidos pelo Content Fit Engine quando precisa desviar do default
  // do slot pra caber o conteúdo — nunca abaixo do piso definido no slot.
  fontSize: z.number().optional(),
  overflow: z.boolean().default(false),
});
export type SlideElement = z.infer<typeof SlideElementSchema>;

export const SlideSchema = z.object({
  order: z.number().int(),
  layoutId: z.string(),
  purpose: z.string(),
  elements: z.array(SlideElementSchema),
});
export type Slide = z.infer<typeof SlideSchema>;

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------
export const PresentationCreateSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  templateId: z.string().optional(),
  aspectRatio: z.enum(["16:9", "4:3"]).default("16:9"),
});
export type PresentationCreateInput = z.infer<typeof PresentationCreateSchema>;

export interface ExportPaths {
  pptx: string | null;
  pdf: string | null;
  png: string[];
}

export interface Presentation {
  id: string;
  ownerId: string;
  projectId: string;
  templateId: string | null;
  title: string;
  status: PresentationStatus;
  aspectRatio: "16:9" | "4:3";
  slideCount: number;
  contentAnalysis: Record<string, unknown> | null;
  presentationPlan: Record<string, unknown> | null;
  designDirection: Record<string, unknown> | null;
  visualQaScore: Record<string, unknown> | null;
  currentVersion: number;
  lastError: string | null;
  exportPaths: ExportPaths;
  // P1#1 — marca quando a geração atual começou (status vira "analyzing").
  // Usado só pra detectar geração travada (timeout do runtime matou o
  // processo antes do catch rodar) — nulo fora de uma geração em curso.
  generationStartedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Versionamento (section 23)
// ---------------------------------------------------------------------------
export interface PresentationVersion {
  id: string;
  presentationId: string;
  versionNumber: number;
  slides: Slide[];
  createdBy: "user" | "ai";
  changeSummary: string;
  createdAt: string | null;
}
