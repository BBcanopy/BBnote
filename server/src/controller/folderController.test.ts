import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("folderController integration", () => {
  let app: FastifyInstance;
  let token: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-folders-"));
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.OIDC_ISSUER_URL = "http://localhost:3000/mock-oidc";
    process.env.OIDC_CLIENT_ID_WEB = "bbnote-web";
    process.env.OIDC_CLIENT_ID_ANDROID = "bbnote-android";
    process.env.OIDC_CLIENT_SECRET = "bbnote-dev-client-secret";
    process.env.OIDC_SCOPES = "openid profile email";
    process.env.SESSION_SECRET = "session-secret";
    process.env.SQLITE_PATH = path.join(tempRoot, "db", "bbnote.sqlite");
    process.env.NOTES_ROOT = path.join(tempRoot, "notes");
    process.env.ATTACHMENTS_ROOT = path.join(tempRoot, "attachments");
    process.env.EXPORTS_ROOT = path.join(tempRoot, "exports");
    process.env.MOCK_OIDC_ENABLED = "true";

    app = await buildApp();
    const issued = await app.bbnote.mockOidcService!.issueTestToken({
      clientId: "bbnote-web",
      email: "jules@example.com",
      name: "Jules Carter"
    });
    token = issued.access_token;
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    delete process.env.APP_BASE_URL;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID_WEB;
    delete process.env.OIDC_CLIENT_ID_ANDROID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_SCOPES;
    delete process.env.SESSION_SECRET;
    delete process.env.SQLITE_PATH;
    delete process.env.NOTES_ROOT;
    delete process.env.ATTACHMENTS_ROOT;
    delete process.env.EXPORTS_ROOT;
    delete process.env.MOCK_OIDC_ENABLED;
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

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
