import type Database from "better-sqlite3";
import type { NoteRecord } from "../service/models.js";

interface ListQuery {
  ownerId: string;
  folderId?: string;
  limit: number;
  offset: number;
  sort: "updatedAt" | "createdAt" | "title" | "priority";
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
          id, owner_id, folder_id, title, file_path, sort_order, created_at, updated_at,
          last_opened_at, source_app, source_id, source_tags_json
        )
        values (
          @id, @ownerId, @folderId, @title, @filePath, @sortOrder, @createdAt, @updatedAt,
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
            sort_order as sortOrder,
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
    input: { folderId: string; title: string; filePath: string; sortOrder: number | null; updatedAt: string; lastOpenedAt: string | null }
  ) {
    this.connection
      .prepare(`
        update notes
        set
          folder_id = @folderId,
          title = @title,
          file_path = @filePath,
          sort_order = coalesce(@sortOrder, sort_order),
          updated_at = @updatedAt,
          last_opened_at = @lastOpenedAt
        where owner_id = @ownerId and id = @id
      `)
      .run({ ownerId, id, ...input });
  }

  delete(ownerId: string, id: string) {
    this.connection.prepare("delete from notes where owner_id = ? and id = ?").run(ownerId, id);
  }

  listAllByOwner(ownerId: string): NoteRecord[] {
    return this.connection
      .prepare<[string], NoteRecord>(
        `
          select
            id,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            file_path as filePath,
            sort_order as sortOrder,
            created_at as createdAt,
            updated_at as updatedAt,
            last_opened_at as lastOpenedAt,
            source_app as sourceApp,
            source_id as sourceId,
            source_tags_json as sourceTagsJson
          from notes
          where owner_id = ?
          order by created_at asc
        `
      )
      .all(ownerId) as NoteRecord[];
  }

  listAll(): NoteRecord[] {
    return this.connection
      .prepare<[], NoteRecord>(
        `
          select
            id,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            file_path as filePath,
            sort_order as sortOrder,
            created_at as createdAt,
            updated_at as updatedAt,
            last_opened_at as lastOpenedAt,
            source_app as sourceApp,
            source_id as sourceId,
            source_tags_json as sourceTagsJson
          from notes
          order by created_at asc
        `
      )
      .all() as NoteRecord[];
  }

  list(query: ListQuery): NoteRecord[] {
    const sortColumn =
      query.sort === "createdAt"
        ? "created_at"
        : query.sort === "priority"
          ? "sort_order"
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
            sort_order as sortOrder,
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
    const ftsQuery = buildFtsQuery(query.query);
    if (!ftsQuery) {
      return [];
    }
    return this.connection
      .prepare<SearchQuery, NoteRecord>(
        `
          select
            notes.id,
            notes.owner_id as ownerId,
            notes.folder_id as folderId,
            notes.title,
            notes.file_path as filePath,
            notes.sort_order as sortOrder,
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
      .all({
        ...query,
        query: ftsQuery
      }) as NoteRecord[];
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

  getFtsRows(ownerId: string) {
    return this.connection
      .prepare<[string], { noteId: string; ownerId: string; folderId: string; title: string; body: string }>(
        `
          select
            note_id as noteId,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            body
          from notes_fts
          where owner_id = ?
        `
      )
      .all(ownerId) as { noteId: string; ownerId: string; folderId: string; title: string; body: string }[];
  }

  listByFolder(ownerId: string, folderId: string): NoteRecord[] {
    return this.connection
      .prepare<[string, string], NoteRecord>(
        `
          select
            id,
            owner_id as ownerId,
            folder_id as folderId,
            title,
            file_path as filePath,
            sort_order as sortOrder,
            created_at as createdAt,
            updated_at as updatedAt,
            last_opened_at as lastOpenedAt,
            source_app as sourceApp,
            source_id as sourceId,
            source_tags_json as sourceTagsJson
          from notes
          where owner_id = ? and folder_id = ?
          order by sort_order asc, created_at asc, id asc
        `
      )
      .all(ownerId, folderId) as NoteRecord[];
  }

  getNextSortOrder(ownerId: string, folderId: string) {
    const row = this.connection
      .prepare<[string, string], { maxSortOrder: number | null }>(
        `
          select max(sort_order) as maxSortOrder
          from notes
          where owner_id = ? and folder_id = ?
        `
      )
      .get(ownerId, folderId);
    return (row?.maxSortOrder ?? -1) + 1;
  }

  reorder(ownerId: string, folderId: string, orderedNoteIds: string[]) {
    const updateSortOrder = this.connection.prepare(
      `
        update notes
        set sort_order = ?
        where owner_id = ? and folder_id = ? and id = ?
      `
    );

    const transaction = this.connection.transaction((noteIds: string[]) => {
      noteIds.forEach((noteId, index) => {
        updateSortOrder.run(index, ownerId, folderId, noteId);
      });
    });

    transaction(orderedNoteIds);
  }
}

function buildFtsQuery(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, "\"\"")}"`)
    .join(" AND ");
}
