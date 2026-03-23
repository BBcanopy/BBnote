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
    expect(created.sortOrder).toBe(0);

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

    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: nestedNotebook.id,
        title: "Second roadmap",
        bodyMarkdown: "Second note"
      }
    });
    expect(secondCreateResponse.statusCode).toBe(201);
    expect(secondCreateResponse.json().sortOrder).toBe(1);

    const priorityListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${nestedNotebook.id}&sort=priority&order=asc`,
      headers: authHeaders(token)
    });
    expect(priorityListResponse.statusCode).toBe(200);
    expect(priorityListResponse.json().items.map((note: { title: string }) => note.title)).toEqual([
      "Meeting outline",
      "Second roadmap"
    ]);

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
    expect(updateResponse.json().sortOrder).toBe(0);

    const updatedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(updatedRow?.filePath).not.toBe(firstRow?.filePath);
    expect(updatedRow?.filePath).toContain("Archive");
    expect(updatedRow?.filePath).toContain("Launch-review");
    await expect(fs.readFile(updatedRow!.filePath, "utf8")).resolves.toContain("Moved into archive.");
    await expect(fs.access(firstRow!.filePath)).rejects.toThrow();

    const archivePriorityResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${archiveNotebook.id}&sort=priority&order=asc`,
      headers: authHeaders(token)
    });
    expect(archivePriorityResponse.statusCode).toBe(200);
    expect(archivePriorityResponse.json().items.map((note: { title: string }) => note.title)).toEqual(["Launch review"]);
  });

  it("reorders notes within a notebook and rejects incomplete reorder payloads", async () => {
    const notebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Backlog",
        parentId: null
      }
    });
    expect(notebookResponse.statusCode).toBe(201);
    const notebook = notebookResponse.json();

    const firstCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        title: "Alpha",
        bodyMarkdown: "alpha"
      }
    });
    const secondCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        title: "Beta",
        bodyMarkdown: "beta"
      }
    });
    const thirdCreateResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        title: "Gamma",
        bodyMarkdown: "gamma"
      }
    });

    const firstNote = firstCreateResponse.json();
    const secondNote = secondCreateResponse.json();
    const thirdNote = thirdCreateResponse.json();

    const invalidReorderResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/notes/reorder",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        orderedNoteIds: [thirdNote.id, firstNote.id]
      }
    });
    expect(invalidReorderResponse.statusCode).toBe(400);
    expect(invalidReorderResponse.json()).toEqual({
      message: "Ordered note list must include every note in the notebook exactly once."
    });

    const reorderResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/notes/reorder",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        orderedNoteIds: [thirdNote.id, firstNote.id, secondNote.id]
      }
    });
    expect(reorderResponse.statusCode).toBe(204);

    const reorderedListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${notebook.id}&sort=priority&order=asc`,
      headers: authHeaders(token)
    });
    expect(reorderedListResponse.statusCode).toBe(200);
    expect(reorderedListResponse.json().items.map((note: { title: string; sortOrder: number }) => [note.title, note.sortOrder])).toEqual([
      ["Gamma", 0],
      ["Alpha", 1],
      ["Beta", 2]
    ]);
  });
});

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
