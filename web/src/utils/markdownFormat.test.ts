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

  it("wraps selected text in a scratch block", () => {
    expect(formatMarkdownSelection("draft idea", 0, 10, "scratch")).toEqual({
      nextValue: "```scratch\ndraft idea\n```",
      nextSelectionStart: 11,
      nextSelectionEnd: 21
    });
  });

  it("inserts a scratch placeholder at the cursor and selects it", () => {
    expect(formatMarkdownSelection("", 0, 0, "scratch")).toEqual({
      nextValue: "```scratch\nScratch notes\n```",
      nextSelectionStart: 11,
      nextSelectionEnd: 24
    });
  });

  it("adds block boundaries around scratch blocks when inserting into existing text", () => {
    expect(formatMarkdownSelection("alpha\nbeta", 6, 6, "scratch")).toEqual({
      nextValue: "alpha\n\n```scratch\nScratch notes\n```\n\nbeta",
      nextSelectionStart: 18,
      nextSelectionEnd: 31
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
});
