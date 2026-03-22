import { randomUUID } from "node:crypto";
import type { FolderDb } from "../db/folderDb.js";
import type { FolderNode, FolderRecord } from "./models.js";
import { buildFolderDirectoryName } from "./slugService.js";

export class FolderService {
  constructor(private readonly folderDb: FolderDb) {}

  async ensureInbox(ownerId: string) {
    const existing = this.folderDb.findInbox(ownerId);
    if (existing) {
      return existing;
    }
    return this.createFolder(ownerId, { name: "Inbox", parentId: null });
  }

  async list(ownerId: string): Promise<FolderNode[]> {
    const folders = this.folderDb.listByOwner(ownerId);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: buildPath(folder.id, byId),
      childCount: folder.child_count,
      noteCount: folder.note_count
    }));
  }

  async createFolder(ownerId: string, input: { name: string; parentId: string | null }) {
    if (input.parentId) {
      const parent = this.folderDb.getById(ownerId, input.parentId);
      if (!parent) {
        throw new Error("Parent folder was not found.");
      }
    }

    const now = new Date().toISOString();
    const folderId = randomUUID();
    const record: FolderRecord = {
      id: folderId,
      ownerId,
      parentId: input.parentId,
      name: input.name.trim() || "Untitled folder",
      storageDirName: buildFolderDirectoryName(input.name, folderId),
      createdAt: now,
      updatedAt: now
    };
    this.folderDb.insert(record);
    return record;
  }

  async updateFolder(ownerId: string, folderId: string, input: { name: string; parentId: string | null }) {
    const existing = this.folderDb.getById(ownerId, folderId);
    if (!existing) {
      throw new Error("Folder not found.");
    }
    if (input.parentId === folderId) {
      throw new Error("A folder cannot be its own parent.");
    }
    if (input.parentId) {
      const parent = this.folderDb.getById(ownerId, input.parentId);
      if (!parent) {
        throw new Error("Parent folder was not found.");
      }
    }
    this.folderDb.update(ownerId, folderId, {
      name: input.name.trim() || existing.name,
      parentId: input.parentId,
      updatedAt: new Date().toISOString()
    });
    return this.folderDb.getById(ownerId, folderId)!;
  }

  async deleteFolder(ownerId: string, folderId: string) {
    const existing = this.folderDb.getById(ownerId, folderId);
    if (!existing) {
      throw new Error("Folder not found.");
    }
    if (this.folderDb.hasChildren(ownerId, folderId) || this.folderDb.hasNotes(ownerId, folderId)) {
      throw new Error("Folder must be empty before deletion.");
    }
    this.folderDb.delete(ownerId, folderId);
  }

  getFolder(ownerId: string, folderId: string) {
    return this.folderDb.getById(ownerId, folderId);
  }
}

function buildPath(folderId: string, folders: Map<string, { id: string; name: string; parentId: string | null }>) {
  const parts: string[] = [];
  let current = folders.get(folderId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  return parts.join(" / ");
}

