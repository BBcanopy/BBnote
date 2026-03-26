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
      nextValue: "alpha\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Value 1 | Value 2 |",
      nextSelectionStart: 9,
      nextSelectionEnd: 28
    });
  });
});
