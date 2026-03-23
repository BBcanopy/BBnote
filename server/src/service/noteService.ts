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
  sort?: "updatedAt" | "createdAt" | "title" | "priority";
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
          sortOrder: record.sortOrder,
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
      filePath: record.filePath,
      sortOrder: null,
      updatedAt: record.updatedAt,
      lastOpenedAt: new Date().toISOString()
    });
    return {
      id: record.id,
      folderId: record.folderId,
      title: record.title,
      bodyMarkdown,
      sortOrder: record.sortOrder,
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
    folderId: string;
    title: string;
    bodyMarkdown: string;
    createdAt?: string;
    updatedAt?: string;
    sourceApp?: string | null;
    sourceId?: string | null;
    sourceTagsJson?: string;
  }) {
    const folder = this.folderDb.getById(input.ownerId, input.folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      throw new Error("Note title is required.");
    }
    const noteId = randomUUID();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const updatedAt = input.updatedAt ?? createdAt;
    const sortOrder = this.noteDb.getNextSortOrder(input.ownerId, folder.id);
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
        sortOrder,
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
    folderId: string;
    title: string;
    bodyMarkdown: string;
  }) {
    const record = this.noteDb.getById(input.ownerId, input.noteId);
    if (!record) {
      throw new Error("Note not found.");
    }
    const folder = this.folderDb.getById(input.ownerId, input.folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      throw new Error("Note title is required.");
    }

    const previousBody = await this.storageService.readMarkdown(record.filePath);
    const folderChanged = record.folderId !== folder.id;
    const nextFilePath = this.storageService.noteFilePath({
      ownerId: input.ownerId,
      storageDirName: folder.storageDirName,
      noteId: input.noteId,
      title: trimmedTitle,
      createdAt: record.createdAt
    });

    try {
      if (nextFilePath === record.filePath) {
        await this.storageService.writeMarkdown(record.filePath, input.bodyMarkdown);
      } else {
        await this.storageService.writeMarkdown(nextFilePath, input.bodyMarkdown);
      }

      const updatedAt = new Date().toISOString();
      const sortOrder = folderChanged ? this.noteDb.getNextSortOrder(input.ownerId, folder.id) : null;
      this.noteDb.update(input.ownerId, input.noteId, {
        folderId: folder.id,
        title: trimmedTitle,
        filePath: nextFilePath,
        sortOrder,
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
      if (nextFilePath !== record.filePath) {
        await this.storageService.deleteFile(record.filePath);
      }
    } catch (error) {
      if (nextFilePath === record.filePath) {
        await this.storageService.writeMarkdown(record.filePath, previousBody);
      } else {
        await this.storageService.deleteFile(nextFilePath);
      }
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

  async reorderNotes(input: { ownerId: string; folderId: string; orderedNoteIds: string[] }) {
    const folder = this.folderDb.getById(input.ownerId, input.folderId);
    if (!folder) {
      throw new Error("Folder not found.");
    }

    const notes = this.noteDb.listByFolder(input.ownerId, input.folderId);
    const existingIds = notes.map((note) => note.id);
    const requestedIds = input.orderedNoteIds;

    if (!requestedIds.length && existingIds.length) {
      throw new Error("Ordered note list cannot be empty.");
    }

    if (requestedIds.length !== existingIds.length) {
      throw new Error("Ordered note list must include every note in the notebook exactly once.");
    }

    const requestedIdSet = new Set(requestedIds);
    if (requestedIdSet.size !== requestedIds.length) {
      throw new Error("Ordered note list cannot contain duplicates.");
    }

    for (const noteId of existingIds) {
      if (!requestedIdSet.has(noteId)) {
        throw new Error("Ordered note list must include every note in the notebook exactly once.");
      }
    }

    this.noteDb.reorder(input.ownerId, input.folderId, requestedIds);
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
