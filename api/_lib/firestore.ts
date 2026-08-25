import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";

let db: Firestore | undefined;

function ensureApp() {
  if (getApps().length > 0) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }
  const serviceAccount = JSON.parse(raw);
  initializeApp({
    credential: cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

// getDb() is the seam every service goes through — tests mock this module
// wholesale (see _lib/testing/fakeFirestore.ts) instead of hitting a real
// Firestore instance.
export function getDb(): Firestore {
  ensureApp();
  if (!db) db = getFirestore();
  return db;
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}
