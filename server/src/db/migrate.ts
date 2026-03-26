import type Database from "better-sqlite3";

export function runMigrations(connection: Database.Database) {
  connection.exec(`
    create table if not exists users (
      id text primary key,
      issuer text not null,
      subject text not null,
      email text,
      display_name text,
      theme text not null default 'sea',
      created_at text not null,
      updated_at text not null,
      unique(issuer, subject)
    );

    create table if not exists folders (
      id text primary key,
      owner_id text not null,
      parent_id text references folders(id) on delete cascade,
      name text not null,
      icon text not null default 'folder',
      storage_dir_name text not null,
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null,
      foreign key(owner_id) references users(id) on delete cascade
    );

    create index if not exists idx_folders_owner_parent on folders(owner_id, parent_id);

    create table if not exists notes (
      id text primary key,
      owner_id text not null,
      folder_id text not null,
      title text not null,
      file_path text not null,
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null,
      last_opened_at text,
      source_app text,
      source_id text,
      source_tags_json text not null default '[]',
      foreign key(owner_id) references users(id) on delete cascade,
      foreign key(folder_id) references folders(id) on delete cascade
    );

    create index if not exists idx_notes_owner_folder_updated on notes(owner_id, folder_id, updated_at desc);

    create table if not exists attachments (
      id text primary key,
      owner_id text not null,
      note_id text not null,
      original_name text not null,
      stored_path text not null,
      mime_type text not null,
      size_bytes integer not null,
      sha256 text not null,
      created_at text not null,
      foreign key(owner_id) references users(id) on delete cascade,
      foreign key(note_id) references notes(id) on delete cascade
    );

    create index if not exists idx_attachments_note_id on attachments(note_id);

    create table if not exists import_jobs (
      id text primary key,
      owner_id text not null,
      source text not null,
      status text not null,
      summary_json text not null,
      root_folder_id text,
      created_at text not null,
      finished_at text,
      foreign key(owner_id) references users(id) on delete cascade,
      foreign key(root_folder_id) references folders(id) on delete set null
    );

    create table if not exists export_jobs (
      id text primary key,
      owner_id text not null,
      status text not null,
      archive_path text,
      summary_json text not null,
      created_at text not null,
      finished_at text,
      foreign key(owner_id) references users(id) on delete cascade
    );

    create table if not exists sessions (
      id text primary key,
      owner_id text not null,
      created_at text not null,
      updated_at text not null,
      expires_at text not null,
      foreign key(owner_id) references users(id) on delete cascade
    );

    create index if not exists idx_sessions_owner_expires on sessions(owner_id, expires_at);

    create virtual table if not exists notes_fts using fts5(
      note_id unindexed,
      owner_id unindexed,
      folder_id unindexed,
      title,
      body,
      tokenize = 'unicode61'
    );
  `);

  const userColumns = connection
    .prepare<[], { name: string }>("pragma table_info(users)")
    .all()
    .map((column) => column.name);

  if (!userColumns.includes("theme")) {
    connection.exec("alter table users add column theme text not null default 'sea';");
  }

  const folderColumns = connection
    .prepare<[], { name: string }>("pragma table_info(folders)")
    .all()
    .map((column) => column.name);

  if (!folderColumns.includes("sort_order")) {
    connection.exec("alter table folders add column sort_order integer not null default 0;");
  }

  if (!folderColumns.includes("icon")) {
    connection.exec("alter table folders add column icon text not null default 'folder';");
  }

  const noteColumns = connection
    .prepare<[], { name: string }>("pragma table_info(notes)")
    .all()
    .map((column) => column.name);

  if (!noteColumns.includes("sort_order")) {
    connection.exec("alter table notes add column sort_order integer not null default 0;");
    backfillNoteSortOrder(connection);
    connection.exec("create index if not exists idx_notes_owner_folder_sort on notes(owner_id, folder_id, sort_order asc);");
  } else {
    connection.exec("create index if not exists idx_notes_owner_folder_sort on notes(owner_id, folder_id, sort_order asc);");
  }
}

function backfillNoteSortOrder(connection: Database.Database) {
  const notes = connection
    .prepare<
      [],
      {
        id: string;
        ownerId: string;
        folderId: string;
        updatedAt: string;
        createdAt: string;
      }
    >(
      `
        select
          id,
          owner_id as ownerId,
          folder_id as folderId,
          updated_at as updatedAt,
          created_at as createdAt
        from notes
        order by owner_id asc, folder_id asc, updated_at desc, created_at desc, id desc
      `
    )
    .all();

  const nextSortOrder = new Map<string, number>();
  const updateNoteSortOrder = connection.prepare("update notes set sort_order = ? where id = ?");
  const transaction = connection.transaction(() => {
    for (const note of notes) {
      const key = `${note.ownerId}:${note.folderId}`;
      const sortOrder = nextSortOrder.get(key) ?? 0;
      updateNoteSortOrder.run(sortOrder, note.id);
      nextSortOrder.set(key, sortOrder + 1);
    }
  });

  transaction();
}
