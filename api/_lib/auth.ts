import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { VercelRequest } from "@vercel/node";
import { ForbiddenAppError, UnauthorizedAppError } from "./errors";

function ensureApp() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  initializeApp({
    credential: cert(JSON.parse(raw)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export interface AuthedUser {
  uid: string;
  email: string | null;
  admin: boolean;
}

// Único ponto de verificação de identidade — toda rota chama isso, nenhuma
// rota decodifica token por conta própria. Lança UnauthorizedAppError (401)
// em qualquer falha, nunca deixa passar um request sem uid verificado.
// `admin` vem do custom claim `admin: true` no token (setado via
// Admin SDK/console — nenhuma rota se autopromove a admin).
export async function requireAuth(req: VercelRequest): Promise<AuthedUser> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedAppError("Cabeçalho Authorization ausente ou inválido");
  }
  const token = header.slice("Bearer ".length);
  ensureApp();
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email ?? null, admin: decoded.admin === true };
  } catch {
    throw new UnauthorizedAppError("Token inválido ou expirado");
  }
}

// Pra ações administrativas globais (ex: mudar a chave da OpenAI pra todo
// mundo) — nunca basta estar logado, precisa do custom claim.
export async function requireAdmin(req: VercelRequest): Promise<AuthedUser> {
  const user = await requireAuth(req);
  if (!user.admin) throw new ForbiddenAppError("Essa ação exige permissão de administrador");
  return user;
}
