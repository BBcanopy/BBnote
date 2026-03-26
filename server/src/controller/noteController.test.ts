import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { authHeaders, createTestAuthProvider, createTestConfig } from "../test-helpers.js";

describe("noteController integration", () => {
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

  it("requires notebooks for persisted notes and rewrites markdown paths when title or notebook changes", async () => {
    const hyphenatedSearchTerm = "budget-20260325-ffffffffffffffffffffffffffffffff";

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

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: nestedNotebook.id,
        title: "Meeting outline",
        bodyMarkdown: `# Budget\n\nPlan the Q2 launch around ${hyphenatedSearchTerm}.`
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
    await expect(fs.readFile(firstRow!.filePath, "utf8")).resolves.toContain(hyphenatedSearchTerm);

    const searchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?q=${encodeURIComponent("Budget")}&folderId=${nestedNotebook.id}`,
      headers: authHeaders(token)
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().items).toHaveLength(1);

    const hyphenSearchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?q=${encodeURIComponent(hyphenatedSearchTerm)}&folderId=${nestedNotebook.id}`,
      headers: authHeaders(token)
    });
    expect(hyphenSearchResponse.statusCode).toBe(200);
    expect(hyphenSearchResponse.json().items).toHaveLength(1);

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

  it("persists notes with blank titles using untitled slugs and allows blank-title updates", async () => {
    const notebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Scratch",
        parentId: null
      }
    });
    expect(notebookResponse.statusCode).toBe(201);
    const notebook = notebookResponse.json();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        title: "   ",
        bodyMarkdown: ""
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created.title).toBe("");

    const createdRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(createdRow?.filePath).toContain("Scratch");
    expect(createdRow?.filePath).toContain("untitled");

    const updateResponse = await app.inject({
      method: "PUT",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token),
      payload: {
        folderId: notebook.id,
        title: "",
        bodyMarkdown: "still blank title"
      }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().title).toBe("");

    const updatedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(updatedRow?.filePath).toContain("untitled");
    await expect(fs.readFile(updatedRow!.filePath, "utf8")).resolves.toContain("still blank title");
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

  it("moves notes into another notebook through the dedicated move endpoint", async () => {
    const sourceNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Source",
        parentId: null
      }
    });
    expect(sourceNotebookResponse.statusCode).toBe(201);
    const sourceNotebook = sourceNotebookResponse.json();

    const targetNotebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Target",
        parentId: null
      }
    });
    expect(targetNotebookResponse.statusCode).toBe(201);
    const targetNotebook = targetNotebookResponse.json();

    const existingTargetResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: targetNotebook.id,
        title: "Existing target note",
        bodyMarkdown: "target"
      }
    });
    expect(existingTargetResponse.statusCode).toBe(201);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: sourceNotebook.id,
        title: "Move me",
        bodyMarkdown: "keep this body"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const firstRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);

    const moveResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/notes/${created.id}/move`,
      headers: authHeaders(token),
      payload: {
        folderId: targetNotebook.id
      }
    });
    expect(moveResponse.statusCode).toBe(200);
    expect(moveResponse.json()).toMatchObject({
      id: created.id,
      folderId: targetNotebook.id,
      sortOrder: 1,
      title: "Move me"
    });

    const updatedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string; folderId: string; sortOrder: number }>(
        "select file_path as filePath, folder_id as folderId, sort_order as sortOrder from notes where id = ?"
      )
      .get(created.id);
    expect(updatedRow?.folderId).toBe(targetNotebook.id);
    expect(updatedRow?.sortOrder).toBe(1);
    expect(updatedRow?.filePath).not.toBe(firstRow?.filePath);
    expect(updatedRow?.filePath).toContain("Target");
    await expect(fs.readFile(updatedRow!.filePath, "utf8")).resolves.toContain("keep this body");
    await expect(fs.access(firstRow!.filePath)).rejects.toThrow();

    const targetPriorityResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${targetNotebook.id}&sort=priority&order=asc`,
      headers: authHeaders(token)
    });
    expect(targetPriorityResponse.statusCode).toBe(200);
    expect(targetPriorityResponse.json().items.map((note: { title: string; sortOrder: number }) => [note.title, note.sortOrder])).toEqual([
      ["Existing target note", 0],
      ["Move me", 1]
    ]);
  });
});

