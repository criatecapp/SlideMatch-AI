import { z } from "zod";

// ---------------------------------------------------------------------------
// Content Analyzer (section 9) — interpreta o pedido do usuário. NÃO decide
// nada visual (posição, layout, template) — só o que precisa ser dito.
// ---------------------------------------------------------------------------
export const ContentAnalysisSchema = z.object({
  topic: z.string(),
  audience: z.string(),
  tone: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()).default([]),
  // Propósitos sugeridos pra seções (ex: "introduction", "risks",
  // "best_practices", "conclusion") — string livre, o Planner decide a
  // ordem/quantidade final, isso é só matéria-prima.
  suggestedPurposes: z.array(z.string()).default([]),
});
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;

// ---------------------------------------------------------------------------
// Presentation Planner (section 10)
// ---------------------------------------------------------------------------
export const ContentTypeSchema = z.enum(["text", "image", "data", "mixed", "list", "quote", "timeline"]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const PlanSectionSchema = z.object({
  order: z.number().int().min(0),
  purpose: z.string(),
  contentType: ContentTypeSchema,
  estimatedImages: z.number().int().min(0).default(0),
  textDensity: z.enum(["low", "medium", "high"]).default("medium"),
});
export type PlanSection = z.infer<typeof PlanSectionSchema>;

export const PresentationPlanSchema = z.object({
  slideCount: z.number().int().min(1).max(60),
  reasoning: z.string(),
  sections: z.array(PlanSectionSchema),
});
export type PresentationPlan = z.infer<typeof PresentationPlanSchema>;

// ---------------------------------------------------------------------------
// Content Mapper (section 12) — conteúdo → slots de um layout específico.
// Estritamente validável; sanitização referencial (slotId precisa existir
// de verdade no layout) acontece em contentMapper.ts, não aqui.
// ---------------------------------------------------------------------------
export const ChartDataPointSchema = z.object({
  label: z.string(),
  value: z.number(),
});
export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;

export const SlotAssignmentSchema = z.object({
  slotId: z.string(),
  textValue: z.string().optional(),
  imageQuery: z.string().optional(),
  listItems: z.array(z.string()).optional(),
  statValue: z.string().optional(),
  // kind="chart": pontos {label, value} pra um gráfico de barras.
  chartTitle: z.string().optional(),
  dataPoints: z.array(ChartDataPointSchema).optional(),
  // kind="table": primeira linha é o cabeçalho.
  tableRows: z.array(z.array(z.string())).optional(),
});
export type SlotAssignment = z.infer<typeof SlotAssignmentSchema>;

export const ContentMapSchema = z.object({
  slotAssignments: z.array(SlotAssignmentSchema),
});
export type ContentMap = z.infer<typeof ContentMapSchema>;

// ---------------------------------------------------------------------------
// Art Director (section 15) — direção, não geometria.
// ---------------------------------------------------------------------------
export const DesignDirectionSchema = z.object({
  style: z.string(),
  density: z.enum(["low", "medium", "high"]),
  imageTreatment: z.string(),
  textDensity: z.enum(["low", "medium", "high"]),
  accentUsage: z.enum(["subtle", "moderate", "bold"]),
  rationale: z.string(),
});
export type DesignDirection = z.infer<typeof DesignDirectionSchema>;

// ---------------------------------------------------------------------------
// Image Intelligence (section 19)
// ---------------------------------------------------------------------------
export const FocalPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const ImageAnalysisSchema = z.object({
  mediaId: z.string(),
  role: z.string(), // hero_image, background, icon_source…
  subject: z.string(),
  orientation: z.enum(["landscape", "portrait", "square"]),
  aspectRatio: z.string(),
  focalPoint: FocalPointSchema.default({ x: 0.5, y: 0.5 }),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

// ---------------------------------------------------------------------------
// AI Editor (sections 17-18) — comando em linguagem natural → patch mínimo.
// ---------------------------------------------------------------------------
export const EditActionSchema = z.enum([
  "set_text", "replace_image", "adjust_style", "regenerate_content", "remove_element", "add_element",
]);
export type EditAction = z.infer<typeof EditActionSchema>;

export const EditOpSchema = z.object({
  action: EditActionSchema,
  slotId: z.string().optional(),
  value: z.string().optional(),
});
export type EditOp = z.infer<typeof EditOpSchema>;

export const EditCommandResultSchema = z.object({
  summary: z.string(),
  ops: z.array(EditOpSchema),
});
export type EditCommandResult = z.infer<typeof EditCommandResultSchema>;
