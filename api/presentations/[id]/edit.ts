import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../../_lib/http";
import { editSlideWithCommand } from "../../_lib/services/editOrchestrator";
import { OpenAIProvider } from "../../_lib/providers/openaiProvider";
import { enforceRateLimit } from "../../_lib/services/rateLimiter";
import { RATE_LIMITS, TEXT_LIMITS } from "../../_lib/limits";
import { ValidationAppError } from "../../_lib/errors";

export const config = { maxDuration: 60 };

// P1#3 — command tem teto (chega direto num prompt de IA).
const EditRequestSchema = z.object({ slideOrder: z.number().int(), command: z.string().min(1).max(TEXT_LIMITS.editCommand) });

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  // P1#2 — por uid do token verificado, antes de chamar a IA.
  await enforceRateLimit(user.uid, "edit", RATE_LIMITS.edit);

  const { slideOrder, command } = parseBody(EditRequestSchema, req.body);
  const result = await editSlideWithCommand({ ownerId: user.uid, presentationId: id, slideOrder, command, provider: new OpenAIProvider() });
  res.status(200).json(result);
});
