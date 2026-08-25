import { getDb, serverTimestamp } from "../firestore";
import { TemplateCreateSchema, type Template, type TemplateCreateInput, type TemplateUpdateInput } from "../schemas/template";
import { NotFoundAppError } from "../errors";

const COLLECTION = "templates";

export async function createTemplate(ownerId: string | null, payload: TemplateCreateInput): Promise<Template> {
  const data = TemplateCreateSchema.parse(payload);
  const docRef = getDb().collection(COLLECTION).doc();
  await docRef.set({ ...data, ownerId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const snapshot = await docRef.get();
  return toTemplate(snapshot.id, snapshot.data()!);
}

// Templates são uma biblioteca compartilhada (ownerId=null) + templates
// próprios do usuário — Template Matcher olha pras duas.
export async function listTemplates(activeOnly = false): Promise<Template[]> {
  const snapshot = await getDb().collection(COLLECTION).orderBy("updatedAt", "desc").get();
  let templates = snapshot.docs.map((doc) => toTemplate(doc.id, doc.data()));
  if (activeOnly) templates = templates.filter((t) => t.active);
  return templates;
}

export async function getTemplate(templateId: string): Promise<Template> {
  const snapshot = await getDb().collection(COLLECTION).doc(templateId).get();
  if (!snapshot.exists) throw new NotFoundAppError("Template não encontrado");
  return toTemplate(snapshot.id, snapshot.data()!);
}

export async function updateTemplate(templateId: string, payload: TemplateUpdateInput): Promise<Template> {
  await getTemplate(templateId);
  const docRef = getDb().collection(COLLECTION).doc(templateId);
  await docRef.set({ ...payload, updatedAt: serverTimestamp() }, { merge: true });
  const snapshot = await docRef.get();
  return toTemplate(snapshot.id, snapshot.data()!);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await getTemplate(templateId);
  await getDb().collection(COLLECTION).doc(templateId).delete();
}

function toTemplate(id: string, data: Record<string, any>): Template {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
  } as Template;
}
