import { getDb, serverTimestamp } from "../firestore";
import { PresentationCreateSchema, type Presentation, type PresentationCreateInput, type PresentationVersion } from "../schemas/presentation";
import type { Slide } from "../schemas/presentation";
import { NotFoundAppError } from "../errors";
import { STALE_GENERATION_MS } from "../limits";

const PRESENTATIONS = "presentations";
const VERSIONS = "presentation_versions";

const STALE_ERROR_MESSAGE =
  "A geração anterior não terminou dentro do tempo esperado e foi marcada como falha automaticamente. Tente gerar novamente.";

// P1#1 — se o runtime for encerrado pelo timeout no meio de uma geração,
// o catch da aplicação não roda (o processo simplesmente morre) e a
// apresentação fica presa em "analyzing"/"generating" pra sempre. Em vez
// de um job de fundo (fora de escopo aqui), a PRÓXIMA leitura desta
// apresentação — usuário abrindo a página, ou uma nova tentativa de
// gerar — se auto-cura: se já passou STALE_GENERATION_MS desde que a
// geração começou, marca como "failed" aqui mesmo, sem precisar de
// nenhuma infraestrutura de fila/cron.
async function healIfStale(id: string, data: Record<string, any>): Promise<Record<string, any>> {
  if (data.status !== "analyzing" && data.status !== "generating") return data;
  const startedAtRaw = data.generationStartedAt;
  if (!startedAtRaw) return data; // sem marca de início — nada a curar (ex.: dado de antes desta correção)
  const startedAt = new Date(startedAtRaw).getTime();
  if (Number.isNaN(startedAt) || Date.now() - startedAt < STALE_GENERATION_MS) return data; // ainda dentro do tempo normal

  const healed = { ...data, status: "failed", lastError: STALE_ERROR_MESSAGE, generationStartedAt: null };
  await getDb().collection(PRESENTATIONS).doc(id).set(
    { status: "failed", lastError: STALE_ERROR_MESSAGE, generationStartedAt: null, updatedAt: serverTimestamp() },
    { merge: true },
  );
  return healed;
}

export async function createPresentation(ownerId: string, payload: PresentationCreateInput): Promise<Presentation> {
  const data = PresentationCreateSchema.parse(payload);
  const docRef = getDb().collection(PRESENTATIONS).doc();
  await docRef.set({
    ...data,
    templateId: data.templateId ?? null,
    ownerId,
    status: "draft",
    slideCount: 0,
    contentAnalysis: null,
    presentationPlan: null,
    designDirection: null,
    visualQaScore: null,
    currentVersion: 0,
    lastError: null,
    exportPaths: { pptx: null, pdf: null, png: [] },
    generationStartedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const snapshot = await docRef.get();
  return toPresentation(snapshot.id, snapshot.data()!);
}

export async function listPresentations(ownerId: string, projectId?: string): Promise<Presentation[]> {
  let query = getDb().collection(PRESENTATIONS).where("ownerId", "==", ownerId) as any;
  if (projectId) query = query.where("projectId", "==", projectId);
  const snapshot = await query.get();
  return snapshot.docs.map((d: any) => toPresentation(d.id, d.data()));
}

export async function getPresentation(ownerId: string, presentationId: string): Promise<Presentation> {
  const snapshot = await getDb().collection(PRESENTATIONS).doc(presentationId).get();
  if (!snapshot.exists || snapshot.data()!.ownerId !== ownerId) throw new NotFoundAppError("Apresentação não encontrada");
  const healed = await healIfStale(presentationId, snapshot.data()!);
  return toPresentation(presentationId, healed);
}

export async function updatePresentation(ownerId: string, presentationId: string, changes: Record<string, unknown>): Promise<Presentation> {
  await getPresentation(ownerId, presentationId);
  const docRef = getDb().collection(PRESENTATIONS).doc(presentationId);
  await docRef.set({ ...changes, updatedAt: serverTimestamp() }, { merge: true });
  const snapshot = await docRef.get();
  return toPresentation(snapshot.id, snapshot.data()!);
}

export async function deletePresentation(ownerId: string, presentationId: string): Promise<void> {
  await getPresentation(ownerId, presentationId);
  await getDb().collection(PRESENTATIONS).doc(presentationId).delete();
  const versions = await getDb().collection(VERSIONS).where("presentationId", "==", presentationId).get();
  const batch = getDb().batch();
  versions.docs.forEach((d: any) => batch.delete(getDb().collection(VERSIONS).doc(d.id)));
  await batch.commit();
}

// Checkpoint versionado (section 23) — cria uma NOVA versão e avança
// currentVersion. Usado depois de geração e de edições significativas da
// IA, não a cada tecla digitada (isso é autosaveSlides, abaixo).
export async function commitVersion(
  ownerId: string,
  presentationId: string,
  slides: Slide[],
  createdBy: "user" | "ai",
  changeSummary: string,
): Promise<Presentation> {
  const presentation = await getPresentation(ownerId, presentationId);
  const versionNumber = presentation.currentVersion + 1;
  const versionRef = getDb().collection(VERSIONS).doc();
  await versionRef.set({ presentationId, versionNumber, slides, createdBy, changeSummary, createdAt: serverTimestamp() });
  return updatePresentation(ownerId, presentationId, { currentVersion: versionNumber, slideCount: slides.length });
}

// Autosave (section 24) — sobrescreve os slides da versão atual sem criar
// uma nova entrada de histórico. Debounce/estado de "salvando" ficam no
// frontend; aqui só garante que a chamada é idempotente e barata.
export async function autosaveSlides(ownerId: string, presentationId: string, slides: Slide[]): Promise<void> {
  const presentation = await getPresentation(ownerId, presentationId);
  if (presentation.currentVersion === 0) {
    await commitVersion(ownerId, presentationId, slides, "user", "Autosave inicial");
    return;
  }
  const snapshot = await getDb().collection(VERSIONS).where("presentationId", "==", presentationId).where("versionNumber", "==", presentation.currentVersion).get();
  if (snapshot.empty) return;
  const doc = snapshot.docs[0];
  await getDb().collection(VERSIONS).doc(doc.id).set({ slides }, { merge: true });
  await updatePresentation(ownerId, presentationId, { slideCount: slides.length });
}

export async function getCurrentSlides(ownerId: string, presentationId: string): Promise<Slide[]> {
  const presentation = await getPresentation(ownerId, presentationId);
  if (presentation.currentVersion === 0) return [];
  const snapshot = await getDb()
    .collection(VERSIONS)
    .where("presentationId", "==", presentationId)
    .where("versionNumber", "==", presentation.currentVersion)
    .get();
  if (snapshot.empty) return [];
  return snapshot.docs[0].data().slides as Slide[];
}

export async function listVersions(ownerId: string, presentationId: string): Promise<PresentationVersion[]> {
  await getPresentation(ownerId, presentationId);
  const snapshot = await getDb().collection(VERSIONS).where("presentationId", "==", presentationId).get();
  return snapshot.docs
    .map((d: any) => toVersion(d.id, d.data()))
    .sort((a, b) => a.versionNumber - b.versionNumber);
}

// Restaura uma versão antiga como um NOVO checkpoint no topo do histórico —
// nunca reescreve/apaga o passado, então "desfazer" em si também é
// desfazível.
export async function revertToVersion(ownerId: string, presentationId: string, versionNumber: number): Promise<Presentation> {
  const versions = await listVersions(ownerId, presentationId);
  const target = versions.find((v) => v.versionNumber === versionNumber);
  if (!target) throw new NotFoundAppError("Versão não encontrada");
  return commitVersion(ownerId, presentationId, target.slides, "user", `Revertido pra versão ${versionNumber}`);
}

function toPresentation(id: string, data: Record<string, any>): Presentation {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
  } as Presentation;
}

function toVersion(id: string, data: Record<string, any>): PresentationVersion {
  return {
    id,
    presentationId: data.presentationId,
    versionNumber: data.versionNumber,
    slides: data.slides,
    createdBy: data.createdBy,
    changeSummary: data.changeSummary,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
  };
}
