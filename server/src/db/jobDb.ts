import type Database from "better-sqlite3";
import type { ExportJobRecord, ImportJobRecord } from "../service/models.js";

export class JobDb {
  constructor(private readonly connection: Database.Database) {}

  insertImportJob(record: ImportJobRecord) {
    this.connection
      .prepare(`
        insert into import_jobs (id, owner_id, source, status, summary_json, root_folder_id, created_at, finished_at)
        values (@id, @ownerId, @source, @status, @summaryJson, @rootFolderId, @createdAt, @finishedAt)
      `)
      .run(record);
  }

  updateImportJob(
    ownerId: string,
    jobId: string,
    patch: { status: string; summaryJson: string; rootFolderId: string | null; finishedAt: string | null }
  ) {
    this.connection
      .prepare(`
        update import_jobs
        set status = @status, summary_json = @summaryJson, root_folder_id = @rootFolderId, finished_at = @finishedAt
        where owner_id = @ownerId and id = @jobId
      `)
      .run({ ownerId, jobId, ...patch });
  }

  getImportJob(ownerId: string, jobId: string) {
    return this.connection
      .prepare<[string, string], ImportJobRecord>(
        `
          select
            id,
            owner_id as ownerId,
            source,
            status,
            summary_json as summaryJson,
            root_folder_id as rootFolderId,
            created_at as createdAt,
            finished_at as finishedAt
          from import_jobs
          where owner_id = ? and id = ?
        `
      )
      .get(ownerId, jobId) as ImportJobRecord | undefined;
  }

  insertExportJob(record: ExportJobRecord) {
    this.connection
      .prepare(`
        insert into export_jobs (id, owner_id, status, archive_path, summary_json, created_at, finished_at)
        values (@id, @ownerId, @status, @archivePath, @summaryJson, @createdAt, @finishedAt)
      `)
      .run(record);
  }

  updateExportJob(
    ownerId: string,
    jobId: string,
    patch: { status: string; summaryJson: string; archivePath: string | null; finishedAt: string | null }
  ) {
    this.connection
      .prepare(`
        update export_jobs
        set status = @status, summary_json = @summaryJson, archive_path = @archivePath, finished_at = @finishedAt
        where owner_id = @ownerId and id = @jobId
      `)
      .run({ ownerId, jobId, ...patch });
  }

  getExportJob(ownerId: string, jobId: string) {
    return this.connection
      .prepare<[string, string], ExportJobRecord>(
        `
          select
            id,
            owner_id as ownerId,
            status,
            archive_path as archivePath,
            summary_json as summaryJson,
            created_at as createdAt,
            finished_at as finishedAt
          from export_jobs
          where owner_id = ? and id = ?
        `
      )
      .get(ownerId, jobId) as ExportJobRecord | undefined;
  }
}

