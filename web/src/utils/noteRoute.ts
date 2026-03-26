interface NotesPathOptions {
  folderId: string | null;
  noteId: string | null;
}

export function buildNotesPath(options: NotesPathOptions) {
  if (options.folderId && options.noteId) {
    return `/folders/${encodeURIComponent(options.folderId)}/notes/${encodeURIComponent(options.noteId)}`;
  }

  if (options.folderId) {
    return `/folders/${encodeURIComponent(options.folderId)}`;
  }

  if (options.noteId) {
    return `/notes/${encodeURIComponent(options.noteId)}`;
  }

  return "/";
}

export function isNotesPathname(pathname: string) {
  return pathname === "/" || pathname.startsWith("/folders/") || pathname.startsWith("/notes/");
}
