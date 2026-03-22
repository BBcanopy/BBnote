import type Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export class SessionDb {
  constructor(private readonly connection: Database.Database) {}

  insert(row: SessionRow) {
    this.connection
      .prepare(
        `
        insert into sessions (id, owner_id, created_at, updated_at, expires_at)
        values (@id, @owner_id, @created_at, @updated_at, @expires_at)
      `
      )
      .run(row);
  }

  getById(id: string): SessionRow | undefined {
    return this.connection.prepare<[string], SessionRow>("select * from sessions where id = ?").get(id) as
      | SessionRow
      | undefined;
  }

  deleteById(id: string) {
    this.connection.prepare("delete from sessions where id = ?").run(id);
  }

  deleteExpired(nowIso: string) {
    this.connection.prepare("delete from sessions where expires_at <= ?").run(nowIso);
  }
}
