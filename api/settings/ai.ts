import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAdmin, requireAuth } from "../_lib/auth";
import { handleRoute, methodGuard, parseBody } from "../_lib/http";
import { getAiSettings, updateAiSettings } from "../_lib/services/settingsService";
import { AISettingsUpdateSchema } from "../_lib/schemas/settings";

export default handleRoute(async (req: VercelRequest, res: VercelResponse) => {
  if (!methodGuard(req, res, ["GET", "PUT"])) return;

  if (req.method === "GET") {
    await requireAuth(req); // leitura não vaza a chave, só booleans/flags — qualquer logado pode ver
    res.status(200).json(await getAiSettings());
    return;
  }

  // Mudar as flags globais ou a chave da OpenAI é uma ação administrativa
  // — nunca basta estar logado (section 28: permissões administrativas).
  await requireAdmin(req);
  const payload = parseBody(AISettingsUpdateSchema, req.body);
  res.status(200).json(await updateAiSettings(payload));
});
