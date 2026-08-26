import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard } from "../../_lib/http";
import { generatePresentation } from "../../_lib/services/aiOrchestrator";
import { OpenAIProvider } from "../../_lib/providers/openaiProvider";
import { enforceRateLimit } from "../../_lib/services/rateLimiter";
import { RATE_LIMITS } from "../../_lib/limits";
import { ValidationAppError } from "../../_lib/errors";

export const config = { maxDuration: 60 };

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  // P1#2 — por uid do token verificado (nunca por id da requisição), antes
  // de qualquer trabalho real (IA, render).
  await enforceRateLimit(user.uid, "generate", RATE_LIMITS.generate);

  const result = await generatePresentation(user.uid, id, new OpenAIProvider());
  res.status(200).json({ presentation: result.presentation, slides: result.slides, qaIssueCount: result.qaIssues.length });
});
