const FORBIDDEN_PATH_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const LEADING_TRAILING_SEPARATORS = /^[-._\s]+|[-._\s]+$/g;
const MULTIPLE_SEPARATORS = /[-_\s]+/g;

export function sanitizeSegment(input: string): string {
  const sanitized = input
    .normalize("NFKC")
    .replace(FORBIDDEN_PATH_CHARS, " ")
    .replace(/\.+/g, " ")
    .replace(MULTIPLE_SEPARATORS, "-")
    .replace(LEADING_TRAILING_SEPARATORS, "");
  return sanitized || "untitled";
}

export function truncateUtf8(input: string, maxBytes: number): string {
  if (Buffer.byteLength(input, "utf8") <= maxBytes) {
    return input;
  }

  let output = "";
  for (const character of input) {
    if (Buffer.byteLength(output + character, "utf8") > maxBytes) {
      break;
    }
    output += character;
  }
  return output || "untitled";
}

export function buildFolderDirectoryName(name: string, folderId: string): string {
  const suffix = `--${folderId}`;
  const slugBudget = 143 - Buffer.byteLength(suffix, "utf8");
  const slug = truncateUtf8(sanitizeSegment(name), slugBudget);
  return `${slug}${suffix}`;
}

export function buildNoteFileName(date: string, title: string, noteId: string): string {
  const prefix = `${date}--`;
  const suffix = `--${noteId}.md`;
  const slugBudget = 143 - Buffer.byteLength(prefix, "utf8") - Buffer.byteLength(suffix, "utf8");
  const minimumBudget = Buffer.byteLength("untitled", "utf8");
  const slug = truncateUtf8(sanitizeSegment(title), Math.max(slugBudget, minimumBudget));
  return `${prefix}${slug}${suffix}`;
}

export function buildAttachmentFileName(originalName: string): string {
  const extensionMatch = originalName.match(/(\.[^.]+)$/u);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? originalName.slice(0, -extension.length) : originalName;
  const safeExtension = extension.replace(FORBIDDEN_PATH_CHARS, "").slice(0, 16);
  const slugBudget = 143 - Buffer.byteLength(safeExtension, "utf8");
  const base = truncateUtf8(sanitizeSegment(baseName), slugBudget);
  return `${base}${safeExtension}`;
}
