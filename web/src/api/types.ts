export type UserTheme = "sea" | "ember" | "midnight";

export const folderIconIds = ["folder", "inbox", "archive", "bookmark", "briefcase", "book", "calendar", "star"] as const;
export type FolderIconId = (typeof folderIconIds)[number];

export interface AuthSession {
  authenticated: boolean;
  user: {
    email: string | null;
    name: string | null;
    theme: UserTheme;
  } | null;
}

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  icon: FolderIconId;
  childCount: number;
  noteCount: number;
}

export interface AttachmentRef {
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
  sortOrder: number;
  updatedAt: string;
  attachmentCount: number;
}

export interface NoteDetail {
  id: string;
  folderId: string;
  title: string;
  bodyMarkdown: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentRef[];
}

export interface PaginatedNotes {
  items: NoteSummary[];
  nextCursor: string | null;
}

export interface ImportJob {
  id: string;
  source: string;
  status: string;
  createdCount: number;
  warningCount: number;
  warnings: string[];
}

export interface ExportJob {
  id: string;
  status: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  summary: {
    noteCount: number;
    folderCount: number;
    attachmentCount: number;
  };
}
