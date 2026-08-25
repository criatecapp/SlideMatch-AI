import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

function ensureApp() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  initializeApp({
    credential: cert(JSON.parse(raw)),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

function bucket() {
  ensureApp();
  return getStorage().bucket();
}

export function buildStoragePath(userId: string, projectId: string, kind: string, filename: string): string {
  return `users/${userId}/projects/${projectId}/${kind}/${filename}`;
}

export async function uploadBytes(path: string, data: Buffer, contentType: string): Promise<void> {
  await bucket().file(path).save(data, { contentType, resumable: false });
}

export async function deleteObject(path: string): Promise<void> {
  await bucket().file(path).delete({ ignoreNotFound: true });
}

export async function signedUrl(path: string, expiresInMs = 1000 * 60 * 60): Promise<string> {
  const [url] = await bucket()
    .file(path)
    .getSignedUrl({ action: "read", expires: Date.now() + expiresInMs });
  return url;
}
