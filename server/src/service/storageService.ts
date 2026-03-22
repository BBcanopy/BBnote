import fs from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./configService.js";
import { buildNoteFileName } from "./slugService.js";

export class StorageService {
  constructor(private readonly config: AppConfig) {}

  async ensureRoots() {
    await Promise.all([
      fs.mkdir(this.config.notesRoot, { recursive: true }),
      fs.mkdir(this.config.attachmentsRoot, { recursive: true })
    ]);
  }

  noteFolderPath(ownerId: string, storageDirName: string) {
    return path.join(this.config.notesRoot, ownerId, storageDirName);
  }

  attachmentRootPath(ownerId: string) {
    return path.join(this.config.attachmentsRoot, ownerId);
  }

  async createNoteFile(input: {
    ownerId: string;
    storageDirName: string;
    noteId: string;
    title: string;
    createdAt: string;
    bodyMarkdown: string;
  }) {
    const date = input.createdAt.slice(0, 10);
    const directory = this.noteFolderPath(input.ownerId, input.storageDirName);
    await fs.mkdir(directory, { recursive: true });
    const filename = buildNoteFileName(date, input.title, input.noteId);
    const filePath = path.join(directory, filename);
    await fs.writeFile(filePath, input.bodyMarkdown, "utf8");
    return filePath;
  }

  async readMarkdown(filePath: string) {
    return fs.readFile(filePath, "utf8");
  }

  async writeMarkdown(filePath: string, bodyMarkdown: string) {
    await fs.writeFile(filePath, bodyMarkdown, "utf8");
  }

  async deleteFile(filePath: string) {
    await fs.rm(filePath, { force: true });
  }

  async listNoteFiles(ownerId?: string) {
    const root = ownerId ? path.join(this.config.notesRoot, ownerId) : this.config.notesRoot;
    return listFilesRecursive(root);
  }

  async listAttachmentFiles(ownerId?: string) {
    const root = ownerId ? path.join(this.config.attachmentsRoot, ownerId) : this.config.attachmentsRoot;
    return listFilesRecursive(root);
  }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
          return listFilesRecursive(entryPath);
        }
        return [entryPath];
      })
    );
    return files.flat();
  } catch {
    return [];
  }
}

