import type Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  expires_at: string;
}

export class SessionDb {
  constructor(private readonly connection: Database.Database) {}

  upsert(row: SessionRow) {
    this.connection
      .prepare(
        `
        insert into sessions (id, owner_id, created_at, updated_at, refresh_token, access_token_expires_at, expires_at)
        values (@id, @owner_id, @created_at, @updated_at, @refresh_token, @access_token_expires_at, @expires_at)
        on conflict(id) do update set
          owner_id = excluded.owner_id,
          updated_at = excluded.updated_at,
          refresh_token = excluded.refresh_token,
          access_token_expires_at = excluded.access_token_expires_at,
          expires_at = excluded.expires_at
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
