import { describe, expect, it } from "vitest";
import { formatMarkdownSelection } from "./markdownFormat";

describe("formatMarkdownSelection", () => {
  it("wraps selected text in bold markdown", () => {
    expect(formatMarkdownSelection("hello world", 0, 5, "bold")).toEqual({
      nextValue: "**hello** world",
      nextSelectionStart: 2,
      nextSelectionEnd: 7
    });
  });

  it("inserts a placeholder when there is no italic selection", () => {
    expect(formatMarkdownSelection("hello", 5, 5, "italic")).toEqual({
      nextValue: "hello*italic text*",
      nextSelectionStart: 6,
      nextSelectionEnd: 17
    });
  });

  it("uses html underline tags for underline formatting", () => {
    expect(formatMarkdownSelection("hello world", 6, 11, "underline")).toEqual({
      nextValue: "hello <u>world</u>",
      nextSelectionStart: 9,
      nextSelectionEnd: 14
    });
  });

  it("prefixes all selected lines for quoted blocks", () => {
    expect(formatMarkdownSelection("alpha\nbeta\ngamma", 1, 9, "quote")).toEqual({
      nextValue: "> alpha\n> beta\ngamma",
      nextSelectionStart: 0,
      nextSelectionEnd: 14
    });
  });

  it("creates a list item placeholder for an empty bulleted list selection", () => {
    expect(formatMarkdownSelection("alpha", 5, 5, "bulleted-list")).toEqual({
      nextValue: "alpha- List item",
      nextSelectionStart: 7,
      nextSelectionEnd: 16
    });
  });

  it("inserts a markdown table template at the cursor", () => {
    expect(formatMarkdownSelection("alpha", 5, 5, "table")).toEqual({
      nextValue: "alpha\n\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |",
      nextSelectionStart: 9,
      nextSelectionEnd: 17
    });
  });

  it("builds a table using the requested rows and columns", () => {
    expect(formatMarkdownSelection("", 0, 0, "table", { table: { columns: 3, rows: 2 } })).toEqual({
      nextValue: "| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
      nextSelectionStart: 2,
      nextSelectionEnd: 10
    });
  });

  it("reuses selected text for the first table header and selects only that header cell", () => {
    expect(formatMarkdownSelection("alpha", 0, 5, "table")).toEqual({
      nextValue: "| alpha | Column 2 |\n| --- | --- |\n|  |  |",
      nextSelectionStart: 2,
      nextSelectionEnd: 7
    });
  });

  describe("note references", () => {
    const noteReference = { id: "note-9", title: "Project plan" };

    it("inserts a link labelled with the note title and leaves the cursor after it", () => {
      const link = "[Project plan](/notes/note-9)";
      expect(formatMarkdownSelection("See  for details", 4, 4, "note-reference", { noteReference })).toEqual({
        nextValue: `See ${link} for details`,
        nextSelectionStart: 4 + link.length,
        nextSelectionEnd: 4 + link.length
      });
    });

    it("uses the selected text as the label and replaces it", () => {
      const link = "[the plan](/notes/note-9)";
      expect(formatMarkdownSelection("See the plan first", 4, 12, "note-reference", { noteReference })).toEqual({
        nextValue: `See ${link} first`,
        nextSelectionStart: 4 + link.length,
        nextSelectionEnd: 4 + link.length
      });
    });

    it("keeps the title when the selection is only whitespace", () => {
      expect(formatMarkdownSelection("a b", 1, 2, "note-reference", { noteReference }).nextValue).toBe("a[Project plan](/notes/note-9)b");
    });

    it("falls back to a placeholder for untitled notes", () => {
      expect(formatMarkdownSelection("", 0, 0, "note-reference", { noteReference: { id: "note-9", title: "  " } }).nextValue).toBe(
        "[Untitled note](/notes/note-9)"
      );
    });

    it("escapes characters that would end the link label early", () => {
      expect(formatMarkdownSelection("", 0, 0, "note-reference", { noteReference: { id: "note-9", title: "Plan [v2] \\ final" } }).nextValue).toBe(
        "[Plan \\[v2\\] \\\\ final](/notes/note-9)"
      );
    });

    it("encodes the note id in the link target", () => {
      expect(formatMarkdownSelection("", 0, 0, "note-reference", { noteReference: { id: "note 9", title: "Plan" } }).nextValue).toBe(
        "[Plan](/notes/note%209)"
      );
    });

    it("changes nothing when no note was given", () => {
      expect(formatMarkdownSelection("hello", 1, 3, "note-reference")).toEqual({
        nextValue: "hello",
        nextSelectionStart: 1,
        nextSelectionEnd: 3
      });
    });
  });
});
