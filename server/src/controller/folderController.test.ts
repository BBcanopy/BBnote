import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { authHeaders, createTestAuthProvider, createTestConfig } from "../test-helpers.js";

describe("folderController integration", () => {
  let app: FastifyInstance;
  let token: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-folders-"));
    const config = createTestConfig(tempRoot);
    const oidc = createTestAuthProvider(config, {
      email: "jules@example.com",
      name: "Jules Carter",
      subject: "jules-carter"
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

  it("reorders notebooks and prevents descendant cycles", async () => {
    const alpha = await createNotebook(app, token, "Alpha", null);
    const beta = await createNotebook(app, token, "Beta", null);
    const gamma = await createNotebook(app, token, "Gamma", null);

    const nestGamma = await app.inject({
      method: "PATCH",
      url: `/api/v1/folders/${gamma.id}`,
      headers: authHeaders(token),
      payload: {
        name: "Gamma",
        parentId: alpha.id,
        sortOrder: 0
      }
    });
    expect(nestGamma.statusCode).toBe(200);

    const moveBetaFirst = await app.inject({
      method: "PATCH",
      url: `/api/v1/folders/${beta.id}`,
      headers: authHeaders(token),
      payload: {
        name: "Beta",
        parentId: null,
        sortOrder: 0
      }
    });
    expect(moveBetaFirst.statusCode).toBe(200);

    const moveAlphaSecond = await app.inject({
      method: "PATCH",
      url: `/api/v1/folders/${alpha.id}`,
      headers: authHeaders(token),
      payload: {
        name: "Alpha",
        parentId: null,
        sortOrder: 1
      }
    });
    expect(moveAlphaSecond.statusCode).toBe(200);

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().map((folder: { name: string }) => folder.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(listResponse.json().find((folder: { id: string }) => folder.id === gamma.id)).toMatchObject({
      parentId: alpha.id,
      path: "Alpha / Gamma"
    });

    const ownerRow = app.bbnote.database.connection
      .prepare<[], { id: string }>("select id from users limit 1")
      .get();

    await expect(
      app.bbnote.folderService.updateFolder(ownerRow!.id, alpha.id, {
        name: "Alpha",
        parentId: gamma.id,
        sortOrder: 0
      })
    ).rejects.toThrow(/descendants/i);
  });
});

async function createNotebook(app: FastifyInstance, token: string, name: string, parentId: string | null) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/folders",
    headers: authHeaders(token),
    payload: {
      name,
      parentId
    }
  });

  expect(response.statusCode).toBe(201);
  return response.json() as { id: string; name: string };
}

