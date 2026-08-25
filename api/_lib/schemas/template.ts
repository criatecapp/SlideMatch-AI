import { z } from "zod";

// ---------------------------------------------------------------------------
// Template Intelligence — o schema que dá semântica a um template visual.
//
// Cada slot tem duas dimensões: `kind` (o que ele É — texto, imagem, ícone…
// determina como o Renderer e o Content Fit Engine tratam ele) e `role` (pra
// que ele SERVE — título, subtítulo, estatística… determina o que o Content
// Mapper põe nele). `kind` é um enum fechado porque motores determinísticos
// (fit, renderer) precisam saber o comportamento de cada um. `role` é string
// livre com uma lista curada de referência — extensível sem migrar schema,
// mesmo princípio que `TemplateLayout.type` provou funcionar antes.
// ---------------------------------------------------------------------------

export const SlotKindSchema = z.enum([
  "text", "image", "icon", "video", "chart", "table", "shape", "button",
]);
export type SlotKind = z.infer<typeof SlotKindSchema>;

// Lista de referência — não é exaustiva nem validada por Zod (role fica
// string livre), serve de vocabulário conhecido pro Content Analyzer/Mapper
// e pro Template Editor sugerir no formulário.
export const KNOWN_SLOT_ROLES = [
  "title", "subtitle", "heading", "body", "paragraph", "bullet_list",
  "numbered_list", "quote", "statistic", "percentage", "currency", "icon",
  "image", "logo", "video", "chart", "table", "badge", "label", "button",
  "timeline", "card", "shape", "divider",
] as const;

export const SlotPositionSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  w: z.number().gt(0).max(100),
  h: z.number().gt(0).max(100),
});
export type SlotPosition = z.infer<typeof SlotPositionSchema>;

// Proveniência opcional — quando a posição em % veio do grid (gridEngine.ts)
// em vez de digitada à mão no editor. Guardado pra poder recalcular x/w se o
// grid mudar, sem precisar decidir se o slot "era" grid ou não.
export const GridPlacementSchema = z.object({
  column: z.number().int().min(0).max(11),
  columnSpan: z.number().int().min(1).max(12),
  row: z.number().int().min(0).max(11).optional(),
  rowSpan: z.number().int().min(1).max(12).optional(),
});
export type GridPlacement = z.infer<typeof GridPlacementSchema>;

export const OverflowBehaviorSchema = z.enum(["shrink_font", "truncate", "scroll", "new_slide"]);
export type OverflowBehavior = z.infer<typeof OverflowBehaviorSchema>;

export const SlotSchema = z.object({
  id: z.string().min(1),
  kind: SlotKindSchema,
  role: z.string().min(1),
  position: SlotPositionSchema,
  gridPlacement: GridPlacementSchema.optional(),

  required: z.boolean().default(false),
  editable: z.boolean().default(true),
  locked: z.boolean().default(false),
  aiEditable: z.boolean().default(true),
  priority: z.number().int().min(0).max(10).default(5),

  // Texto
  maxCharacters: z.number().int().positive().optional(),
  minCharacters: z.number().int().min(0).optional(),
  maxLines: z.number().int().positive().optional(),
  minLines: z.number().int().min(0).optional(),
  fontFamily: z.string().optional(),
  fontSize: z.number().int().min(6).max(200).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().positive().optional(),
  alignment: z.enum(["left", "center", "right", "justify"]).optional(),
  verticalAlignment: z.enum(["top", "middle", "bottom"]).optional(),
  overflowBehavior: OverflowBehaviorSchema.default("shrink_font"),

  // Imagem/vídeo
  allowedImageRatio: z.string().optional(), // ex: "16:9", "1:1"
  allowedImageTypes: z.array(z.string()).optional(),
  objectFit: z.enum(["cover", "contain", "fill"]).optional(),

  // Estilo genérico
  color: z.string().optional(),
  background: z.string().optional(),
  padding: z.number().min(0).optional(),
  margin: z.number().min(0).optional(),

  responsiveBehavior: z.enum(["scale", "reflow", "hide_below_min"]).default("scale"),
});
export type Slot = z.infer<typeof SlotSchema>;

export const CanvasSchema = z.object({
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
});
export type Canvas = z.infer<typeof CanvasSchema>;

export const GridConfigSchema = z.object({
  columns: z.number().int().min(1).max(24).default(12),
  gutter: z.number().min(0).default(24),
  margin: z.number().min(0).default(80),
});
export type GridConfig = z.infer<typeof GridConfigSchema>;

// Um Layout é UMA composição (uma "planta" de slide) dentro de um Template.
// Um Template agrupa vários Layouts que compartilham a mesma identidade
// visual (Design System) — é isso que o Template Matcher escolhe entre.
export const LayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Livre (não enum) — igual role, catálogo de composição extensível sem
  // migração de schema. Usado pelo Planner/Matcher pra saber a "forma" do
  // layout (hero, text_image, three_cards, stats, timeline, closing…).
  type: z.string().min(1),
  canvas: CanvasSchema.default(CanvasSchema.parse({})),
  slots: z.array(SlotSchema).default([]),
});
export type Layout = z.infer<typeof LayoutSchema>;

// ---------------------------------------------------------------------------
// Design System — section 16. Único lugar onde cor/tipografia/espaçamento
// vivem; templates consomem, nunca redefinem cores soltas.
// ---------------------------------------------------------------------------

export const PaletteSchema = z.object({
  background: z.string().default("#FFFFFF"),
  surface: z.string().default("#F6F7F9"),
  ink: z.string().default("#14181F"),
  accent: z.string().default("#2A4CF0"),
  muted: z.string().default("#6B7280"),
});
export type Palette = z.infer<typeof PaletteSchema>;

export const TypeScaleSchema = z.object({
  title: z.number().int().min(6).max(200).default(44),
  subtitle: z.number().int().min(6).max(200).default(24),
  heading: z.number().int().min(6).max(200).default(28),
  body: z.number().int().min(6).max(200).default(18),
  caption: z.number().int().min(6).max(200).default(13),
  statistic: z.number().int().min(6).max(200).default(56),
});
export type TypeScale = z.infer<typeof TypeScaleSchema>;

export const TypographySchema = z.object({
  titleFont: z.string().default("Inter"),
  bodyFont: z.string().default("Inter"),
  scale: TypeScaleSchema.default(TypeScaleSchema.parse({})),
});
export type Typography = z.infer<typeof TypographySchema>;

export const SpacingSchema = z.object({
  unit: z.number().min(0).max(20).default(2), // % da menor dimensão do slide
});
export type Spacing = z.infer<typeof SpacingSchema>;

export const ImageTreatmentSchema = z.object({
  overlayEnabled: z.boolean().default(false),
  overlayColor: z.string().default("#000000"),
  overlayOpacity: z.number().min(0).max(1).default(0.35),
});
export type ImageTreatment = z.infer<typeof ImageTreatmentSchema>;

export const DesignSystemSchema = z.object({
  palette: PaletteSchema.default(PaletteSchema.parse({})),
  typography: TypographySchema.default(TypographySchema.parse({})),
  spacing: SpacingSchema.default(SpacingSchema.parse({})),
  imageTreatment: ImageTreatmentSchema.default(ImageTreatmentSchema.parse({})),
  grid: GridConfigSchema.default(GridConfigSchema.parse({})),
  radius: z.number().min(0).default(8),
});
export type DesignSystem = z.infer<typeof DesignSystemSchema>;

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().default(""),
  category: z.string().default("corporate"),
  style: z.string().default("modern"),
  aspectRatio: z.enum(["16:9", "4:3"]).default("16:9"),
  designSystem: DesignSystemSchema.default(DesignSystemSchema.parse({})),
  layouts: z.array(LayoutSchema).default([]),
  active: z.boolean().default(true),
  version: z.number().int().min(1).default(1),
});
export type TemplateCreateInput = z.infer<typeof TemplateCreateSchema>;

export const TemplateUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  style: z.string().optional(),
  aspectRatio: z.enum(["16:9", "4:3"]).optional(),
  designSystem: DesignSystemSchema.optional(),
  layouts: z.array(LayoutSchema).optional(),
  active: z.boolean().optional(),
});
export type TemplateUpdateInput = z.infer<typeof TemplateUpdateSchema>;

export interface Template extends TemplateCreateInput {
  id: string;
  ownerId: string | null; // null = template de biblioteca compartilhada
  createdAt: string | null;
  updatedAt: string | null;
}
