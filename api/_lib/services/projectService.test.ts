import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();

vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

import { NotFoundAppError } from "../errors";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./projectService";

describe("projectService", () => {
  beforeEach(() => fakeDb.clear());

  it("creates a project with defaults filled in", async () => {
    const project = await createProject("user-1", { title: "Segurança" } as any);
    expect(project.title).toBe("Segurança");
    expect(project.minSlides).toBe(5);
    expect(project.ownerId).toBe("user-1");
    expect(project.id).toBeTruthy();
  });

  it("getProject throws NotFoundAppError for another user's project", async () => {
    const project = await createProject("user-1", { title: "P" } as any);
    await expect(getProject("user-2", project.id)).rejects.toThrow(NotFoundAppError);
  });

  it("listProjects only returns the owner's projects, newest first", async () => {
    await createProject("user-1", { title: "A" } as any);
    await createProject("user-2", { title: "B" } as any);
    await createProject("user-1", { title: "C" } as any);
    const list = await listProjects("user-1");
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.ownerId === "user-1")).toBe(true);
  });

  it("updateProject merges changes", async () => {
    const project = await createProject("user-1", { title: "A" } as any);
    const updated = await updateProject("user-1", project.id, { title: "B" });
    expect(updated.title).toBe("B");
  });

  it("deleteProject removes the project", async () => {
    const project = await createProject("user-1", { title: "A" } as any);
    await deleteProject("user-1", project.id);
    await expect(getProject("user-1", project.id)).rejects.toThrow(NotFoundAppError);
  });
});
