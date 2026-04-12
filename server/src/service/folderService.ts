import { randomUUID } from "node:crypto";
import type { FolderDb } from "../db/folderDb.js";
import type { FolderIconId, FolderNode, FolderRecord } from "./models.js";
import {
  DELETED_NOTES_FOLDER_NAME,
  DELETED_NOTES_STORAGE_DIR_NAME,
  isDeletedNotesFolderName,
  isDeletedNotesFolderRecord
} from "./deletedNotesFolder.js";
import { buildFolderDirectoryName } from "./slugService.js";

export class FolderService {
  constructor(private readonly folderDb: FolderDb) {}

  async list(ownerId: string): Promise<FolderNode[]> {
    const folders = this.folderDb.listByOwner(ownerId);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const deletedNotesFolder = folders.find((folder) => isDeletedNotesFolderRecord(folder)) ?? null;
    const orderedFolders = flattenFoldersByTree(folders.filter((folder) => !isDeletedNotesFolderRecord(folder)));
    const nodes = orderedFolders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      path: buildPath(folder.id, byId),
      icon: folder.icon,
      childCount: folder.child_count,
      noteCount: folder.note_count
    }));

    if (!deletedNotesFolder) {
      return nodes;
    }

    return [
      ...nodes,
      {
        id: deletedNotesFolder.id,
        name: deletedNotesFolder.name,
        parentId: deletedNotesFolder.parentId,
        path: buildPath(deletedNotesFolder.id, byId),
        icon: deletedNotesFolder.icon,
        childCount: deletedNotesFolder.child_count,
        noteCount: deletedNotesFolder.note_count
      }
    ];
  }

  async createFolder(ownerId: string, input: { name: string; parentId: string | null; icon?: FolderIconId }) {
    const trimmedName = input.name.trim() || "Untitled folder";
    if (isDeletedNotesFolderName(trimmedName)) {
      throw new Error(`${DELETED_NOTES_FOLDER_NAME} is reserved for the system notebook.`);
    }
    if (input.parentId) {
      const parent = this.folderDb.getById(ownerId, input.parentId);
      if (!parent) {
        throw new Error("Parent folder was not found.");
      }
      if (isDeletedNotesFolderRecord(parent)) {
        throw new Error(`${DELETED_NOTES_FOLDER_NAME} cannot contain notebooks.`);
      }
    }

    const now = new Date().toISOString();
    const folderId = randomUUID();
    const record: FolderRecord = {
      id: folderId,
      ownerId,
      parentId: input.parentId,
      name: trimmedName,
      icon: input.icon ?? "folder",
      storageDirName: buildFolderDirectoryName(trimmedName, folderId),
      sortOrder: this.folderDb.getNextSortOrder(ownerId, input.parentId),
      createdAt: now,
      updatedAt: now
    };
    this.folderDb.insert(record);
    return record;
  }

  async updateFolder(ownerId: string, folderId: string, input: { name: string; icon?: FolderIconId; parentId: string | null; sortOrder?: number }) {
    const existing = this.folderDb.getById(ownerId, folderId);
    if (!existing) {
      throw new Error("Folder not found.");
    }
    if (isDeletedNotesFolderRecord(existing)) {
      throw new Error(`${DELETED_NOTES_FOLDER_NAME} is a protected system notebook.`);
    }
    const trimmedName = input.name.trim() || existing.name;
    if (isDeletedNotesFolderName(trimmedName)) {
      throw new Error(`${DELETED_NOTES_FOLDER_NAME} is reserved for the system notebook.`);
    }
    if (input.parentId === folderId) {
      throw new Error("A folder cannot be its own parent.");
    }
    if (input.parentId) {
      const parent = this.folderDb.getById(ownerId, input.parentId);
      if (!parent) {
        throw new Error("Parent folder was not found.");
      }
      if (isDeletedNotesFolderRecord(parent)) {
        throw new Error(`${DELETED_NOTES_FOLDER_NAME} cannot contain notebooks.`);
      }
    }

    assertNoDescendantParent(ownerId, folderId, input.parentId, this.folderDb);

    this.folderDb.update(ownerId, folderId, {
      name: trimmedName,
      icon: input.icon ?? null,
      parentId: input.parentId,
      sortOrder:
        typeof input.sortOrder === "number"
          ? Math.max(0, input.sortOrder)
          : input.parentId !== existing.parentId
            ? this.folderDb.getNextSortOrder(ownerId, input.parentId)
            : existing.sortOrder,
      updatedAt: new Date().toISOString()
    });
    return this.folderDb.getById(ownerId, folderId)!;
  }

  async deleteFolder(ownerId: string, folderId: string) {
    const existing = this.folderDb.getById(ownerId, folderId);
    if (!existing) {
      throw new Error("Folder not found.");
    }
    if (isDeletedNotesFolderRecord(existing)) {
      throw new Error(`${DELETED_NOTES_FOLDER_NAME} is a protected system notebook.`);
    }
    if (this.folderDb.hasChildren(ownerId, folderId) || this.folderDb.hasNotes(ownerId, folderId)) {
      throw new Error("Folder must be empty before deletion.");
    }
    this.folderDb.delete(ownerId, folderId);
  }

  getFolder(ownerId: string, folderId: string) {
    return this.folderDb.getById(ownerId, folderId);
  }

  getDeletedNotesFolder(ownerId: string) {
    return this.folderDb.getByStorageDirName(ownerId, DELETED_NOTES_STORAGE_DIR_NAME);
  }

  async ensureDeletedNotesFolder(ownerId: string) {
    const existing = this.getDeletedNotesFolder(ownerId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const folderId = randomUUID();
    const record: FolderRecord = {
      id: folderId,
      ownerId,
      parentId: null,
      name: DELETED_NOTES_FOLDER_NAME,
      icon: "archive",
      storageDirName: DELETED_NOTES_STORAGE_DIR_NAME,
      sortOrder: this.folderDb.getNextSortOrder(ownerId, null),
      createdAt: now,
      updatedAt: now
    };
    this.folderDb.insert(record);
    return record;
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

function flattenFoldersByTree<T extends { id: string; parentId: string | null; sortOrder: number; createdAt: string }>(folders: T[]) {
  const byParent = new Map<string | null, T[]>();

  for (const folder of folders) {
    const siblings = byParent.get(folder.parentId) ?? [];
    siblings.push(folder);
    byParent.set(folder.parentId, siblings);
  }

  const ordered: T[] = [];

  const visit = (parentId: string | null) => {
    const children = [...(byParent.get(parentId) ?? [])].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });

    for (const child of children) {
      ordered.push(child);
      visit(child.id);
    }
  };

  visit(null);

  return ordered;
}

function assertNoDescendantParent(
  ownerId: string,
  folderId: string,
  parentId: string | null,
  folderDb: Pick<FolderDb, "getById">
) {
  let currentParentId = parentId;

  while (currentParentId) {
    if (currentParentId === folderId) {
      throw new Error("A folder cannot be moved into one of its descendants.");
    }

    const current = folderDb.getById(ownerId, currentParentId);
    currentParentId = current?.parentId ?? null;
  }
}
