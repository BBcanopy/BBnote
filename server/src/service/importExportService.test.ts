import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("import/export services", () => {
  let app: FastifyInstance;
  let token: string;
  let ownerId: string;
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
    await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    ownerId = app.bbnote.database.connection.prepare<[], { id: string }>("select id from users limit 1").get()!.id;
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

  it("exports markdown bundles and imports them back", async () => {
    const inbox = app.bbnote.folderDb.findInbox(ownerId)!;
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
});

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
