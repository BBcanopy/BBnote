import type Database from "better-sqlite3";

export interface UserRow {
  id: string;
  issuer: string;
  subject: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export class UserDb {
  constructor(private readonly connection: Database.Database) {}

  upsert(row: UserRow) {
    this.connection
      .prepare(`
        insert into users (id, issuer, subject, email, display_name, created_at, updated_at)
        values (@id, @issuer, @subject, @email, @display_name, @created_at, @updated_at)
        on conflict(issuer, subject) do update set
          email = excluded.email,
          display_name = excluded.display_name,
          updated_at = excluded.updated_at
      `)
      .run(row);
  }

  getById(id: string): UserRow | undefined {
    return this.connection
      .prepare<[string], UserRow>("select * from users where id = ?")
      .get(id) as UserRow | undefined;
  }
}
