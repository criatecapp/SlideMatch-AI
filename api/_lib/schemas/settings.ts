import { z } from "zod";

export const AIFeatureFlagsSchema = z.object({
  contentAnalysis: z.boolean().default(true),
  imageAnalysis: z.boolean().default(true),
  presentationPlanning: z.boolean().default(true),
  contentMapping: z.boolean().default(true),
  artDirection: z.boolean().default(true),
  aiEditor: z.boolean().default(true),
});
export type AIFeatureFlags = z.infer<typeof AIFeatureFlagsSchema>;

export const VisualQaSettingsSchema = z.object({
  threshold: z.number().min(0).max(100).default(80),
  maxAttempts: z.number().int().min(1).max(5).default(2),
});
export type VisualQaSettings = z.infer<typeof VisualQaSettingsSchema>;

export const AISettingsUpdateSchema = z.object({
  features: AIFeatureFlagsSchema,
  visualQa: VisualQaSettingsSchema,
  apiKey: z.string().optional(),
});
export type AISettingsUpdate = z.infer<typeof AISettingsUpdateSchema>;

export interface AISettings {
  provider: "openai";
  model: string;
  configured: boolean;
  features: AIFeatureFlags;
  visualQa: VisualQaSettings;
}
