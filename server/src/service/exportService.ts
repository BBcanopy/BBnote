import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import YAML from "yaml";
import type { AttachmentDb } from "../db/attachmentDb.js";
import type { FolderDb } from "../db/folderDb.js";
import type { JobDb } from "../db/jobDb.js";
import type { NoteDb } from "../db/noteDb.js";
import type { AppConfig } from "./configService.js";
import type { ExportJobRecord } from "./models.js";
import { sanitizeSegment } from "./slugService.js";
import type { StorageService } from "./storageService.js";

export class ExportService {
  constructor(
    private readonly config: AppConfig,
    private readonly jobDb: JobDb,
    private readonly folderDb: FolderDb,
    private readonly noteDb: NoteDb,
    private readonly attachmentDb: AttachmentDb,
    private readonly storageService: StorageService
  ) {}

  async createExportJob(ownerId: string): Promise<ExportJobRecord> {
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    this.jobDb.insertExportJob({
      id: jobId,
      ownerId,
      status: "running",
      archivePath: null,
      summaryJson: JSON.stringify({ noteCount: 0, folderCount: 0, attachmentCount: 0 }),
      createdAt: now,
      finishedAt: null
    });

    const folders = this.folderDb.listByOwner(ownerId);
    const notes = this.noteDb.listAllByOwner(ownerId);
    const attachments = this.attachmentDb.listByOwner(ownerId);
    const zip = new JSZip();
    const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
    const attachmentsByNote = new Map<string, typeof attachments>();

    for (const attachment of attachments) {
      const list = attachmentsByNote.get(attachment.noteId) ?? [];
      list.push(attachment);
      attachmentsByNote.set(attachment.noteId, list);
    }

    for (const note of notes) {
      const folderPath = buildExportFolderPath(note.folderId, folderMap);
      const noteBaseName = path.basename(note.filePath);
      const assetDirectoryName = `${path.basename(noteBaseName, ".md")}.assets`;
      const noteZipPath = folderPath ? `${folderPath}/${noteBaseName}` : noteBaseName;
      const noteFolder = path.posix.dirname(noteZipPath) === "." ? "" : path.posix.dirname(noteZipPath);
      const body = await this.storageService.readMarkdown(note.filePath);
      const noteAttachments = attachmentsByNote.get(note.id) ?? [];
      let rewrittenBody = body;

      for (const attachment of noteAttachments) {
        const exportedAssetPath = noteFolder
          ? `${noteFolder}/${assetDirectoryName}/${attachment.originalName}`
          : `${assetDirectoryName}/${attachment.originalName}`;
        const relativeAssetPath = `./${assetDirectoryName}/${attachment.originalName}`;
        const buffer = await fs.readFile(attachment.storedPath);
        zip.file(exportedAssetPath, buffer);
        rewrittenBody = rewrittenBody
          .replaceAll(`/api/v1/attachments/${attachment.id}`, relativeAssetPath)
          .replaceAll(`${this.config.appBaseUrl}/api/v1/attachments/${attachment.id}`, relativeAssetPath);
      }

      const frontMatter = YAML.stringify({
        id: note.id,
        title: note.title,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        folderId: note.folderId,
        sourceApp: note.sourceApp,
        sourceId: note.sourceId,
        sourceTags: JSON.parse(note.sourceTagsJson),
        attachments: noteAttachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes
        }))
      });

      zip.file(noteZipPath, `---\n${frontMatter}---\n\n${rewrittenBody}`);
    }

    const archiveBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const archivePath = await this.storageService.writeExport(ownerId, jobId, archiveBuffer);
    this.jobDb.updateExportJob(ownerId, jobId, {
      status: "completed",
      archivePath,
      summaryJson: JSON.stringify({
        noteCount: notes.length,
        folderCount: folders.length,
        attachmentCount: attachments.length
      }),
      finishedAt: new Date().toISOString()
    });
    return this.jobDb.getExportJob(ownerId, jobId)!;
  }

  getExportJob(ownerId: string, jobId: string) {
    const job = this.jobDb.getExportJob(ownerId, jobId);
    if (!job) {
      throw new Error("Export job not found.");
    }
    return {
      id: job.id,
      status: job.status,
      downloadUrl: job.archivePath ? `/api/v1/exports/${job.id}/download` : null,
      expiresAt: null,
      summary: JSON.parse(job.summaryJson)
    };
  }

  async getExportDownload(ownerId: string, jobId: string) {
    const job = this.jobDb.getExportJob(ownerId, jobId);
    if (!job?.archivePath) {
      throw new Error("Export archive not found.");
    }
    return {
      fileName: `${jobId}.zip`,
      filePath: job.archivePath
    };
  }
}

function buildExportFolderPath(
  folderId: string,
  folders: Map<string, { id: string; name: string; parentId: string | null }>
) {
  const parts: string[] = [];
  let current = folders.get(folderId);
  while (current) {
    parts.unshift(sanitizeSegment(current.name));
    current = current.parentId ? folders.get(current.parentId) : undefined;
  }
  return parts.join("/");
}
