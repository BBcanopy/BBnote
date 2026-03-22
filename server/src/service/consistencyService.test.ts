import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("consistencyService", () => {
  let app: FastifyInstance;
  let ownerId: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
    process.env.APP_PORT = "3000";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.OIDC_ISSUER_URL = "http://localhost:3000/mock-oidc";
    process.env.OIDC_CLIENT_ID_WEB = "bbnote-web";
    process.env.OIDC_CLIENT_ID_ANDROID = "bbnote-android";
    process.env.OIDC_SCOPES = "openid profile email";
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
    await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: {
        authorization: `Bearer ${issued.access_token}`
      }
    });
    ownerId = app.bbnote.database.connection.prepare<[], { id: string }>("select id from users limit 1").get()!.id;
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    delete process.env.APP_PORT;
    delete process.env.APP_BASE_URL;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID_WEB;
    delete process.env.OIDC_CLIENT_ID_ANDROID;
    delete process.env.OIDC_SCOPES;
    delete process.env.SQLITE_PATH;
    delete process.env.NOTES_ROOT;
    delete process.env.ATTACHMENTS_ROOT;
    delete process.env.EXPORTS_ROOT;
    delete process.env.MOCK_OIDC_ENABLED;
  });

  it("detects and repairs fts drift plus deep attachment metadata drift", async () => {
    const inbox = app.bbnote.folderDb.findInbox(ownerId)!;
    const note = await app.bbnote.noteService.createNote({
      ownerId,
      folderId: inbox.id,
      title: "Checklist",
      bodyMarkdown: "original body"
    });

    await fs.writeFile(
      app.bbnote.database.connection.prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?").get(note.id)!.filePath,
      "mutated body",
      "utf8"
    );

    const attachment = await app.bbnote.attachmentService.createAttachment({
      ownerId,
      noteId: note.id,
      originalName: "check.txt",
      mimeType: "text/plain",
      content: Buffer.from("123")
    });
    await fs.writeFile(
      app.bbnote.attachmentDb.getById(ownerId, attachment.id)!.storedPath,
      Buffer.from("1234567")
    );

    const report = await app.bbnote.consistencyService.run({
      ownerId,
      deep: true
    });
    expect(report.issues.some((issue) => issue.type === "fts-drift")).toBe(true);
    expect(report.issues.some((issue) => issue.type === "attachment-metadata-drift")).toBe(true);

    const repaired = await app.bbnote.consistencyService.run({
      ownerId,
      deep: true,
      repair: true
    });
    expect(repaired.repaired.some((entry) => entry.includes(note.id))).toBe(true);
    expect(repaired.repaired.some((entry) => entry.includes(attachment.id))).toBe(true);
  });
});
