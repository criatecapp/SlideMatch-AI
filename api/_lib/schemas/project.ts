import { z } from "zod";

export const ProjectCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  content: z.string().default(""), // texto-fonte colado/enviado pelo usuário
  objective: z.string().default(""),
  audience: z.string().default(""),
  style: z.string().default("formal"),
  minSlides: z.number().int().min(1).max(100).default(5),
  maxSlides: z.number().int().min(1).max(100).default(15),
});
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  style: z.string().optional(),
  minSlides: z.number().int().min(1).max(100).optional(),
  maxSlides: z.number().int().min(1).max(100).optional(),
});
export type ProjectUpdateInput = z.infer<typeof ProjectUpdateSchema>;

export interface Project extends ProjectCreateInput {
  id: string;
  ownerId: string;
  createdAt: string | null;
  updatedAt: string | null;
}
