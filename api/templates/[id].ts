import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { deleteTemplate, getTemplate, updateTemplate } from "../_lib/services/templateService";
import { TemplateUpdateSchema } from "../_lib/schemas/template";
import { ForbiddenAppError, ValidationAppError } from "../_lib/errors";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "PATCH", "DELETE"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  if (req.method === "GET") {
    res.status(200).json(await getTemplate(id));
    return;
  }

  // Templates são uma biblioteca compartilhada pra leitura/casamento, mas
  // só o dono edita/apaga o próprio.
  const existing = await getTemplate(id);
  if (existing.ownerId !== null && existing.ownerId !== user.uid) {
    throw new ForbiddenAppError("Você não pode alterar um template que não é seu");
  }

  if (req.method === "DELETE") {
    await deleteTemplate(id);
    res.status(204).end();
    return;
  }
  const payload = parseBody(TemplateUpdateSchema, req.body);
  res.status(200).json(await updateTemplate(id, payload));
});
