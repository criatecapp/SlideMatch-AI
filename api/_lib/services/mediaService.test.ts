import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { FAKE_SERVER_TIMESTAMP, FakeFirestore } from "../testing/fakeFirestore";

const fakeDb = new FakeFirestore();
vi.mock("../firestore", () => ({ getDb: () => fakeDb, serverTimestamp: () => FAKE_SERVER_TIMESTAMP }));

const { mockUploadBytes, mockDeleteObject } = vi.hoisted(() => ({
  mockUploadBytes: vi.fn(async () => {}),
  mockDeleteObject: vi.fn(async () => {}),
}));
vi.mock("../storage", () => ({
  buildStoragePath: (userId: string, projectId: string, kind: string, filename: string) => `users/${userId}/projects/${projectId}/${kind}/${filename}`,
  uploadBytes: mockUploadBytes,
  deleteObject: mockDeleteObject,
  signedUrl: vi.fn(async (path: string) => `https://signed.example/${path}`),
}));

import { deleteMedia, enrichMediaAnalysis, getMedia, listMedia, uploadMedia } from "./mediaService";

async function landscapePng(): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 400, channels: 3, background: { r: 200, g: 50, b: 50 } } }).png().toBuffer();
}

describe("mediaService", () => {
  beforeEach(() => {
    fakeDb.clear();
    mockUploadBytes.mockClear();
    mockDeleteObject.mockClear();
  });

  it("uploads media and derives real dimensions/orientation via sharp", async () => {
    const media = await uploadMedia({ ownerId: "u1", projectId: "p1", filename: "a.png", contentType: "image/png", data: await landscapePng() });
    expect(media.width).toBe(800);
    expect(media.height).toBe(400);
    expect(media.analysis.orientation).toBe("landscape");
    expect(media.url).toContain("signed.example");
    expect(mockUploadBytes).toHaveBeenCalledTimes(1);
  });

  it("listMedia only returns media for the given project", async () => {
    await uploadMedia({ ownerId: "u1", projectId: "p1", filename: "a.png", contentType: "image/png", data: await landscapePng() });
    await uploadMedia({ ownerId: "u1", projectId: "p2", filename: "b.png", contentType: "image/png", data: await landscapePng() });
    const list = await listMedia("u1", "p1");
    expect(list).toHaveLength(1);
  });

  it("enrichMediaAnalysis merges into the existing analysis", async () => {
    const media = await uploadMedia({ ownerId: "u1", projectId: "p1", filename: "a.png", contentType: "image/png", data: await landscapePng() });
    await enrichMediaAnalysis("u1", media.id, { role: "hero_image", subject: "produto" });
    const updated = await getMedia("u1", media.id);
    expect(updated.analysis.role).toBe("hero_image");
    expect(updated.analysis.orientation).toBe("landscape");
  });

  it("deleteMedia removes both the storage object and the doc", async () => {
    const media = await uploadMedia({ ownerId: "u1", projectId: "p1", filename: "a.png", contentType: "image/png", data: await landscapePng() });
    await deleteMedia("u1", media.id);
    expect(mockDeleteObject).toHaveBeenCalledTimes(1);
    await expect(getMedia("u1", media.id)).rejects.toThrow();
  });
});
