import { z } from "zod";
import { MAX_SLIDES, TEXT_LIMITS } from "../limits";

// P1#1 — maxSlides/minSlides nunca passam de MAX_SLIDES (30), validado no
// backend independente do que o cliente mandar (100, 500, 999999 são
// rejeitados por este schema, não só "normalizados" no frontend).
// P1#3 — todo campo de texto livre que alimenta prompt de IA tem teto.
export const ProjectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(TEXT_LIMITS.projectDescription).default(""),
  content: z.string().max(TEXT_LIMITS.projectContent).default(""), // texto-fonte colado/enviado pelo usuário
  objective: z.string().max(TEXT_LIMITS.projectObjective).default(""),
  audience: z.string().max(TEXT_LIMITS.projectAudience).default(""),
  style: z.string().max(TEXT_LIMITS.projectStyle).default("formal"),
  minSlides: z.number().int().min(1).max(MAX_SLIDES).default(5),
  maxSlides: z.number().int().min(1).max(MAX_SLIDES).default(15),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(TEXT_LIMITS.projectDescription).optional(),
  content: z.string().max(TEXT_LIMITS.projectContent).optional(),
  objective: z.string().max(TEXT_LIMITS.projectObjective).optional(),
  audience: z.string().max(TEXT_LIMITS.projectAudience).optional(),
  style: z.string().max(TEXT_LIMITS.projectStyle).optional(),
  minSlides: z.number().int().min(1).max(MAX_SLIDES).optional(),
  maxSlides: z.number().int().min(1).max(MAX_SLIDES).optional(),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;

export interface Project extends ProjectCreateInput {
  id: string;
  ownerId: string;
  createdAt: string | null;
  updatedAt: string | null;
}
