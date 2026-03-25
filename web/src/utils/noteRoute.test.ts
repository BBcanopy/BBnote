import { describe, expect, it } from "vitest";
import { buildNotesPath, isNotesPathname } from "./noteRoute";

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
