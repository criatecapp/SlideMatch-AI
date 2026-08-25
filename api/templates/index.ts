import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { createTemplate, listTemplates } from "../_lib/services/templateService";
import { TemplateCreateSchema } from "../_lib/schemas/template";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "POST"])) return;
  const user = await requireAuth(req);

  if (req.method === "GET") {
    const activeOnly = req.query.active === "true";
    res.status(200).json({ items: await listTemplates(activeOnly) });
    return;
  }

  const payload = parseBody(TemplateCreateSchema, req.body);
  const template = await createTemplate(user.uid, payload);
  res.status(201).json(template);
});
