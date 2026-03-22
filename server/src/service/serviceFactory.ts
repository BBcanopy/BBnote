import type { FastifyInstance } from "fastify";
import { AttachmentDb } from "../db/attachmentDb.js";
import { openDatabase } from "../db/database.js";
import { FolderDb } from "../db/folderDb.js";
import { NoteDb } from "../db/noteDb.js";
import { UserDb } from "../db/userDb.js";
import type { AppConfig } from "./configService.js";
import { AuthService } from "./authService.js";
import { FolderService } from "./folderService.js";
import { MockOidcService } from "./mockOidcService.js";
import { NoteService } from "./noteService.js";
import { StorageService } from "./storageService.js";

export interface AppServices {
  config: AppConfig;
  database: ReturnType<typeof openDatabase>;
  folderService: FolderService;
  noteService: NoteService;
  authService: AuthService;
  storageService: StorageService;
  mockOidcService: MockOidcService | null;
  attachmentDb: AttachmentDb;
}

export async function createServices(config: AppConfig, app?: FastifyInstance): Promise<AppServices> {
  const database = openDatabase(config);
  const userDb = new UserDb(database.connection);
  const folderDb = new FolderDb(database.connection);
  const noteDb = new NoteDb(database.connection);
  const attachmentDb = new AttachmentDb(database.connection);
  const storageService = new StorageService(config);
  await storageService.ensureRoots();
  const folderService = new FolderService(folderDb);
  const mockOidcService = config.mockOidcEnabled ? new MockOidcService(config) : null;
  const noteService = new NoteService(noteDb, folderDb, storageService, (noteId) => attachmentDb.listByNoteId(noteId));
  const authService = new AuthService(config, userDb, folderService, mockOidcService);

  const services: AppServices = {
    config,
    database,
    folderService,
    noteService,
    authService,
    storageService,
    mockOidcService,
    attachmentDb
  };

  if (app) {
    app.addHook("onClose", async () => {
      services.database.close();
    });
  }

  return services;
}

