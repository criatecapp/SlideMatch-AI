import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { createPresentation, listPresentations } from "../_lib/services/presentationService";
import { PresentationCreateSchema } from "../_lib/schemas/presentation";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "POST"])) return;
  const user = await requireAuth(req);

  if (req.method === "GET") {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    res.status(200).json({ items: await listPresentations(user.uid, projectId) });
    return;
  }

  const payload = parseBody(PresentationCreateSchema, req.body);
  const presentation = await createPresentation(user.uid, payload);
  res.status(201).json(presentation);
});
