import { describe, expect, it } from "vitest";
import { buildNotesPath, isNotesPathname, parseNoteIdFromHref } from "./noteRoute";

describe("buildNotesPath", () => {
  it("returns the root notes path when nothing is selected", () => {
    expect(buildNotesPath({ folderId: null, noteId: null })).toBe("/");
  });

  it("returns a folder path when only a notebook is selected", () => {
    expect(buildNotesPath({ folderId: "folder-1", noteId: null })).toBe("/folders/folder-1");
  });

  it("returns a notebook and note path when both are selected", () => {
    expect(buildNotesPath({ folderId: "folder-1", noteId: "note-9" })).toBe("/folders/folder-1/notes/note-9");
  });

  it("returns a note-only path when a note is selected from all notes", () => {
    expect(buildNotesPath({ folderId: null, noteId: "note-9" })).toBe("/notes/note-9");
  });
});

describe("isNotesPathname", () => {
  it("matches notes routes and rejects non-notes routes", () => {
    expect(isNotesPathname("/")).toBe(true);
    expect(isNotesPathname("/folders/folder-1")).toBe(true);
    expect(isNotesPathname("/folders/folder-1/notes/note-9")).toBe(true);
    expect(isNotesPathname("/notes/note-9")).toBe(true);
    expect(isNotesPathname("/migration")).toBe(false);
  });
});

describe("parseNoteIdFromHref", () => {
  it("reads the note id from either notes route", () => {
    expect(parseNoteIdFromHref("/notes/note-9")).toBe("note-9");
    expect(parseNoteIdFromHref("/folders/folder-1/notes/note-9")).toBe("note-9");
    expect(parseNoteIdFromHref("/notes/note-9/")).toBe("note-9");
  });

  it("accepts absolute urls on the same origin and ignores query strings and hashes", () => {
    expect(parseNoteIdFromHref(`${window.location.origin}/notes/note-9`)).toBe("note-9");
    expect(parseNoteIdFromHref("/notes/note-9?from=list#top")).toBe("note-9");
  });

  it("decodes encoded ids", () => {
    expect(parseNoteIdFromHref("/notes/note%209")).toBe("note 9");
  });

  it("rejects other origins, including protocol-relative urls", () => {
    expect(parseNoteIdFromHref("https://example.com/notes/note-9")).toBeNull();
    expect(parseNoteIdFromHref("//example.com/notes/note-9")).toBeNull();
  });

  it("rejects paths that are not a single note", () => {
    expect(parseNoteIdFromHref("/api/v1/attachments/file-1")).toBeNull();
    expect(parseNoteIdFromHref("/notes")).toBeNull();
    expect(parseNoteIdFromHref("/notes/note-9/extra")).toBeNull();
    expect(parseNoteIdFromHref("/folders/folder-1")).toBeNull();
    expect(parseNoteIdFromHref("/migration")).toBeNull();
  });

  it("rejects empty hrefs, other schemes, and malformed encoding", () => {
    expect(parseNoteIdFromHref(undefined)).toBeNull();
    expect(parseNoteIdFromHref("")).toBeNull();
    expect(parseNoteIdFromHref("mailto:someone@example.com")).toBeNull();
    expect(parseNoteIdFromHref("/notes/%E0%A4%A")).toBeNull();
  });
});
