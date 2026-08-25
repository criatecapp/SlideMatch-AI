import sharp from "sharp";
import { getDb, serverTimestamp } from "../firestore";
import { buildStoragePath, signedUrl, uploadBytes, deleteObject } from "../storage";
import { MediaAnalysisSchema, type Media, type MediaAnalysis } from "../schemas/media";
import { NotFoundAppError } from "../errors";

const COLLECTION = "media";

export async function uploadMedia(params: {
  ownerId: string;
  projectId: string;
  filename: string;
  contentType: string;
  data: Buffer;
}): Promise<Media> {
  const path = buildStoragePath(params.ownerId, params.projectId, "images", `${Date.now()}_${params.filename}`);
  await uploadBytes(path, params.data, params.contentType);

  let width: number | null = null;
  let height: number | null = null;
  let orientation: MediaAnalysis["orientation"] = "landscape";
  try {
    const meta = await sharp(params.data).metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    if (width && height) {
      orientation = width === height ? "square" : width > height ? "landscape" : "portrait";
    }
  } catch {
    // metadados são best-effort — upload não falha por causa disso
  }

  const analysis = MediaAnalysisSchema.parse({ orientation, aspectRatio: width && height ? `${width}:${height}` : "16:9" });

  const docRef = getDb().collection(COLLECTION).doc();
  await docRef.set({
    ownerId: params.ownerId,
    projectId: params.projectId,
    filename: params.filename,
    contentType: params.contentType,
    storagePath: path,
    width,
    height,
    analysis,
    createdAt: serverTimestamp(),
  });
  const snapshot = await docRef.get();
  return toMedia(snapshot.id, snapshot.data()!, await signedUrl(path));
}

export async function listMedia(ownerId: string, projectId: string): Promise<Media[]> {
  const snapshot = await getDb().collection(COLLECTION).where("ownerId", "==", ownerId).where("projectId", "==", projectId).get();
  const docs = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
  return Promise.all(docs.map(async (d) => toMedia(d.id, d.data, await signedUrl(d.data.storagePath))));
}

export async function getMedia(ownerId: string, mediaId: string): Promise<Media> {
  const snapshot = await getDb().collection(COLLECTION).doc(mediaId).get();
  if (!snapshot.exists || snapshot.data()!.ownerId !== ownerId) throw new NotFoundAppError("Mídia não encontrada");
  return toMedia(snapshot.id, snapshot.data()!, await signedUrl(snapshot.data()!.storagePath));
}

export async function enrichMediaAnalysis(ownerId: string, mediaId: string, analysis: Partial<MediaAnalysis>): Promise<void> {
  const current = await getMedia(ownerId, mediaId);
  await getDb()
    .collection(COLLECTION)
    .doc(mediaId)
    .set({ analysis: { ...current.analysis, ...analysis } }, { merge: true });
}

export async function deleteMedia(ownerId: string, mediaId: string): Promise<void> {
  const media = await getMedia(ownerId, mediaId);
  await deleteObject(media.storagePath);
  await getDb().collection(COLLECTION).doc(mediaId).delete();
}

function toMedia(id: string, data: Record<string, any>, url: string | null): Media {
  return {
    id,
    ownerId: data.ownerId,
    projectId: data.projectId,
    filename: data.filename,
    contentType: data.contentType,
    storagePath: data.storagePath,
    url,
    width: data.width ?? null,
    height: data.height ?? null,
    analysis: data.analysis,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
  };
}
