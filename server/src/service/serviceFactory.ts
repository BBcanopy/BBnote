import type { FastifyInstance } from "fastify";
import { AttachmentDb } from "../db/attachmentDb.js";
import { openDatabase } from "../db/database.js";
import { FolderDb } from "../db/folderDb.js";
import { JobDb } from "../db/jobDb.js";
import { NoteDb } from "../db/noteDb.js";
import { SessionDb } from "../db/sessionDb.js";
import { UserDb } from "../db/userDb.js";
import { AttachmentService } from "./attachmentService.js";
import { CookieService } from "./cookieService.js";
import type { AppConfig } from "./configService.js";
import { AuthService } from "./authService.js";
import { ConsistencyService } from "./consistencyService.js";
import { ExportService } from "./exportService.js";
import { FolderService } from "./folderService.js";
import { ImportService } from "./importService.js";
import { MockOidcService } from "./mockOidcService.js";
import { NoteService } from "./noteService.js";
import { OidcService } from "./oidcService.js";
import { StorageService } from "./storageService.js";

export interface AppServices {
  config: AppConfig;
  database: ReturnType<typeof openDatabase>;
  folderService: FolderService;
  noteService: NoteService;
  attachmentService: AttachmentService;
  importService: ImportService;
  exportService: ExportService;
  consistencyService: ConsistencyService;
  authService: AuthService;
  oidcService: OidcService;
  cookieService: CookieService;
  storageService: StorageService;
  mockOidcService: MockOidcService | null;
  attachmentDb: AttachmentDb;
  noteDb: NoteDb;
  folderDb: FolderDb;
  jobDb: JobDb;
  sessionDb: SessionDb;
}

export async function createServices(config: AppConfig, app?: FastifyInstance): Promise<AppServices> {
  const database = openDatabase(config);
  const userDb = new UserDb(database.connection);
  const folderDb = new FolderDb(database.connection);
  const noteDb = new NoteDb(database.connection);
  const attachmentDb = new AttachmentDb(database.connection);
  const jobDb = new JobDb(database.connection);
  const sessionDb = new SessionDb(database.connection);
  const storageService = new StorageService(config);
  await storageService.ensureRoots();
  const folderService = new FolderService(folderDb);
  const mockOidcService = config.mockOidcEnabled ? new MockOidcService(config) : null;
  const cookieService = new CookieService(config);
  const oidcService = new OidcService(config, mockOidcService);
  const noteService = new NoteService(noteDb, folderDb, storageService, (noteId) => attachmentDb.listByNoteId(noteId));
  const attachmentService = new AttachmentService(attachmentDb, noteDb, storageService);
  const importService = new ImportService(jobDb, folderService, noteService, attachmentService);
  const exportService = new ExportService(config, jobDb, folderDb, noteDb, attachmentDb, storageService);
  const consistencyService = new ConsistencyService(noteDb, attachmentDb, storageService);
  const authService = new AuthService(config, userDb, sessionDb, folderService, oidcService, cookieService);

  const services: AppServices = {
    config,
    database,
    folderService,
    noteService,
    attachmentService,
    importService,
    exportService,
    consistencyService,
    authService,
    oidcService,
    cookieService,
    storageService,
    mockOidcService,
    attachmentDb,
    noteDb,
    folderDb,
    jobDb,
    sessionDb
  };

  if (app) {
    app.addHook("onClose", async () => {
      services.database.close();
    });
  }

  return services;
}
