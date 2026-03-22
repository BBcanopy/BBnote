import type Database from "better-sqlite3";
import type { AttachmentRecord } from "../service/models.js";

export class AttachmentDb {
  constructor(private readonly connection: Database.Database) {}

  insert(record: AttachmentRecord) {
    this.connection
      .prepare(`
        insert into attachments (
          id, owner_id, note_id, original_name, stored_path, mime_type, size_bytes, sha256, created_at
        )
        values (
          @id, @ownerId, @noteId, @originalName, @storedPath, @mimeType, @sizeBytes, @sha256, @createdAt
        )
      `)
      .run(record);
  }

  listByNoteId(noteId: string): AttachmentRecord[] {
    return this.connection
      .prepare<[string], AttachmentRecord>(
        `
          select
            id,
            owner_id as ownerId,
            note_id as noteId,
            original_name as originalName,
            stored_path as storedPath,
            mime_type as mimeType,
            size_bytes as sizeBytes,
            sha256,
            created_at as createdAt
          from attachments
          where note_id = ?
          order by created_at asc
        `
      )
      .all(noteId) as AttachmentRecord[];
  }

  listByOwner(ownerId: string): AttachmentRecord[] {
    return this.connection
      .prepare<[string], AttachmentRecord>(
        `
          select
            id,
            owner_id as ownerId,
            note_id as noteId,
            original_name as originalName,
            stored_path as storedPath,
            mime_type as mimeType,
            size_bytes as sizeBytes,
            sha256,
            created_at as createdAt
          from attachments
          where owner_id = ?
          order by created_at asc
        `
      )
      .all(ownerId) as AttachmentRecord[];
  }

  listAll(): AttachmentRecord[] {
    return this.connection
      .prepare<[], AttachmentRecord>(
        `
          select
            id,
            owner_id as ownerId,
            note_id as noteId,
            original_name as originalName,
            stored_path as storedPath,
            mime_type as mimeType,
            size_bytes as sizeBytes,
            sha256,
            created_at as createdAt
          from attachments
          order by created_at asc
        `
      )
      .all() as AttachmentRecord[];
  }

  getById(ownerId: string, attachmentId: string) {
    return this.connection
      .prepare<[string, string], AttachmentRecord>(
        `
          select
            id,
            owner_id as ownerId,
            note_id as noteId,
            original_name as originalName,
            stored_path as storedPath,
            mime_type as mimeType,
            size_bytes as sizeBytes,
            sha256,
            created_at as createdAt
          from attachments
          where owner_id = ? and id = ?
        `
      )
      .get(ownerId, attachmentId) as AttachmentRecord | undefined;
  }

  delete(ownerId: string, attachmentId: string) {
    this.connection.prepare("delete from attachments where owner_id = ? and id = ?").run(ownerId, attachmentId);
  }

  updateDerivedMetadata(ownerId: string, attachmentId: string, patch: { sizeBytes: number; sha256: string }) {
    this.connection
      .prepare(`
        update attachments
        set size_bytes = @sizeBytes, sha256 = @sha256
        where owner_id = @ownerId and id = @attachmentId
      `)
      .run({ ownerId, attachmentId, ...patch });
  }
}
