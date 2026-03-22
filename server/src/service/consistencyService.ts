import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import type { AttachmentDb } from "../db/attachmentDb.js";
import type { NoteDb } from "../db/noteDb.js";
import type { AttachmentRecord, NoteRecord } from "./models.js";
import type { StorageService } from "./storageService.js";

export interface ConsistencyCheckOptions {
  ownerId?: string;
  folderId?: string;
  noteId?: string;
  deep?: boolean;
  repair?: boolean;
}

export interface ConsistencyIssue {
  type: string;
  message: string;
  ownerId?: string;
  noteId?: string;
  attachmentId?: string;
  path?: string;
  repairable: boolean;
}

export interface ConsistencyReport {
  checkedNotes: number;
  checkedAttachments: number;
  repaired: string[];
  issues: ConsistencyIssue[];
}

export class ConsistencyService {
  constructor(
    private readonly noteDb: NoteDb,
    private readonly attachmentDb: AttachmentDb,
    private readonly storageService: StorageService
  ) {}

  async run(options: ConsistencyCheckOptions): Promise<ConsistencyReport> {
    const notes = this.selectNotes(options);
    const attachments = this.selectAttachments(options, notes);
    const issues: ConsistencyIssue[] = [];
    const repaired: string[] = [];

    const notePathSet = new Set(notes.map((note) => normalizePathKey(note.filePath)));
    const attachmentPathSet = new Set(attachments.map((attachment) => normalizePathKey(attachment.storedPath)));

    for (const note of notes) {
      try {
        const body = await this.storageService.readMarkdown(note.filePath);
        const expectedBody = stripMarkdown(body);
        const ftsRow = this.noteDb.getFtsRows(note.ownerId).find((row) => row.noteId === note.id);
        if (!ftsRow || ftsRow.body !== expectedBody || ftsRow.title !== note.title || ftsRow.folderId !== note.folderId) {
          issues.push({
            type: "fts-drift",
            message: `FTS content is out of sync for note ${note.id}.`,
            ownerId: note.ownerId,
            noteId: note.id,
            path: note.filePath,
            repairable: true
          });
          if (options.repair) {
            this.noteDb.replaceFts({
              noteId: note.id,
              ownerId: note.ownerId,
              folderId: note.folderId,
              title: note.title,
              body: expectedBody
            });
            repaired.push(`Rebuilt FTS for note ${note.id}`);
          }
        }
      } catch {
        issues.push({
          type: "missing-note-file",
          message: `Note file is missing or unreadable for note ${note.id}.`,
          ownerId: note.ownerId,
          noteId: note.id,
          path: note.filePath,
          repairable: false
        });
      }
    }

    for (const attachment of attachments) {
      try {
        const fileBuffer = await fs.readFile(attachment.storedPath);
        if (options.deep) {
          const sizeBytes = fileBuffer.byteLength;
          const sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
          if (sizeBytes !== attachment.sizeBytes || sha256 !== attachment.sha256) {
            issues.push({
              type: "attachment-metadata-drift",
              message: `Attachment metadata is out of sync for attachment ${attachment.id}.`,
              ownerId: attachment.ownerId,
              attachmentId: attachment.id,
              path: attachment.storedPath,
              repairable: true
            });
            if (options.repair) {
              this.attachmentDb.updateDerivedMetadata(attachment.ownerId, attachment.id, {
                sizeBytes,
                sha256
              });
              repaired.push(`Updated metadata for attachment ${attachment.id}`);
            }
          }
        }
      } catch {
        issues.push({
          type: "missing-attachment-file",
          message: `Attachment file is missing for attachment ${attachment.id}.`,
          ownerId: attachment.ownerId,
          attachmentId: attachment.id,
          path: attachment.storedPath,
          repairable: false
        });
      }
    }

    const owners = new Set<string>([
      ...notes.map((note) => note.ownerId),
      ...attachments.map((attachment) => attachment.ownerId),
      ...(options.ownerId ? [options.ownerId] : [])
    ]);

    for (const ownerId of owners) {
      const orphanNoteFiles = (await this.storageService.listNoteFiles(ownerId)).filter(
        (filePath) => !notePathSet.has(normalizePathKey(filePath))
      );
      for (const orphan of orphanNoteFiles) {
        issues.push({
          type: "orphan-note-file",
          message: `Found note file with no database row.`,
          ownerId,
          path: orphan,
          repairable: false
        });
      }

      const orphanAttachmentFiles = (await this.storageService.listAttachmentFiles(ownerId)).filter(
        (filePath) => !attachmentPathSet.has(normalizePathKey(filePath))
      );
      for (const orphan of orphanAttachmentFiles) {
        issues.push({
          type: "orphan-attachment-file",
          message: `Found attachment file with no database row.`,
          ownerId,
          path: orphan,
          repairable: false
        });
      }
    }

    return {
      checkedNotes: notes.length,
      checkedAttachments: attachments.length,
      repaired,
      issues
    };
  }

  private selectNotes(options: ConsistencyCheckOptions): NoteRecord[] {
    let notes = options.ownerId ? this.noteDb.listAllByOwner(options.ownerId) : this.noteDb.listAll();
    if (options.folderId) {
      notes = notes.filter((note) => note.folderId === options.folderId);
    }
    if (options.noteId) {
      notes = notes.filter((note) => note.id === options.noteId);
    }
    return notes;
  }

  private selectAttachments(options: ConsistencyCheckOptions, notes: NoteRecord[]): AttachmentRecord[] {
    let attachments = options.ownerId ? this.attachmentDb.listByOwner(options.ownerId) : this.attachmentDb.listAll();
    const noteIds = new Set(notes.map((note) => note.id));
    if (options.folderId || options.noteId) {
      attachments = attachments.filter((attachment) => noteIds.has(attachment.noteId));
    }
    return attachments;
  }
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePathKey(filePath: string) {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
