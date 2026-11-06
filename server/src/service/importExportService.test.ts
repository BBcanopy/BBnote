import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { authHeaders, createTestAuthProvider, createTestConfig } from "../test-helpers.js";

describe("import/export services", () => {
  let app: FastifyInstance;
  let token: string;
  let ownerId: string;
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
    await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    ownerId = app.bbnote.database.connection.prepare<[], { id: string }>("select id from users limit 1").get()!.id;
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("exports markdown bundles and imports them back", async () => {
    const inbox = await app.bbnote.folderService.createFolder(ownerId, {
      name: "Projects",
      parentId: null
    });
    const note = await app.bbnote.noteService.createNote({
      ownerId,
      folderId: inbox.id,
      title: "Project charter",
      bodyMarkdown: "Initial draft"
    });

    const attachment = await app.bbnote.attachmentService.createAttachment({
      ownerId,
      noteId: note.id,
      originalName: "diagram.png",
      mimeType: "image/png",
      content: Buffer.from("fake-image-content")
    });

    await app.bbnote.noteService.updateNote({
      ownerId,
      noteId: note.id,
      folderId: inbox.id,
      title: note.title,
      bodyMarkdown: `Initial draft\n\n![diagram](${attachment.url})`
    });

    const exportJob = await app.bbnote.exportService.createExportJob(ownerId);
    const exportDownload = await app.bbnote.exportService.getExportDownload(ownerId, exportJob.id);
    const archive = await JSZip.loadAsync(await fs.readFile(exportDownload.filePath));
    const markdownEntry = archive
      .filter((relativePath) => relativePath.endsWith(".md"))
      .find((entry) => entry.name.toLowerCase().includes("charter"));
    expect(markdownEntry).toBeTruthy();
    const markdown = await markdownEntry!.async("string");
    expect(markdown).toContain("attachments:");
    expect(markdown).toContain(".assets/diagram.png");
    expect(markdown).not.toContain("/api/v1/attachments/");

    const importJob = await app.bbnote.importService.createImportJob({
      ownerId,
      source: "onenote",
      fileName: "round-trip.zip",
      buffer: await fs.readFile(exportDownload.filePath)
    });

    expect(importJob.status).toBe("completed");
    const importedSummary = JSON.parse(importJob.summaryJson);
    expect(importedSummary.createdCount).toBeGreaterThanOrEqual(1);
  });

  it("exports scratch overlays beside their note without touching the markdown", async () => {
    const notebook = await app.bbnote.folderService.createFolder(ownerId, { name: "Sketches", parentId: null });
    const scratchpad = {
      version: 2 as const,
      layoutWidth: 800,
      strokes: [{ tool: "draw" as const, width: 3, points: [{ x: 10, y: 20 }] }]
    };
    await app.bbnote.noteService.createNote({
      ownerId,
      folderId: notebook.id,
      title: "Annotated",
      bodyMarkdown: "Plain text only",
      scratchpad
    });

    const exportJob = await app.bbnote.exportService.createExportJob(ownerId);
    const exportDownload = await app.bbnote.exportService.getExportDownload(ownerId, exportJob.id);
    const archive = await JSZip.loadAsync(await fs.readFile(exportDownload.filePath));

    const noteEntry = archive.filter((relativePath) => relativePath.toLowerCase().includes("annotated") && relativePath.endsWith(".md"))[0];
    const noteMarkdown = await noteEntry.async("string");
    expect(noteMarkdown).toContain("Plain text only");
    expect(noteMarkdown).not.toContain("strokes");
    const scratchEntry = archive.file(noteEntry.name.replace(/\.md$/, ".scratch.json"));
    expect(scratchEntry).toBeTruthy();
    expect(JSON.parse(await scratchEntry!.async("string"))).toEqual(scratchpad);
  });
});

