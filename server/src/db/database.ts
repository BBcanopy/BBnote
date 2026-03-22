import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { AppConfig } from "../service/configService.js";
import { runMigrations } from "./migrate.js";

export interface AppDatabase {
  connection: Database.Database;
  close(): void;
}

export function openDatabase(config: AppConfig): AppDatabase {
  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  const connection = new Database(config.sqlitePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  runMigrations(connection);
  return {
    connection,
    close() {
      connection.close();
    }
  };
}

