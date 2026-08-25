import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "node:fs";
import formidable from "formidable";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard } from "../_lib/http";
import { uploadMedia } from "../_lib/services/mediaService";
import { ValidationAppError } from "../_lib/errors";

export const config = { api: { bodyParser: false } };

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);

  const form = formidable({ maxFileSize: 25 * 1024 * 1024, maxFiles: 1 });
  const [fields, files] = await form.parse(req);

  const projectId = Array.isArray(fields.projectId) ? fields.projectId[0] : fields.projectId;
  if (!projectId) throw new ValidationAppError("projectId é obrigatório");

  const fileEntry = files.file;
  const file = Array.isArray(fileEntry) ? fileEntry[0] : fileEntry;
  if (!file) throw new ValidationAppError("Nenhum arquivo enviado (campo 'file')");
  if (!file.mimetype?.startsWith("image/")) throw new ValidationAppError("Só imagens são aceitas");

  const data = readFileSync(file.filepath);
  const media = await uploadMedia({
    ownerId: user.uid,
    projectId,
    filename: file.originalFilename ?? "upload",
    contentType: file.mimetype,
    data,
  });
  res.status(201).json(media);
});
