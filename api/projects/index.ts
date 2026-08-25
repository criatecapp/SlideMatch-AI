import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { createProject, listProjects } from "../_lib/services/projectService";
import { ProjectCreateSchema } from "../_lib/schemas/project";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "POST"])) return;
  const user = await requireAuth(req);

  if (req.method === "GET") {
    const projects = await listProjects(user.uid);
    res.status(200).json({ items: projects });
    return;
  }

  const payload = parseBody(ProjectCreateSchema, req.body);
  const project = await createProject(user.uid, payload);
  res.status(201).json(project);
});
