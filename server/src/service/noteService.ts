import { randomUUID } from "node:crypto";
import type { FolderDb } from "../db/folderDb.js";
import type { NoteDb } from "../db/noteDb.js";
import type { AttachmentRecord, NoteDetail, NoteSummary, PaginatedNotes } from "./models.js";
import { decodeCursor, encodeCursor } from "./paginationService.js";
import type { StorageService } from "./storageService.js";

interface ListOptions {
  ownerId: string;
  folderId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  sort?: "updatedAt" | "createdAt" | "title";
  order?: "asc" | "desc";
}

export class NoteService {
  constructor(
    private readonly noteDb: NoteDb,
    private readonly folderDb: FolderDb,
    private readonly storageService: StorageService,
    private readonly attachmentsResolver: (noteId: string) => AttachmentRecord[]
  ) {}

  async listNotes(options: ListOptions): Promise<PaginatedNotes> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = decodeCursor(options.cursor);
    const records = options.q
      ? this.noteDb.search({
          ownerId: options.ownerId,
          folderId: options.folderId,
          query: options.q,
          limit: limit + 1,
          offset
        })
      : this.noteDb.list({
          ownerId: options.ownerId,
          folderId: options.folderId,
          limit: limit + 1,
          offset,
          sort: options.sort ?? "updatedAt",
          order: options.order ?? "desc"
        });

    const page = records.slice(0, limit);
    const items = await Promise.all(
      page.map(async (record) => {
        const body = await this.storageService.readMarkdown(record.filePath);
        return {
          id: record.id,
          folderId: record.folderId,
          title: record.title,
          excerpt: excerptFromMarkdown(body),
          updatedAt: record.updatedAt,
          attachmentCount: this.attachmentsResolver(record.id).length
        } satisfies NoteSummary;
      })
    );

    return {
      items,
      nextCursor: records.length > limit ? encodeCursor(offset + limit) : null
    };
  }

  async getNote(ownerId: string, noteId: string): Promise<NoteDetail> {
    const record = this.noteDb.getById(ownerId, noteId);
    if (!record) {
      throw new Error("Note not found.");
    }
    const bodyMarkdown = await this.storageService.readMarkdown(record.filePath);
    this.noteDb.update(ownerId, noteId, {
      folderId: record.folderId,
      title: record.title,
      updatedAt: record.updatedAt,
      lastOpenedAt: new Date().toISOString()
    });
    return {
      id: record.id,
      folderId: record.folderId,
      title: record.title,
      bodyMarkdown,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      attachments: this.attachmentsResolver(record.id).map((attachment) => ({
        id: attachment.id,
        name: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        url: `/api/v1/attachments/${attachment.id}`,
        embedded: bodyMarkdown.includes(`/api/v1/attachments/${attachment.id}`)
      }))
    };
  }

  async createNote(input: {
    ownerId: string;
    folderId?: string;
    title: string;
    bodyMarkdown: string;
    createdAt?: string;
    updatedAt?: string;
    sourceApp?: string | null;
    sourceId?: string | null;
    sourceTagsJson?: string;
  }) {
    const folder =
      (input.folderId ? this.folderDb.getById(input.ownerId, input.folderId) : undefined) ??
      this.folderDb.findInbox(input.ownerId);
    if (!folder) {
      throw new Error("Folder not found.");
    }
    const noteId = randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const trimmedTitle = input.title.trim() || "Untitled note";
    const filePath = await this.storageService.createNoteFile({
      ownerId: input.ownerId,
      storageDirName: folder.storageDirName,
      noteId,
      title: trimmedTitle,
      createdAt,
      bodyMarkdown: input.bodyMarkdown
    });
    try {
      this.noteDb.insert({
        id: noteId,
        ownerId: input.ownerId,
        folderId: folder.id,
        title: trimmedTitle,
        filePath,
        createdAt,
        updatedAt,
        lastOpenedAt: null,
        sourceApp: input.sourceApp ?? null,
        sourceId: input.sourceId ?? null,
        sourceTagsJson: input.sourceTagsJson ?? "[]"
      });
      this.noteDb.replaceFts({
        noteId,
        ownerId: input.ownerId,
        folderId: folder.id,
        title: trimmedTitle,
        body: stripMarkdown(input.bodyMarkdown)
      });
    } catch (error) {
      await this.storageService.deleteFile(filePath);
      throw error;
    }
    return this.getNote(input.ownerId, noteId);
  }

  async updateNote(input: {
    ownerId: string;
    noteId: string;
    folderId?: string;
    title: string;
    bodyMarkdown: string;
  }) {
    const record = this.noteDb.getById(input.ownerId, input.noteId);
    if (!record) {
      throw new Error("Note not found.");
    }
    const folder =
      (input.folderId ? this.folderDb.getById(input.ownerId, input.folderId) : undefined) ??
      this.folderDb.getById(input.ownerId, record.folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }

    const previousBody = await this.storageService.readMarkdown(record.filePath);
    await this.storageService.writeMarkdown(record.filePath, input.bodyMarkdown);

    try {
      const updatedAt = new Date().toISOString();
      const trimmedTitle = input.title.trim() || "Untitled note";
      this.noteDb.update(input.ownerId, input.noteId, {
        folderId: folder.id,
        title: trimmedTitle,
        updatedAt,
        lastOpenedAt: new Date().toISOString()
      });
      this.noteDb.replaceFts({
        noteId: input.noteId,
        ownerId: input.ownerId,
        folderId: folder.id,
        title: trimmedTitle,
        body: stripMarkdown(input.bodyMarkdown)
      });
    } catch (error) {
      await this.storageService.writeMarkdown(record.filePath, previousBody);
      throw error;
    }
    return this.getNote(input.ownerId, input.noteId);
  }

  async deleteNote(ownerId: string, noteId: string) {
    const record = this.noteDb.getById(ownerId, noteId);
    if (!record) {
      throw new Error("Note not found.");
    }
    this.noteDb.deleteFts(noteId);
    this.noteDb.delete(ownerId, noteId);
    await this.storageService.deleteFile(record.filePath);
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

function excerptFromMarkdown(markdown: string) {
  return stripMarkdown(markdown).slice(0, 180);
}
