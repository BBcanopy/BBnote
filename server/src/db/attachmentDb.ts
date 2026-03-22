import type Database from "better-sqlite3";
import type { AttachmentRecord } from "../service/models.js";

export class AttachmentDb {
  constructor(private readonly connection: Database.Database) {}

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
}
