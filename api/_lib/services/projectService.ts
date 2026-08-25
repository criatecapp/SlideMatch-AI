import { getDb, serverTimestamp } from "../firestore";
import { ProjectCreateSchema, type Project, type ProjectCreateInput, type ProjectUpdateInput } from "../schemas/project";
import { NotFoundAppError } from "../errors";

const COLLECTION = "projects";

export async function createProject(ownerId: string, payload: ProjectCreateInput): Promise<Project> {
  const data = ProjectCreateSchema.parse(payload);
  const docRef = getDb().collection(COLLECTION).doc();
  await docRef.set({ ...data, ownerId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  const snapshot = await docRef.get();
  return toProject(snapshot.id, snapshot.data()!);
}

export async function listProjects(ownerId: string, limit = 50): Promise<Project[]> {
  const snapshot = await getDb().collection(COLLECTION).where("ownerId", "==", ownerId).orderBy("updatedAt", "desc").limit(limit).get();
  return snapshot.docs.map((doc) => toProject(doc.id, doc.data()));
}

export async function getProject(ownerId: string, projectId: string): Promise<Project> {
  const snapshot = await getDb().collection(COLLECTION).doc(projectId).get();
  if (!snapshot.exists || snapshot.data()!.ownerId !== ownerId) {
    throw new NotFoundAppError("Projeto não encontrado");
  }
  return toProject(snapshot.id, snapshot.data()!);
}

export async function updateProject(ownerId: string, projectId: string, payload: ProjectUpdateInput): Promise<Project> {
  await getProject(ownerId, projectId);
  const docRef = getDb().collection(COLLECTION).doc(projectId);
  await docRef.set({ ...payload, updatedAt: serverTimestamp() }, { merge: true });
  const snapshot = await docRef.get();
  return toProject(snapshot.id, snapshot.data()!);
}

export async function deleteProject(ownerId: string, projectId: string): Promise<void> {
  await getProject(ownerId, projectId);
  await getDb().collection(COLLECTION).doc(projectId).delete();
}

function toProject(id: string, data: Record<string, any>): Project {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    updatedAt: data.updatedAt?.toDate?.().toISOString() ?? null,
  } as Project;
}
