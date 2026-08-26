import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { ZodType, z } from "zod";
import { ZodError } from "zod";
import { AppError, RateLimitAppError, ValidationAppError } from "./errors";

// Todo body de POST/PATCH passa por aqui — nunca `schema.parse(req.body)`
// direto numa rota, porque um ZodError cru vira 500 (erro interno) em vez
// de 400 (erro do cliente). Mensagens de erro do Zod já são específicas o
// bastante pro "section 34" (nada de 'Something went wrong'). Vinculado
// por `z.output<S>` (não `ZodType<T>` direto) — mesmo ajuste de
// callJson em openaiProvider.ts, mesmo motivo (schemas com `.default()`
// infeririam o tipo de entrada em vez do de saída).
export function parseBody<S extends ZodType<any>>(schema: S, body: unknown): z.output<S> {
  try {
    return schema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ValidationAppError(err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    }
    throw err;
  }
}

export type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

// Único ponto onde toda rota trata erro — nenhuma rota escreve seu próprio
// catch. AppError vira {status, code, message} real; qualquer outro erro
// vira 500 genérico (nunca vaza stack/detalhe interno pro cliente —
// section 28/34).
export function handleRoute(handler: RouteHandler): RouteHandler {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof AppError) {
        if (err instanceof RateLimitAppError) res.setHeader("Retry-After", String(err.retryAfterSeconds));
        res.status(err.status).json({ error: { code: err.code, message: err.message } });
        return;
      }
      console.error("Unhandled route error", err);
      res.status(500).json({ error: { code: "internal_error", message: "Erro interno. Tente novamente em instantes." } });
    }
  };
}

export function methodGuard(req: VercelRequest, res: VercelResponse, allowed: string[]): boolean {
  if (!req.method || !allowed.includes(req.method)) {
    res.status(405).json({ error: { code: "method_not_allowed", message: `Método não permitido. Use: ${allowed.join(", ")}` } });
    return false;
  }
  return true;
}
