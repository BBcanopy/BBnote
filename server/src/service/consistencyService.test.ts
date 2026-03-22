import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { ConsistencyService } from "./consistencyService.js";
import type { AttachmentRecord, NoteRecord } from "./models.js";

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

  it("treats windows path casing differences as the same file", async () => {
    if (process.platform !== "win32") {
      return;
    }

    const notePath = "d:\\Code\\bbnote\\server\\data\\notes\\owner\\Inbox--folder\\2026-03-22--note--1.md";
    const attachmentPath = "d:\\Code\\bbnote\\server\\data\\attachments\\owner\\attachment\\budget.txt";
    const notes: NoteRecord[] = [
      {
        id: "note-1",
        ownerId: "owner-1",
        folderId: "folder-1",
        title: "Case check",
        filePath: notePath,
        createdAt: "2026-03-22T00:00:00.000Z",
        updatedAt: "2026-03-22T00:00:00.000Z",
        lastOpenedAt: null,
        sourceApp: null,
        sourceId: null,
        sourceTagsJson: "[]"
      }
    ];
    const attachments: AttachmentRecord[] = [
      {
        id: "attachment-1",
        ownerId: "owner-1",
        noteId: "note-1",
        originalName: "budget.txt",
        storedPath: attachmentPath,
        mimeType: "text/plain",
        sizeBytes: 6,
        sha256: "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
        createdAt: "2026-03-22T00:00:00.000Z"
      }
    ];
    const service = new ConsistencyService(
      {
        listAll: () => notes,
        listAllByOwner: () => notes,
        getFtsRows: () => [{ noteId: "note-1", ownerId: "owner-1", folderId: "folder-1", title: "Case check", body: "body" }]
      } as unknown as any,
      {
        listAll: () => attachments,
        listByOwner: () => attachments
      } as unknown as any,
      {
        readMarkdown: async () => "body",
        listNoteFiles: async () => [notePath.replace(/^d:/, "D:")],
        listAttachmentFiles: async () => [attachmentPath.replace(/^d:/, "D:")]
      } as unknown as any
    );

    const report = await service.run({
      ownerId: "owner-1"
    });

    expect(report.issues.filter((issue) => issue.type.startsWith("orphan-"))).toHaveLength(0);
  });
});
