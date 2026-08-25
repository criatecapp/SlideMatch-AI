import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard } from "../../_lib/http";
import { getCurrentSlides, getPresentation, updatePresentation } from "../../_lib/services/presentationService";
import { getTemplate } from "../../_lib/services/templateService";
import { exportToPdf, exportToPngs, exportToPptx } from "../../_lib/export/exportService";
import { buildStoragePath, signedUrl, uploadBytes } from "../../_lib/storage";
import { ValidationAppError } from "../../_lib/errors";

export const config = { maxDuration: 60 };

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["POST"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");
  const format = req.query.format;
  if (format !== "pptx" && format !== "pdf" && format !== "png") {
    throw new ValidationAppError("format precisa ser pptx, pdf ou png");
  }

  const presentation = await getPresentation(user.uid, id);
  if (!presentation.templateId) throw new ValidationAppError("Apresentação sem template — gere antes de exportar");
  const template = await getTemplate(presentation.templateId);
  const slides = await getCurrentSlides(user.uid, id);
  if (slides.length === 0) throw new ValidationAppError("Apresentação sem slides — gere antes de exportar");

  if (format === "pptx") {
    const buf = await exportToPptx(slides, template.layouts, template.designSystem, presentation.aspectRatio);
    const path = buildStoragePath(user.uid, presentation.projectId, "exports", `${id}.pptx`);
    await uploadBytes(path, buf, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    const url = await signedUrl(path);
    await updatePresentation(user.uid, id, { exportPaths: { ...presentation.exportPaths, pptx: path } });
    res.status(200).json({ url });
    return;
  }

  if (format === "pdf") {
    const buf = await exportToPdf(slides, template.layouts, template.designSystem);
    const path = buildStoragePath(user.uid, presentation.projectId, "exports", `${id}.pdf`);
    await uploadBytes(path, buf, "application/pdf");
    const url = await signedUrl(path);
    await updatePresentation(user.uid, id, { exportPaths: { ...presentation.exportPaths, pdf: path } });
    res.status(200).json({ url });
    return;
  }

  const pngs = await exportToPngs(slides, template.layouts, template.designSystem);
  const urls: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < pngs.length; i++) {
    const path = buildStoragePath(user.uid, presentation.projectId, "exports", `${id}_slide_${i + 1}.png`);
    await uploadBytes(path, pngs[i], "image/png");
    paths.push(path);
    urls.push(await signedUrl(path));
  }
  await updatePresentation(user.uid, id, { exportPaths: { ...presentation.exportPaths, png: paths } });
  res.status(200).json({ urls });
});
