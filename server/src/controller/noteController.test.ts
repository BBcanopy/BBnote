import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { DELETED_NOTES_FOLDER_NAME } from "../service/deletedNotesFolder.js";
import { SCRATCH_MAX_POINTS, SCRATCH_MAX_STROKES } from "../service/scratchpad.js";
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

  describe("scratch overlays", () => {
    const scratchpad = {
      version: 2 as const,
      layoutWidth: 720,
      strokes: [
        {
          tool: "draw" as const,
          width: 3,
          points: [
            { x: 120, y: 2400 },
            { x: 180.5, y: 2460.5 }
          ]
        },
        {
          tool: "erase" as const,
          width: 20,
          points: [{ x: 150, y: 2430 }]
        }
      ]
    };

    async function createNotebook(name: string) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/folders",
        headers: authHeaders(token),
        payload: { name, parentId: null }
      });
      expect(response.statusCode).toBe(201);
      return response.json() as { id: string };
    }

    function createNote(folderId: string, payload: Record<string, unknown> = {}) {
      return app.inject({
        method: "POST",
        url: "/api/v1/notes",
        headers: authHeaders(token),
        payload: { folderId, title: "Overlay note", bodyMarkdown: "Visible body only", ...payload }
      });
    }

    function updateNote(noteId: string, folderId: string, payload: Record<string, unknown> = {}) {
      return app.inject({
        method: "PUT",
        url: `/api/v1/notes/${noteId}`,
        headers: authHeaders(token),
        payload: { folderId, title: "Overlay note", bodyMarkdown: "Edited body", ...payload }
      });
    }

    async function readScratchpad(noteId: string) {
      const response = await app.inject({
        method: "GET",
        url: `/api/v1/notes/${noteId}`,
        headers: authHeaders(token)
      });
      expect(response.statusCode).toBe(200);
      return response.json().scratchpad;
    }

    it("stores the overlay outside the markdown file and round-trips it", async () => {
      const notebook = await createNotebook("Sketchbook");

      const created = await createNote(notebook.id, { scratchpad });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ bodyMarkdown: "Visible body only", scratchpad });

      const noteFilePath = app.bbnote.database.connection
        .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
        .get(created.json().id)?.filePath;
      await expect(fs.readFile(noteFilePath!, "utf8")).resolves.toBe("Visible body only");
      await expect(readScratchpad(created.json().id)).resolves.toEqual(scratchpad);
    });

    it("returns null for notes without an overlay and when an overlay has no strokes", async () => {
      const notebook = await createNotebook("Plain");

      const plain = await createNote(notebook.id);
      expect(plain.json().scratchpad).toBeNull();

      const empty = await createNote(notebook.id, { scratchpad: { ...scratchpad, strokes: [] } });
      expect(empty.statusCode).toBe(201);
      expect(empty.json().scratchpad).toBeNull();
    });

    it("keeps the overlay when an update omits it and clears it only for an explicit null", async () => {
      const notebook = await createNotebook("Partial updates");
      const { id } = (await createNote(notebook.id, { scratchpad })).json();

      const omitted = await updateNote(id, notebook.id);
      expect(omitted.statusCode).toBe(200);
      expect(omitted.json()).toMatchObject({ bodyMarkdown: "Edited body", scratchpad });

      const cleared = await updateNote(id, notebook.id, { scratchpad: null });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().scratchpad).toBeNull();
      await expect(readScratchpad(id)).resolves.toBeNull();
    });

    it("keeps the overlay through notebook moves, Deleted Notes, and restore", async () => {
      const source = await createNotebook("Source");
      const target = await createNotebook("Target");
      const { id } = (await createNote(source.id, { scratchpad })).json();

      const moved = await app.inject({
        method: "PATCH",
        url: `/api/v1/notes/${id}/move`,
        headers: authHeaders(token),
        payload: { folderId: target.id }
      });
      expect(moved.statusCode).toBe(200);
      expect(moved.json().scratchpad).toEqual(scratchpad);

      const trashed = await app.inject({
        method: "DELETE",
        url: `/api/v1/notes/${id}`,
        headers: authHeaders(token)
      });
      expect(trashed.statusCode).toBe(204);
      await expect(readScratchpad(id)).resolves.toEqual(scratchpad);

      const restored = await app.inject({
        method: "PATCH",
        url: `/api/v1/notes/${id}/move`,
        headers: authHeaders(token),
        payload: { folderId: source.id }
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().scratchpad).toEqual(scratchpad);
    });

    it("rejects overlays that are malformed or over the size limits", async () => {
      const notebook = await createNotebook("Limits");
      const point = { x: 1, y: 1 };
      const invalidOverlays = [
        { ...scratchpad, version: 1 },
        { ...scratchpad, layoutWidth: 0 },
        { ...scratchpad, strokes: [{ tool: "draw", width: 3, points: [] }] },
        { ...scratchpad, strokes: [{ tool: "laser", width: 3, points: [point] }] },
        { ...scratchpad, strokes: [{ tool: "draw", width: 3, points: [{ x: -1, y: 1 }] }] },
        { ...scratchpad, strokes: Array.from({ length: SCRATCH_MAX_STROKES + 1 }, () => ({ tool: "draw", width: 3, points: [point] })) },
        { ...scratchpad, strokes: [{ tool: "draw", width: 3, points: Array.from({ length: SCRATCH_MAX_POINTS + 1 }, () => point) }] }
      ];

      for (const overlay of invalidOverlays) {
        const response = await createNote(notebook.id, { scratchpad: overlay });
        expect(response.statusCode).toBe(400);
      }
    });

    it("accepts a full overlay even though its payload is larger than the default body limit", async () => {
      const notebook = await createNotebook("Full overlay");
      const points = Array.from({ length: SCRATCH_MAX_POINTS }, (_, index) => ({ x: 1000.5, y: 10000 + index + 0.5 }));
      const fullOverlay = { ...scratchpad, strokes: [{ tool: "draw" as const, width: 3, points }] };
      expect(JSON.stringify(fullOverlay).length).toBeGreaterThan(1024 * 1024);

      const created = await createNote(notebook.id, { scratchpad: fullOverlay });
      expect(created.statusCode).toBe(201);
      expect(created.json().scratchpad.strokes[0].points).toHaveLength(SCRATCH_MAX_POINTS);
    });

    it("reads unreleased version 1 overlays as empty and leaves them stored until redrawn", async () => {
      const notebook = await createNotebook("Legacy");
      const { id } = (await createNote(notebook.id)).json();
      const legacyJson = JSON.stringify({ version: 1, id: "old", width: 1000, height: 1000, strokes: [] });
      const readStoredScratchpad = () =>
        app.bbnote.database.connection
          .prepare<[string], { json: string | null }>("select scratchpad_json as json from notes where id = ?")
          .get(id)?.json;
      app.bbnote.database.connection.prepare("update notes set scratchpad_json = ? where id = ?").run(legacyJson, id);

      await expect(readScratchpad(id)).resolves.toBeNull();
      expect((await updateNote(id, notebook.id)).statusCode).toBe(200);
      expect(readStoredScratchpad()).toBe(legacyJson);

      expect((await updateNote(id, notebook.id, { scratchpad })).statusCode).toBe(200);
      await expect(readScratchpad(id)).resolves.toEqual(scratchpad);
    });
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

  it("moves notes into Deleted Notes on first delete and permanently deletes them from there", async () => {
    const notebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Projects",
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
        title: "Delete me softly",
        bodyMarkdown: "findmeafterdelete"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/notes/${created.id}/attachments`,
      headers: {
        ...authHeaders(token),
        "content-type": fixtureMultipartContentType
      },
      payload: createMultipartPayload("evidence.txt", "text/plain", Buffer.from("attachment-body", "utf8"))
    });
    expect(uploadResponse.statusCode).toBe(201);
    const uploadedAttachment = uploadResponse.json();

    const secondUploadResponse = await app.inject({
      method: "POST",
      url: `/api/v1/notes/${created.id}/attachments`,
      headers: {
        ...authHeaders(token),
        "content-type": fixtureMultipartContentType
      },
      payload: createMultipartPayload("follow-up.txt", "text/plain", Buffer.from("second-attachment-body", "utf8"))
    });
    expect(secondUploadResponse.statusCode).toBe(201);
    const secondUploadedAttachment = secondUploadResponse.json();

    const ownerRow = app.bbnote.database.connection
      .prepare<[], { id: string }>("select id from users limit 1")
      .get();

    const initialRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    const initialAttachment = app.bbnote.attachmentDb.getById(ownerRow!.id, uploadedAttachment.id);
    const secondInitialAttachment = app.bbnote.attachmentDb.getById(ownerRow!.id, secondUploadedAttachment.id);

    const firstDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token)
    });
    expect(firstDeleteResponse.statusCode).toBe(204);

    const foldersResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    expect(foldersResponse.statusCode).toBe(200);
    expect(foldersResponse.json().map((folder: { name: string }) => folder.name)).toEqual(["Projects", DELETED_NOTES_FOLDER_NAME]);
    const deletedNotesFolder = foldersResponse
      .json()
      .find((folder: { id: string; name: string }) => folder.name === DELETED_NOTES_FOLDER_NAME);
    expect(deletedNotesFolder).toBeDefined();

    const movedNoteResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token)
    });
    expect(movedNoteResponse.statusCode).toBe(200);
    expect(movedNoteResponse.json()).toMatchObject({
      id: created.id,
      folderId: deletedNotesFolder.id,
      attachments: expect.arrayContaining([
        expect.objectContaining({ id: uploadedAttachment.id, name: "evidence.txt" }),
        expect.objectContaining({ id: secondUploadedAttachment.id, name: "follow-up.txt" })
      ])
    });
    expect(movedNoteResponse.json().attachments).toHaveLength(2);

    const globalListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/notes",
      headers: authHeaders(token)
    });
    expect(globalListResponse.statusCode).toBe(200);
    expect(globalListResponse.json().items).toEqual([]);

    const globalSearchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?q=${encodeURIComponent("findmeafterdelete")}`,
      headers: authHeaders(token)
    });
    expect(globalSearchResponse.statusCode).toBe(200);
    expect(globalSearchResponse.json().items).toEqual([]);

    const deletedFolderSearchResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${deletedNotesFolder.id}&q=${encodeURIComponent("findmeafterdelete")}`,
      headers: authHeaders(token)
    });
    expect(deletedFolderSearchResponse.statusCode).toBe(200);
    expect(deletedFolderSearchResponse.json().items.map((note: { id: string }) => note.id)).toEqual([created.id]);

    const movedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string; folderId: string }>("select file_path as filePath, folder_id as folderId from notes where id = ?")
      .get(created.id);
    expect(movedRow?.folderId).toBe(deletedNotesFolder.id);
    expect(movedRow?.filePath).not.toBe(initialRow?.filePath);
    expect(movedRow?.filePath).toContain(`${path.sep}deleted${path.sep}`);
    await expect(fs.readFile(movedRow!.filePath, "utf8")).resolves.toContain("findmeafterdelete");
    await expect(fs.access(initialRow!.filePath)).rejects.toThrow();
    expect(app.bbnote.attachmentDb.getById(ownerRow!.id, uploadedAttachment.id)).toBeDefined();
    expect(app.bbnote.attachmentDb.getById(ownerRow!.id, secondUploadedAttachment.id)).toBeDefined();
    await expect(fs.readFile(initialAttachment!.storedPath, "utf8")).resolves.toBe("attachment-body");
    await expect(fs.readFile(secondInitialAttachment!.storedPath, "utf8")).resolves.toBe("second-attachment-body");

    const secondDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token)
    });
    expect(secondDeleteResponse.statusCode).toBe(204);

    expect(app.bbnote.noteDb.getById(ownerRow!.id, created.id)).toBeUndefined();
    expect(app.bbnote.attachmentDb.getById(ownerRow!.id, uploadedAttachment.id)).toBeUndefined();
    expect(app.bbnote.attachmentDb.getById(ownerRow!.id, secondUploadedAttachment.id)).toBeUndefined();
    expect(app.bbnote.noteDb.getFtsRows(ownerRow!.id)).toEqual([]);
    await expect(fs.access(movedRow!.filePath)).rejects.toThrow();
    await expect(fs.access(path.dirname(initialAttachment!.storedPath))).rejects.toThrow();
    await expect(fs.access(path.dirname(secondInitialAttachment!.storedPath))).rejects.toThrow();

    const deletedFolderListResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?folderId=${deletedNotesFolder.id}`,
      headers: authHeaders(token)
    });
    expect(deletedFolderListResponse.statusCode).toBe(200);
    expect(deletedFolderListResponse.json().items).toEqual([]);
  });

  it("moves a note with a missing source file into Deleted Notes instead of failing the delete request", async () => {
    const notebookResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "Projects",
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
        title: "Delete missing source",
        bodyMarkdown: "body that will disappear"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const createdRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    await fs.rm(createdRow!.filePath, { force: true });

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token)
    });
    expect(deleteResponse.statusCode).toBe(204);

    const foldersResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    expect(foldersResponse.statusCode).toBe(200);
    const deletedNotesFolder = foldersResponse
      .json()
      .find((folder: { id: string; name: string }) => folder.name === DELETED_NOTES_FOLDER_NAME);
    expect(deletedNotesFolder).toBeDefined();

    const movedNoteResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token)
    });
    expect(movedNoteResponse.statusCode).toBe(200);
    expect(movedNoteResponse.json()).toMatchObject({
      id: created.id,
      folderId: deletedNotesFolder.id,
      bodyMarkdown: ""
    });

    const movedRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string; folderId: string }>("select file_path as filePath, folder_id as folderId from notes where id = ?")
      .get(created.id);
    expect(movedRow?.folderId).toBe(deletedNotesFolder.id);
    expect(movedRow?.filePath).toContain(`${path.sep}deleted${path.sep}`);
    await expect(fs.readFile(movedRow!.filePath, "utf8")).resolves.toBe("");
  });
});

const fixtureBoundary = "bbnote-note-delete-boundary";
const fixtureMultipartContentType = `multipart/form-data; boundary=${fixtureBoundary}`;

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

