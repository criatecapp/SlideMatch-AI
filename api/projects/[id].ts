import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { deleteProject, getProject, updateProject } from "../_lib/services/projectService";
import { ProjectUpdateSchema } from "../_lib/schemas/project";
import { ValidationAppError } from "../_lib/errors";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "PATCH", "DELETE"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  if (req.method === "GET") {
    res.status(200).json(await getProject(user.uid, id));
    return;
  }
  if (req.method === "DELETE") {
    await deleteProject(user.uid, id);
    res.status(204).end();
    return;
  }
  const payload = parseBody(ProjectUpdateSchema, req.body);
  res.status(200).json(await updateProject(user.uid, id, payload));
});
