import { describe, expect, it } from "vitest";
import { ProjectCreateSchema, ProjectUpdateSchema } from "./project";
import { MAX_SLIDES, TEXT_LIMITS } from "../limits";

const BASE = { title: "Projeto" };

// P1#1 — maxSlides/minSlides nunca passam de MAX_SLIDES, validado no
// backend independente do valor mandado pelo cliente.
describe("ProjectCreateSchema — maxSlides", () => {
  it("maxSlides=5 → permitido", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 5 })).not.toThrow();
  });
  it("maxSlides=15 → permitido", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 15 })).not.toThrow();
  });
  it(`maxSlides=${MAX_SLIDES} (teto) → permitido`, () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: MAX_SLIDES })).not.toThrow();
  });
  it(`maxSlides=${MAX_SLIDES + 1} → rejeitado`, () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: MAX_SLIDES + 1 })).toThrow();
  });
  it("maxSlides=100 → rejeitado (não é mais só 'normalizado')", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 100 })).toThrow();
  });
  it("maxSlides=500 → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 500 })).toThrow();
  });
  it("maxSlides negativo → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: -5 })).toThrow();
  });
  it("maxSlides=0 → rejeitado (mínimo é 1)", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 0 })).toThrow();
  });
  it("maxSlides string → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: "100" as any })).toThrow();
  });
  it("maxSlides não-inteiro → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, maxSlides: 15.5 })).toThrow();
  });
  it("minSlides também respeita o teto (mesmo caminho de bypass potencial)", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, minSlides: MAX_SLIDES + 1 })).toThrow();
  });

  it("PATCH (ProjectUpdateSchema) tem o mesmo teto — não é um caminho alternativo", () => {
    expect(() => ProjectUpdateSchema.parse({ maxSlides: MAX_SLIDES + 1 })).toThrow();
    expect(() => ProjectUpdateSchema.parse({ maxSlides: MAX_SLIDES })).not.toThrow();
  });
});

// P1#3 — todo campo de texto livre que alimenta prompt de IA tem teto.
describe("ProjectCreateSchema — limites de texto (P1#3)", () => {
  it("content dentro do limite → permitido", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, content: "a".repeat(TEXT_LIMITS.projectContent) })).not.toThrow();
  });
  it("content acima do limite → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, content: "a".repeat(TEXT_LIMITS.projectContent + 1) })).toThrow();
  });
  it("description acima do limite → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, description: "a".repeat(TEXT_LIMITS.projectDescription + 1) })).toThrow();
  });
  it("objective acima do limite → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, objective: "a".repeat(TEXT_LIMITS.projectObjective + 1) })).toThrow();
  });
  it("audience acima do limite → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, audience: "a".repeat(TEXT_LIMITS.projectAudience + 1) })).toThrow();
  });
  it("style acima do limite → rejeitado", () => {
    expect(() => ProjectCreateSchema.parse({ ...BASE, style: "a".repeat(TEXT_LIMITS.projectStyle + 1) })).toThrow();
  });
  it("PATCH (ProjectUpdateSchema) também valida content — não é um caminho alternativo", () => {
    expect(() => ProjectUpdateSchema.parse({ content: "a".repeat(TEXT_LIMITS.projectContent + 1) })).toThrow();
  });
  it("conteúdo legítimo de tamanho normal não é afetado", () => {
    const realistic = "Um artigo de verdade sobre segurança da informação. ".repeat(50); // ~2.7k chars
    expect(() => ProjectCreateSchema.parse({ ...BASE, content: realistic })).not.toThrow();
  });
});
