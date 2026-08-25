import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../../_lib/http";
import { listVersions, revertToVersion } from "../../_lib/services/presentationService";
import { ValidationAppError } from "../../_lib/errors";

const RevertSchema = z.object({ versionNumber: z.number().int().min(1) });

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  if (req.method === "GET") {
    res.status(200).json({ items: await listVersions(user.uid, id) });
    return;
  }

  const { versionNumber } = parseBody(RevertSchema, req.body);
  res.status(200).json(await revertToVersion(user.uid, id, versionNumber));
});
