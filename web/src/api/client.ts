import type {
  AuthSession,
  ExportJob,
  FolderIconId,
  FolderNode,
  ImportJob,
  NoteDetail,
  PaginatedNotes,
  UserTheme
} from "./types";

interface RequestOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersInit;
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    body: options.body ?? null,
    headers,
    credentials: "same-origin"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getAuthSession() {
  return request<AuthSession>("/api/v1/auth/session");
}

export function logoutAuthSession() {
  return request<void>("/api/v1/auth/logout", {
    method: "POST"
  });
}

export function updateUserTheme(theme: UserTheme) {
  return request<AuthSession>("/api/v1/auth/theme", {
    method: "PATCH",
    body: JSON.stringify({ theme })
  });
}

export function listFolders() {
  return request<FolderNode[]>("/api/v1/folders");
}

export function createFolder(payload: { name: string; icon?: FolderIconId; parentId: string | null }) {
  return request<FolderNode>("/api/v1/folders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateFolder(folderId: string, payload: { name: string; icon?: FolderIconId; parentId: string | null; sortOrder?: number }) {
  return request<FolderNode>(`/api/v1/folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteFolder(folderId: string) {
  return request<void>(`/api/v1/folders/${folderId}`, {
    method: "DELETE"
  });
}

export function listNotes(params: {
  q?: string;
  folderId?: string;
  cursor?: string;
  limit?: number;
  sort?: "updatedAt" | "createdAt" | "title" | "priority";
  order?: "asc" | "desc";
}) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.folderId) search.set("folderId", params.folderId);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  return request<PaginatedNotes>(`/api/v1/notes?${search.toString()}`);
}

export function createNote(payload: { folderId: string; title: string; bodyMarkdown: string }) {
  return request<NoteDetail>("/api/v1/notes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getNote(noteId: string) {
  return request<NoteDetail>(`/api/v1/notes/${noteId}`);
}

export function updateNote(noteId: string, payload: { folderId: string; title: string; bodyMarkdown: string }) {
  return request<NoteDetail>(`/api/v1/notes/${noteId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function moveNote(noteId: string, payload: { folderId: string }) {
  return request<NoteDetail>(`/api/v1/notes/${noteId}/move`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function reorderNotes(payload: { folderId: string; orderedNoteIds: string[] }) {
  return request<void>("/api/v1/notes/reorder", {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteNote(noteId: string) {
  return request<void>(`/api/v1/notes/${noteId}`, {
    method: "DELETE"
  });
}

export function uploadAttachment(noteId: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return request(`/api/v1/notes/${noteId}/attachments`, {
    method: "POST",
    body: formData
  });
}

export function deleteAttachment(attachmentId: string) {
  return request<void>(`/api/v1/attachments/${attachmentId}`, {
    method: "DELETE"
  });
}

export function fetchAttachmentBlob(attachmentUrl: string) {
  return fetch(attachmentUrl, {
    credentials: "same-origin"
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Attachment fetch failed.");
    }
    return response.blob();
  });
}

export function createImportJob(source: "onenote" | "synology_note_station", file: File) {
  const formData = new FormData();
  formData.set("source", source);
  formData.set("file", file);
  return request<ImportJob>("/api/v1/imports", {
    method: "POST",
    body: formData
  });
}

export function getImportJob(jobId: string) {
  return request<ImportJob>(`/api/v1/imports/${jobId}`);
}

export function createExportJob() {
  return request<ExportJob>("/api/v1/exports", {
    method: "POST"
  });
}

export function getExportJob(jobId: string) {
  return request<ExportJob>(`/api/v1/exports/${jobId}`);
}

export async function downloadExport(jobId: string) {
  const response = await fetch(`/api/v1/exports/${jobId}/download`, {
    credentials: "same-origin"
  });
  if (!response.ok) {
    throw new Error("Export download failed.");
  }
  return response.blob();
}
