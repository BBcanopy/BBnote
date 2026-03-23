import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  const connections: Database.Database[] = [];

  afterEach(() => {
    while (connections.length) {
      connections.pop()!.close();
    }
  });

  it("adds note sort_order and backfills notebook priority from existing recency order", () => {
    const connection = new Database(":memory:");
    connections.push(connection);

    connection.exec(`
      pragma foreign_keys = ON;

      create table users (
        id text primary key,
        issuer text not null,
        subject text not null,
        email text,
        display_name text,
        created_at text not null,
        updated_at text not null,
        unique(issuer, subject)
      );

      create table folders (
        id text primary key,
        owner_id text not null,
        parent_id text references folders(id) on delete cascade,
        name text not null,
        storage_dir_name text not null,
        created_at text not null,
        updated_at text not null,
        foreign key(owner_id) references users(id) on delete cascade
      );

      create table notes (
        id text primary key,
        owner_id text not null,
        folder_id text not null,
        title text not null,
        file_path text not null,
        created_at text not null,
        updated_at text not null,
        last_opened_at text,
        source_app text,
        source_id text,
        source_tags_json text not null default '[]',
        foreign key(owner_id) references users(id) on delete cascade,
        foreign key(folder_id) references folders(id) on delete cascade
      );
    `);

    connection.prepare(
      `
        insert into users (id, issuer, subject, email, display_name, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `
    ).run("user-1", "issuer", "subject", "avery@example.com", "Avery", "2026-03-23T09:00:00.000Z", "2026-03-23T09:00:00.000Z");

    connection.prepare(
      `
        insert into folders (id, owner_id, parent_id, name, storage_dir_name, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `
    ).run("folder-1", "user-1", null, "Projects", "projects", "2026-03-23T09:00:00.000Z", "2026-03-23T09:00:00.000Z");

    const insertNote = connection.prepare(
      `
        insert into notes (
          id, owner_id, folder_id, title, file_path, created_at, updated_at,
          last_opened_at, source_app, source_id, source_tags_json
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );
    insertNote.run(
      "note-1",
      "user-1",
      "folder-1",
      "Oldest",
      "/tmp/oldest.md",
      "2026-03-23T09:00:00.000Z",
      "2026-03-23T09:00:00.000Z",
      null,
      null,
      null,
      "[]"
    );
    insertNote.run(
      "note-2",
      "user-1",
      "folder-1",
      "Newest",
      "/tmp/newest.md",
      "2026-03-23T10:00:00.000Z",
      "2026-03-23T12:00:00.000Z",
      null,
      null,
      null,
      "[]"
    );
    insertNote.run(
      "note-3",
      "user-1",
      "folder-1",
      "Middle",
      "/tmp/middle.md",
      "2026-03-23T11:00:00.000Z",
      "2026-03-23T11:00:00.000Z",
      null,
      null,
      null,
      "[]"
    );

    runMigrations(connection);

    const columns = connection
      .prepare<[], { name: string }>("pragma table_info(notes)")
      .all()
      .map((column) => column.name);
    expect(columns).toContain("sort_order");

    const rows = connection
      .prepare<[], { title: string; sortOrder: number }>(
        `
          select title, sort_order as sortOrder
          from notes
          where folder_id = 'folder-1'
          order by sort_order asc
        `
      )
      .all();

    expect(rows).toEqual([
      { title: "Newest", sortOrder: 0 },
      { title: "Middle", sortOrder: 1 },
      { title: "Oldest", sortOrder: 2 }
    ]);
  });
});
