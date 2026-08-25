import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { requireAuth } from "../../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../../_lib/http";
import { autosaveSlides, getCurrentSlides } from "../../_lib/services/presentationService";
import { SlideSchema } from "../../_lib/schemas/presentation";
import { ValidationAppError } from "../../_lib/errors";

const AutosaveSchema = z.object({ slides: z.array(SlideSchema) });

// Autosave (section 24) — o cliente faz debounce e mostra "Salvando.../
// Salvo"; esta rota só precisa ser idempotente e rápida, o que
// autosaveSlides já garante (sobrescreve a versão atual em vez de criar
// uma nova a cada chamada).
export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "PUT"])) return;
  const user = await requireAuth(req);
  const id = req.query.id;
  if (typeof id !== "string") throw new ValidationAppError("id inválido");

  if (req.method === "GET") {
    res.status(200).json({ slides: await getCurrentSlides(user.uid, id) });
    return;
  }

  const { slides } = parseBody(AutosaveSchema, req.body);
  await autosaveSlides(user.uid, id, slides);
  res.status(200).json({ saved: true });
});
