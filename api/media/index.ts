import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard } from "../_lib/http";
import { deleteMedia, listMedia } from "../_lib/services/mediaService";
import { ValidationAppError } from "../_lib/errors";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "DELETE"])) return;
  const user = await requireAuth(req);

  if (req.method === "GET") {
    const projectId = req.query.projectId;
    if (typeof projectId !== "string") throw new ValidationAppError("projectId é obrigatório");
    res.status(200).json({ items: await listMedia(user.uid, projectId) });
    return;
  }

  const mediaId = req.query.id;
  if (typeof mediaId !== "string") throw new ValidationAppError("id é obrigatório");
  await deleteMedia(user.uid, mediaId);
  res.status(204).end();
});
