import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../../_lib/http";
import { editSlideWithCommand } from "../../_lib/services/editOrchestrator";
import { OpenAIProvider } from "../../_lib/providers/openaiProvider";
import { ValidationAppError } from "../../_lib/errors";

export const config = { maxDuration: 60 };

const EditRequestSchema = z.object({ slideOrder: z.number().int(), command: z.string().min(1) });

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  const { slideOrder, command } = parseBody(EditRequestSchema, req.body);
  const result = await editSlideWithCommand({ ownerId: user.uid, presentationId: id, slideOrder, command, provider: new OpenAIProvider() });
  res.status(200).json(result);
});
