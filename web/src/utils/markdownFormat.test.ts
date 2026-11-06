import { describe, expect, it } from "vitest";
import { formatMarkdownSelection, normalizeLinkUrl } from "./markdownFormat";

describe("normalizeLinkUrl", () => {
  it("keeps web and email addresses", () => {
    expect(normalizeLinkUrl("https://example.com/guide?a=1#top")).toBe("https://example.com/guide?a=1#top");
    expect(normalizeLinkUrl("  http://example.com  ")).toBe("http://example.com/");
    expect(normalizeLinkUrl("HTTPS://EXAMPLE.COM/Path")).toBe("https://example.com/Path");
    expect(normalizeLinkUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("adds https to bare domains", () => {
    expect(normalizeLinkUrl("example.com")).toBe("https://example.com/");
    expect(normalizeLinkUrl("www.example.co.uk/guide")).toBe("https://www.example.co.uk/guide");
    expect(normalizeLinkUrl("example.com:8080/guide")).toBe("https://example.com:8080/guide");
  });

  it("treats ordinary search text as not a link", () => {
    for (const text of ["", "   ", "project", "project plan", "v1.2", "gewgew", "https://", "mailto:", "see example.com today"]) {
      expect(normalizeLinkUrl(text), text).toBeNull();
    }
  });

  it("refuses other schemes", () => {
    for (const text of ["javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd", "ftp://example.com"]) {
      expect(normalizeLinkUrl(text), text).toBeNull();
    }
  });
});

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

  describe("links", () => {
    const link = { url: "https://example.com/", label: "example.com" };

    it("uses the typed address as the label and leaves it selected", () => {
      expect(formatMarkdownSelection("See  now", 4, 4, "link", { link })).toEqual({
        nextValue: "See [example.com](https://example.com/) now",
        nextSelectionStart: 5,
        nextSelectionEnd: 16
      });
    });

    it("uses the selected text as the label and leaves the cursor after the link", () => {
      const markup = "[the docs](https://example.com/)";
      expect(formatMarkdownSelection("See the docs now", 4, 12, "link", { link })).toEqual({
        nextValue: `See ${markup} now`,
        nextSelectionStart: 4 + markup.length,
        nextSelectionEnd: 4 + markup.length
      });
    });

    it("keeps addresses with parentheses inside the link", () => {
      const url = "https://example.com/guide_(v2)";
      expect(formatMarkdownSelection("", 0, 0, "link", { link: { url, label: "Guide" } }).nextValue).toBe(`[Guide](<${url}>)`);
    });

    it("keeps angle brackets from ending the address early", () => {
      const url = "mailto:a(b)<c>@example.com";
      expect(formatMarkdownSelection("", 0, 0, "link", { link: { url, label: "Mail" } }).nextValue).toBe(
        "[Mail](<mailto:a(b)%3Cc%3E@example.com>)"
      );
    });

    it("escapes characters that would end the label early", () => {
      expect(formatMarkdownSelection("[v2]", 0, 4, "link", { link }).nextValue).toBe("[\\[v2\\]](https://example.com/)");
    });

    it("changes nothing when no link was given", () => {
      expect(formatMarkdownSelection("hello", 1, 3, "link")).toEqual({
        nextValue: "hello",
        nextSelectionStart: 1,
        nextSelectionEnd: 3
      });
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
