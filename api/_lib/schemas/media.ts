import { z } from "zod";

export const MediaAnalysisSchema = z.object({
  role: z.string().default(""),
  subject: z.string().default(""),
  orientation: z.enum(["landscape", "portrait", "square"]).default("landscape"),
  aspectRatio: z.string().default("16:9"),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).default({ x: 0.5, y: 0.5 }),
});
export type MediaAnalysis = z.infer<typeof MediaAnalysisSchema>;

export interface Media {
  id: string;
  ownerId: string;
  projectId: string;
  filename: string;
  contentType: string;
  storagePath: string;
  url: string | null;
  width: number | null;
  height: number | null;
  analysis: MediaAnalysis;
  createdAt: string | null;
}
