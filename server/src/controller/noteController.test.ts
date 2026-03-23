import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("noteController integration", () => {
  let app: FastifyInstance;
  let token: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
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
      email: "avery@example.com",
      name: "Avery Stone"
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

  it("requires notebooks for persisted notes and rewrites markdown paths when title or notebook changes", async () => {
    const listResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([]);

    const missingNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        title: "Missing notebook",
        bodyMarkdown: ""
      }
    });
    expect(missingNotebookResponse.statusCode).toBe(400);

    const topLevelNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Projects",
        parentId: null
      }
    });
    expect(topLevelNotebookResponse.statusCode).toBe(201);
    const topLevelNotebook = topLevelNotebookResponse.json();

    const nestedNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Roadmaps",
        parentId: topLevelNotebook.id
      }
    });
    expect(nestedNotebookResponse.statusCode).toBe(201);
    const nestedNotebook = nestedNotebookResponse.json();

    const archiveNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Archive",
        parentId: null
      }
    });
    expect(archiveNotebookResponse.statusCode).toBe(201);
    const archiveNotebook = archiveNotebookResponse.json();

    const blankTitleResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: nestedNotebook.id,
        title: "   ",
        bodyMarkdown: ""
      }
    });
    expect(blankTitleResponse.statusCode).toBe(400);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: nestedNotebook.id,
        title: "Meeting outline",
        bodyMarkdown: "# Budget\n\nPlan the Q2 launch."
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const firstRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(firstRow?.filePath).toContain("Roadmaps");
    expect(firstRow?.filePath).toContain("Meeting-outline");
    expect(firstRow?.filePath).toContain(created.id);
    await expect(fs.readFile(firstRow!.filePath, "utf8")).resolves.toContain("Plan the Q2 launch.");

    const searchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?q=${encodeURIComponent("Budget")}&folderId=${nestedNotebook.id}`,
      headers: authHeaders(token)
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().items).toHaveLength(1);

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token),
      payload: {
        folderId: archiveNotebook.id,
        title: "Launch review",
        bodyMarkdown: "Moved into archive."
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const updatedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(updatedRow?.filePath).not.toBe(firstRow?.filePath);
    expect(updatedRow?.filePath).toContain("Archive");
    expect(updatedRow?.filePath).toContain("Launch-review");
    await expect(fs.readFile(updatedRow!.filePath, "utf8")).resolves.toContain("Moved into archive.");
    await expect(fs.access(firstRow!.filePath)).rejects.toThrow();
  });
});

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
