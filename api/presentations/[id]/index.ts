import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard } from "../../_lib/http";
import { deletePresentation, getPresentation } from "../../_lib/services/presentationService";
import { ValidationAppError } from "../../_lib/errors";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "DELETE"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  if (req.method === "DELETE") {
    await deletePresentation(user.uid, id);
    res.status(204).end();
    return;
  }
  res.status(200).json(await getPresentation(user.uid, id));
});
