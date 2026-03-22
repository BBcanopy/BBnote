import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AttachmentDb } from "../db/attachmentDb.js";
import type { NoteDb } from "../db/noteDb.js";
import type { AttachmentView } from "./models.js";
import type { StorageService } from "./storageService.js";

export class AttachmentService {
  constructor(
    private readonly attachmentDb: AttachmentDb,
    private readonly noteDb: NoteDb,
    private readonly storageService: StorageService
  ) {}

  async createAttachment(input: {
    ownerId: string;
    noteId: string;
    originalName: string;
    mimeType: string;
    content: Buffer;
  }): Promise<AttachmentView> {
    const note = this.noteDb.getById(input.ownerId, input.noteId);
    if (!note) {
      throw new Error("Note not found.");
    }
    const attachmentId = randomUUID();
    const saved = await this.storageService.saveAttachment({
      ownerId: input.ownerId,
      attachmentId,
      originalName: input.originalName,
      content: input.content
    });

    this.attachmentDb.insert({
      id: attachmentId,
      ownerId: input.ownerId,
      noteId: input.noteId,
      originalName: saved.safeName,
      storedPath: saved.filePath,
      mimeType: input.mimeType,
      sizeBytes: saved.sizeBytes,
      sha256: saved.sha256,
      createdAt: new Date().toISOString()
    });

    return {
      id: attachmentId,
      name: saved.safeName,
      mimeType: input.mimeType,
      sizeBytes: saved.sizeBytes,
      url: `/api/v1/attachments/${attachmentId}`,
      embedded: false
    };
  }

  getAttachment(ownerId: string, attachmentId: string) {
    const attachment = this.attachmentDb.getById(ownerId, attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    return attachment;
  }

  async deleteAttachment(ownerId: string, attachmentId: string) {
    const attachment = this.attachmentDb.getById(ownerId, attachmentId);
    if (!attachment) {
      throw new Error("Attachment not found.");
    }
    this.attachmentDb.delete(ownerId, attachmentId);
    await fs.rm(path.dirname(attachment.storedPath), { recursive: true, force: true });
  }
}
