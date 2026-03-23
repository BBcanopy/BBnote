import type Database from "better-sqlite3";
import type { FolderRecord } from "../service/models.js";

interface FolderStatsRow extends FolderRecord {
  child_count: number;
  note_count: number;
}

export class FolderDb {
  constructor(private readonly connection: Database.Database) {}

  insert(record: FolderRecord) {
    this.connection
      .prepare(`
        insert into folders (id, owner_id, parent_id, name, storage_dir_name, created_at, updated_at)
        values (@id, @ownerId, @parentId, @name, @storageDirName, @createdAt, @updatedAt)
      `)
      .run(record);
  }

  listByOwner(ownerId: string): FolderStatsRow[] {
    return this.connection
      .prepare<[string], FolderStatsRow>(
        `
          select
            folders.id,
            folders.owner_id as ownerId,
            folders.parent_id as parentId,
            folders.name,
            folders.storage_dir_name as storageDirName,
            folders.created_at as createdAt,
            folders.updated_at as updatedAt,
            (
              select count(*)
              from folders children
              where children.parent_id = folders.id
            ) as child_count,
            (
              select count(*)
              from notes
              where notes.folder_id = folders.id
            ) as note_count
          from folders
          where folders.owner_id = ?
          order by folders.created_at asc
        `
      )
      .all(ownerId) as FolderStatsRow[];
  }

  getById(ownerId: string, id: string): FolderRecord | undefined {
    return this.connection
      .prepare<[string, string], FolderRecord>(
        `
          select
            id,
            owner_id as ownerId,
            parent_id as parentId,
            name,
            storage_dir_name as storageDirName,
            created_at as createdAt,
            updated_at as updatedAt
          from folders
          where owner_id = ? and id = ?
        `
      )
      .get(ownerId, id) as FolderRecord | undefined;
  }

  update(ownerId: string, id: string, input: { name: string; parentId: string | null; updatedAt: string }) {
    this.connection
      .prepare(`
        update folders
        set name = @name, parent_id = @parentId, updated_at = @updatedAt
        where owner_id = @ownerId and id = @id
      `)
      .run({ ownerId, id, ...input });
  }

  delete(ownerId: string, id: string) {
    this.connection.prepare("delete from folders where owner_id = ? and id = ?").run(ownerId, id);
  }

  hasChildren(ownerId: string, id: string): boolean {
    const row = this.connection
      .prepare<[string, string], { count: number }>(
        "select count(*) as count from folders where owner_id = ? and parent_id = ?"
      )
      .get(ownerId, id) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  }

  hasNotes(ownerId: string, id: string): boolean {
    const row = this.connection
      .prepare<[string, string], { count: number }>(
        "select count(*) as count from notes where owner_id = ? and folder_id = ?"
      )
      .get(ownerId, id) as { count: number } | undefined;
    return (row?.count ?? 0) > 0;
  }

}
