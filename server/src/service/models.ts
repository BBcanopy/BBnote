export interface AuthenticatedUser {
  ownerId: string;
  issuer: string;
  subject: string;
  email: string | null;
  name: string | null;
}

export interface SessionUser {
  email: string | null;
  name: string | null;
}

export interface AuthSessionView {
  authenticated: boolean;
  user: SessionUser | null;
}

export interface FolderRecord {
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  storageDirName: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteRecord {
  id: string;
  ownerId: string;
  folderId: string;
  title: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  sourceApp: string | null;
  sourceId: string | null;
  sourceTagsJson: string;
}

export interface AttachmentRecord {
  id: string;
  ownerId: string;
  noteId: string;
  originalName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface ImportJobRecord {
  id: string;
  ownerId: string;
  source: string;
  status: string;
  summaryJson: string;
  rootFolderId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ExportJobRecord {
  id: string;
  ownerId: string;
  status: string;
  archivePath: string | null;
  summaryJson: string;
  createdAt: string;
  finishedAt: string | null;
}

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  childCount: number;
  noteCount: number;
}

export interface AttachmentView {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  embedded: boolean;
}

export interface NoteSummary {
  id: string;
  folderId: string;
  title: string;
  excerpt: string;
  updatedAt: string;
  attachmentCount: number;
}

export interface NoteDetail {
  id: string;
  folderId: string;
  title: string;
  bodyMarkdown: string;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentView[];
}

export interface PaginatedNotes {
  items: NoteSummary[];
  nextCursor: string | null;
}
