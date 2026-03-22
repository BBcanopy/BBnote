import type {
  ExportJob,
  FolderNode,
  ImportJob,
  NoteDetail,
  PaginatedNotes,
  RuntimeConfig
} from "./types";

interface RequestOptions {
  method?: string;
  token?: string | null;
  body?: BodyInit | null;
  headers?: HeadersInit;
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    body: options.body ?? null,
    headers
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

export function getRuntimeConfig() {
  return request<RuntimeConfig>("/api/v1/runtime-config");
}

export function listFolders(token: string) {
  return request<FolderNode[]>("/api/v1/folders", { token });
}

export function createFolder(token: string, payload: { name: string; parentId: string | null }) {
  return request<FolderNode>("/api/v1/folders", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function updateFolder(token: string, folderId: string, payload: { name: string; parentId: string | null }) {
  return request<FolderNode>(`/api/v1/folders/${folderId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(payload)
  });
}

export function deleteFolder(token: string, folderId: string) {
  return request<void>(`/api/v1/folders/${folderId}`, {
    method: "DELETE",
    token
  });
}

export function listNotes(
  token: string,
  params: {
    q?: string;
    folderId?: string;
    cursor?: string;
    limit?: number;
    sort?: "updatedAt" | "createdAt" | "title";
    order?: "asc" | "desc";
  }
) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.folderId) search.set("folderId", params.folderId);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.sort) search.set("sort", params.sort);
  if (params.order) search.set("order", params.order);
  return request<PaginatedNotes>(`/api/v1/notes?${search.toString()}`, { token });
}

export function createNote(token: string, payload: { folderId?: string; title: string; bodyMarkdown: string }) {
  return request<NoteDetail>("/api/v1/notes", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export function getNote(token: string, noteId: string) {
  return request<NoteDetail>(`/api/v1/notes/${noteId}`, { token });
}

export function updateNote(token: string, noteId: string, payload: { folderId?: string; title: string; bodyMarkdown: string }) {
  return request<NoteDetail>(`/api/v1/notes/${noteId}`, {
    method: "PUT",
    token,
    body: JSON.stringify(payload)
  });
}

export function deleteNote(token: string, noteId: string) {
  return request<void>(`/api/v1/notes/${noteId}`, {
    method: "DELETE",
    token
  });
}

export function uploadAttachment(token: string, noteId: string, file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return request(`/api/v1/notes/${noteId}/attachments`, {
    method: "POST",
    token,
    body: formData
  });
}

export function deleteAttachment(token: string, attachmentId: string) {
  return request<void>(`/api/v1/attachments/${attachmentId}`, {
    method: "DELETE",
    token
  });
}

export function fetchAttachmentBlob(token: string, attachmentUrl: string) {
  return fetch(attachmentUrl, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error("Attachment fetch failed.");
    }
    return response.blob();
  });
}

export function createImportJob(token: string, source: "onenote" | "synology_note_station", file: File) {
  const formData = new FormData();
  formData.set("source", source);
  formData.set("file", file);
  return request<ImportJob>("/api/v1/imports", {
    method: "POST",
    token,
    body: formData
  });
}

export function getImportJob(token: string, jobId: string) {
  return request<ImportJob>(`/api/v1/imports/${jobId}`, { token });
}

export function createExportJob(token: string) {
  return request<ExportJob>("/api/v1/exports", {
    method: "POST",
    token
  });
}

export function getExportJob(token: string, jobId: string) {
  return request<ExportJob>(`/api/v1/exports/${jobId}`, { token });
}

export async function downloadExport(token: string, jobId: string) {
  const response = await fetch(`/api/v1/exports/${jobId}/download`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    throw new Error("Export download failed.");
  }
  return response.blob();
}

