import type Database from "better-sqlite3";
import type { NoteRecord } from "../service/models.js";

interface ListQuery {
  ownerId: string;
  folderId?: string;
  limit: number;
  offset: number;
  sort: "updatedAt" | "createdAt" | "title";
  order: "asc" | "desc";
}

interface SearchQuery {
  ownerId: string;
  folderId?: string;
  query: string;
  limit: number;
  offset: number;
}

export class NoteDb {
  constructor(private readonly connection: Database.Database) {}

  insert(record: NoteRecord) {
    this.connection
      .prepare(`
        insert into notes (
          id, owner_id, folder_id, title, file_path, created_at, updated_at,
          last_opened_at, source_app, source_id, source_tags_json
        )
        values (
          @id, @ownerId, @folderId, @title, @filePath, @createdAt, @updatedAt,
          @lastOpenedAt, @sourceApp, @sourceId, @sourceTagsJson
        )
      `)
      .run(record);
  }

  getById(ownerId: string, id: string): NoteRecord | undefined {
    return this.connection
      .prepare<[string, string], NoteRecord>(
        `
          select
            id,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            file_path as filePath,
            created_at as createdAt,
            updated_at as updatedAt,
            last_opened_at as lastOpenedAt,
            source_app as sourceApp,
            source_id as sourceId,
            source_tags_json as sourceTagsJson
          from notes
          where owner_id = ? and id = ?
        `
      )
      .get(ownerId, id) as NoteRecord | undefined;
  }

  update(
    ownerId: string,
    id: string,
    input: { folderId: string; title: string; updatedAt: string; lastOpenedAt: string | null }
  ) {
    this.connection
      .prepare(`
        update notes
        set folder_id = @folderId, title = @title, updated_at = @updatedAt, last_opened_at = @lastOpenedAt
        where owner_id = @ownerId and id = @id
      `)
      .run({ ownerId, id, ...input });
  }

  delete(ownerId: string, id: string) {
    this.connection.prepare("delete from notes where owner_id = ? and id = ?").run(ownerId, id);
  }

  list(query: ListQuery): NoteRecord[] {
    const sortColumn =
      query.sort === "createdAt"
        ? "created_at"
        : query.sort === "title"
          ? "title collate nocase"
          : "updated_at";
    const folderClause = query.folderId ? "and folder_id = @folderId" : "";
    return this.connection
      .prepare<ListQuery, NoteRecord>(
        `
          select
            id,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            file_path as filePath,
            created_at as createdAt,
            updated_at as updatedAt,
            last_opened_at as lastOpenedAt,
            source_app as sourceApp,
            source_id as sourceId,
            source_tags_json as sourceTagsJson
          from notes
          where owner_id = @ownerId ${folderClause}
          order by ${sortColumn} ${query.order}, id ${query.order}
          limit @limit offset @offset
        `
      )
      .all(query) as NoteRecord[];
  }

  search(query: SearchQuery): NoteRecord[] {
    const folderClause = query.folderId ? "and notes.folder_id = @folderId" : "";
    return this.connection
      .prepare<SearchQuery, NoteRecord>(
        `
          select
            notes.id,
            notes.owner_id as ownerId,
            notes.folder_id as folderId,
            notes.title,
            notes.file_path as filePath,
            notes.created_at as createdAt,
            notes.updated_at as updatedAt,
            notes.last_opened_at as lastOpenedAt,
            notes.source_app as sourceApp,
            notes.source_id as sourceId,
            notes.source_tags_json as sourceTagsJson
          from notes
          inner join notes_fts on notes_fts.note_id = notes.id
          where notes.owner_id = @ownerId
            ${folderClause}
            and notes_fts.owner_id = @ownerId
            and notes_fts match @query
          order by bm25(notes_fts), notes.updated_at desc
          limit @limit offset @offset
        `
      )
      .all(query) as NoteRecord[];
  }

  replaceFts(record: { noteId: string; ownerId: string; folderId: string; title: string; body: string }) {
    const remove = this.connection.prepare("delete from notes_fts where note_id = ?");
    const insert = this.connection.prepare(`
      insert into notes_fts (note_id, owner_id, folder_id, title, body)
      values (@noteId, @ownerId, @folderId, @title, @body)
    `);
    const transaction = this.connection.transaction(() => {
      remove.run(record.noteId);
      insert.run(record);
    });
    transaction();
  }

  deleteFts(noteId: string) {
    this.connection.prepare("delete from notes_fts where note_id = ?").run(noteId);
  }
}
