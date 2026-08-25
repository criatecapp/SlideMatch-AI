import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard } from "../../_lib/http";
import { generatePresentation } from "../../_lib/services/aiOrchestrator";
import { OpenAIProvider } from "../../_lib/providers/openaiProvider";
import { ValidationAppError } from "../../_lib/errors";

export const config = { maxDuration: 60 };

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  const result = await generatePresentation(user.uid, id, new OpenAIProvider());
  res.status(200).json({ presentation: result.presentation, slides: result.slides, qaIssueCount: result.qaIssues.length });
});
