import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { authHeaders, createTestAuthProvider, createTestConfig } from "../test-helpers.js";

describe("attachmentController integration", () => {
  let app: FastifyInstance;
  let token: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
    const config = createTestConfig(tempRoot);
    const oidc = createTestAuthProvider(config, {
      email: "avery@example.com",
      name: "Avery Stone",
      subject: "avery-stone"
    });

    app = await buildApp({
      authTesting: oidc.authTesting,
      config
    });
    token = oidc.accessToken;
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("uploads, downloads, and deletes image, audio, and video attachments", async () => {
    const noteId = await createPersistedNote(app, token);
    const fixtures = [
      {
        name: "diagram.png",
        mimeType: "image/png",
        content: Buffer.from("89504e470d0a1a0a", "hex")
      },
      {
        name: "voice.webm",
        mimeType: "audio/webm",
        content: Buffer.from("mock-audio-payload", "utf8")
      },
      {
        name: "clip.webm",
        mimeType: "video/webm",
        content: Buffer.from("mock-video-payload", "utf8")
      }
    ] as const;

    for (const fixture of fixtures) {
      const uploadResponse = await app.inject({
        method: "POST",
        url: `/api/v1/notes/${noteId}/attachments`,
        headers: {
          ...authHeaders(token),
          "content-type": fixtureMultipartContentType
        },
        payload: createMultipartPayload(fixture.name, fixture.mimeType, fixture.content)
      });

      expect(uploadResponse.statusCode).toBe(201);
      const uploaded = uploadResponse.json();
      expect(uploaded.name).toBe(fixture.name);
      expect(uploaded.mimeType).toBe(fixture.mimeType);
      expect(uploaded.sizeBytes).toBe(fixture.content.length);

      const downloadResponse = await app.inject({
        method: "GET",
        url: `/api/v1/attachments/${uploaded.id}`,
        headers: authHeaders(token)
      });
      expect(downloadResponse.statusCode).toBe(200);
      expect(downloadResponse.headers["content-type"]).toContain(fixture.mimeType);
      expect(downloadResponse.rawPayload.equals(fixture.content)).toBe(true);

      const deleteResponse = await app.inject({
        method: "DELETE",
        url: `/api/v1/attachments/${uploaded.id}`,
        headers: authHeaders(token)
      });
      expect(deleteResponse.statusCode).toBe(204);
      expect(app.bbnote.attachmentDb.getById("avery-stone", uploaded.id)).toBeUndefined();
    }
  });

  it("accepts audio uploads above Fastify's default 1 MiB multipart limit when they are within the app limit", async () => {
    const noteId = await createPersistedNote(app, token);
    const payload = Buffer.alloc(2 * 1024 * 1024, 0x61);

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/notes/${noteId}/attachments`,
      headers: {
        ...authHeaders(token),
        "content-type": fixtureMultipartContentType
      },
      payload: createMultipartPayload("song.mp3", "audio/mpeg", payload)
    });

    expect(uploadResponse.statusCode).toBe(201);
    expect(uploadResponse.json()).toEqual(expect.objectContaining({
      name: "song.mp3",
      mimeType: "audio/mpeg",
      sizeBytes: payload.length
    }));
  });

  it("returns a friendly error for oversized uploads", async () => {
    await app.close();

    const limitedRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-limit-"));
    tempRoot = limitedRoot;
    const config = createTestConfig(limitedRoot, {
      attachmentMaxBytes: 4
    });
    const oidc = createTestAuthProvider(config, {
      email: "avery@example.com",
      name: "Avery Stone",
      subject: "avery-stone"
    });
    app = await buildApp({
      authTesting: oidc.authTesting,
      config
    });
    token = oidc.accessToken;

    const noteId = await createPersistedNote(app, token);
    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/notes/${noteId}/attachments`,
      headers: {
        ...authHeaders(token),
        "content-type": fixtureMultipartContentType
      },
      payload: createMultipartPayload("oversized.txt", "text/plain", Buffer.from("12345", "utf8"))
    });

    expect(uploadResponse.statusCode).toBe(413);
    expect(uploadResponse.json()).toEqual({
      message: "Attachments larger than 4 bytes are not supported."
    });
  });
});

const fixtureBoundary = "bbnote-test-boundary";
const fixtureMultipartContentType = `multipart/form-data; boundary=${fixtureBoundary}`;

async function createPersistedNote(app: FastifyInstance, token: string) {
  const folderResponse = await app.inject({
    method: "POST",
    url: "/api/v1/folders",
    headers: authHeaders(token),
    payload: {
      name: "Media",
      parentId: null
    }
  });
  expect(folderResponse.statusCode).toBe(201);
  const folder = folderResponse.json();

  const noteResponse = await app.inject({
    method: "POST",
    url: "/api/v1/notes",
    headers: authHeaders(token),
    payload: {
      folderId: folder.id,
      title: "Media note",
      bodyMarkdown: ""
    }
  });
  expect(noteResponse.statusCode).toBe(201);
  return noteResponse.json().id as string;
}

function createMultipartPayload(filename: string, mimeType: string, content: Buffer) {
  return Buffer.concat([
    Buffer.from(`--${fixtureBoundary}\r\n`, "utf8"),
    Buffer.from(
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`,
      "utf8"
    ),
    content,
    Buffer.from(`\r\n--${fixtureBoundary}--\r\n`, "utf8")
  ]);
}
