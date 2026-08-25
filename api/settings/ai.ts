import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { getAiSettings, updateAiSettings } from "../_lib/services/settingsService";
import { AISettingsUpdateSchema } from "../_lib/schemas/settings";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "PUT"])) return;
  await requireAuth(req); // configurações de IA são globais, mas exigem login

  if (req.method === "GET") {
    res.status(200).json(await getAiSettings());
    return;
  }
  const payload = parseBody(AISettingsUpdateSchema, req.body);
  res.status(200).json(await updateAiSettings(payload));
});
