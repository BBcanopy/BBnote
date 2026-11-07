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

const NOTE_PATHNAME_PATTERN = /^(?:\/folders\/[^/]+)?\/notes\/([^/]+)\/?$/;

export function parseNoteIdFromHref(href?: string, serverOrigin?: string | null) {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin && url.origin !== serverOrigin) {
      return null;
    }

    const match = NOTE_PATHNAME_PATTERN.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
