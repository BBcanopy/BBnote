import path from "node:path";
import crypto from "node:crypto";
import { load } from "cheerio";
import JSZip from "jszip";
import { lookup as lookupMimeType } from "mime-types";
import TurndownService from "turndown";
import type { JobDb } from "../db/jobDb.js";
import type { FolderService } from "./folderService.js";
import type { AttachmentService } from "./attachmentService.js";
import type { NoteService } from "./noteService.js";
import type { ImportJobRecord } from "./models.js";

type ImportSource = "onenote" | "synology_note_station";

interface AttachmentCandidate {
  referencePath: string;
  fileName: string;
  isImage: boolean;
  content: Buffer;
}

export class ImportService {
  private readonly turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced"
  });

  constructor(
    private readonly jobDb: JobDb,
    private readonly folderService: FolderService,
    private readonly noteService: NoteService,
    private readonly attachmentService: AttachmentService
  ) {}

  async createImportJob(input: {
    ownerId: string;
    source: ImportSource;
    fileName: string;
    buffer: Buffer;
  }): Promise<ImportJobRecord> {
    const now = new Date().toISOString();
    const jobId = crypto.randomUUID();
    this.jobDb.insertImportJob({
      id: jobId,
      ownerId: input.ownerId,
      source: input.source,
      status: "running",
      summaryJson: JSON.stringify({ createdCount: 0, warningCount: 0, warnings: [] }),
      rootFolderId: null,
      createdAt: now,
      finishedAt: null
    });

    const warnings: string[] = [];
    try {
      const archive = await JSZip.loadAsync(input.buffer);
      const rootFolder = await this.folderService.createFolder(input.ownerId, {
        name: `Imported ${importLabel(input.source)} ${now.slice(0, 10)}`,
        parentId: null
      });

      const folderCache = new Map<string, string>([["", rootFolder.id], [".", rootFolder.id]]);
      let createdCount = 0;
      const entries = Object.values(archive.files).filter((entry) => !entry.dir);

      for (const entry of entries) {
        const extension = path.posix.extname(entry.name).toLowerCase();
        if (![".md", ".markdown", ".txt", ".html", ".htm"].includes(extension)) {
          continue;
        }

        const archiveDirectory = path.posix.dirname(entry.name);
        const folderId = await this.ensureArchiveFolder(folderCache, archiveDirectory, input.ownerId, rootFolder.id);
        const fileContent = await entry.async("string");
        const attachmentCandidates: AttachmentCandidate[] = [];
        const converted =
          extension === ".html" || extension === ".htm"
            ? await this.convertHtml(entry.name, fileContent, archive, attachmentCandidates)
            : fileContent;

        const createdAt = entry.date?.toISOString?.() ?? now;
        const note = await this.noteService.createNote({
          ownerId: input.ownerId,
          folderId,
          title: path.posix.basename(entry.name, extension),
          bodyMarkdown: converted,
          createdAt,
          updatedAt: createdAt,
          sourceApp: input.source,
          sourceId: entry.name,
          sourceTagsJson: JSON.stringify([])
        });

        let rewrittenBody = note.bodyMarkdown;
        for (const candidate of attachmentCandidates) {
          try {
            const attachment = await this.attachmentService.createAttachment({
              ownerId: input.ownerId,
              noteId: note.id,
              originalName: candidate.fileName,
              mimeType: lookupMimeType(candidate.fileName) || "application/octet-stream",
              content: candidate.content
            });
            const replacement = candidate.isImage
              ? `![${attachment.name}](${attachment.url})`
              : `[${attachment.name}](${attachment.url})`;
            rewrittenBody = rewrittenBody.replaceAll(`attachment://${candidate.referencePath}`, replacement);
          } catch (error) {
            warnings.push(`Skipped attachment ${candidate.fileName}: ${String(error)}`);
          }
        }

        if (rewrittenBody !== note.bodyMarkdown) {
          await this.noteService.updateNote({
            ownerId: input.ownerId,
            noteId: note.id,
            folderId,
            title: note.title,
            bodyMarkdown: rewrittenBody
          });
        }
        createdCount += 1;
      }

      this.jobDb.updateImportJob(input.ownerId, jobId, {
        status: "completed",
        summaryJson: JSON.stringify({
          createdCount,
          warningCount: warnings.length,
          warnings
        }),
        rootFolderId: rootFolder.id,
        finishedAt: new Date().toISOString()
      });
    } catch (error) {
      warnings.push(`Archive could not be imported: ${String(error)}`);
      this.jobDb.updateImportJob(input.ownerId, jobId, {
        status: "failed",
        summaryJson: JSON.stringify({
          createdCount: 0,
          warningCount: warnings.length,
          warnings
        }),
        rootFolderId: null,
        finishedAt: new Date().toISOString()
      });
    }

    return this.jobDb.getImportJob(input.ownerId, jobId)!;
  }

  getImportJob(ownerId: string, jobId: string) {
    const job = this.jobDb.getImportJob(ownerId, jobId);
    if (!job) {
      throw new Error("Import job not found.");
    }
    return {
      id: job.id,
      source: job.source,
      status: job.status,
      createdCount: JSON.parse(job.summaryJson).createdCount ?? 0,
      warningCount: JSON.parse(job.summaryJson).warningCount ?? 0,
      warnings: JSON.parse(job.summaryJson).warnings ?? []
    };
  }

  private async ensureArchiveFolder(
    folderCache: Map<string, string>,
    archiveDirectory: string,
    ownerId: string,
    rootFolderId: string
  ) {
    const normalized = archiveDirectory === "." ? "" : archiveDirectory;
    if (folderCache.has(normalized)) {
      return folderCache.get(normalized)!;
    }

    const parentDirectory = path.posix.dirname(normalized);
    const parentId =
      normalized.includes("/") || parentDirectory !== "."
        ? await this.ensureArchiveFolder(folderCache, parentDirectory, ownerId, rootFolderId)
        : rootFolderId;
    const folder = await this.folderService.createFolder(ownerId, {
      name: path.posix.basename(normalized),
      parentId
    });
    folderCache.set(normalized, folder.id);
    return folder.id;
  }

  private async convertHtml(
    entryName: string,
    html: string,
    archive: JSZip,
    attachmentCandidates: AttachmentCandidate[]
  ) {
    const $ = load(html);
    const currentDirectory = path.posix.dirname(entryName);

    $("img[src], a[href]").each((_index, element) => {
      const attribute = element.tagName === "img" ? "src" : "href";
      const originalReference = $(element).attr(attribute);
      if (!originalReference || /^([a-z]+:|#|\/\/)/i.test(originalReference)) {
        return;
      }
      const resolvedPath = path.posix.normalize(path.posix.join(currentDirectory, originalReference));
      const archivedFile = archive.file(resolvedPath);
      if (!archivedFile) {
        return;
      }
      attachmentCandidates.push({
        referencePath: resolvedPath,
        fileName: path.posix.basename(resolvedPath),
        isImage: element.tagName === "img",
        content: Buffer.from([])
      });
      $(element).attr(attribute, `attachment://${resolvedPath}`);
    });

    for (const candidate of attachmentCandidates) {
      const archivedFile = archive.file(candidate.referencePath);
      if (archivedFile) {
        candidate.content = await archivedFile.async("nodebuffer");
      }
    }

    return this.turndown.turndown($.html());
  }
}

function importLabel(source: ImportSource) {
  return source === "onenote" ? "OneNote" : "Synology";
}
