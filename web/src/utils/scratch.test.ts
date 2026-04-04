import { describe, expect, it } from "vitest";
import {
  buildScratchMarkdown,
  createEmptyScratchDocument,
  insertScratchMarkdown,
  parseScratchDocument,
  replaceScratchMarkdown
} from "./scratch";

describe("scratch utils", () => {
  it("parses a serialized scratch document", () => {
    const scratch = createEmptyScratchDocument("scratch-1");
    scratch.strokes.push({
      color: "#16393d",
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 }
      ],
      width: 3
    });

    expect(parseScratchDocument(JSON.stringify(scratch))).toEqual(scratch);
  });

  it("returns null for invalid scratch payloads", () => {
    expect(parseScratchDocument("{\"version\":1}")).toBeNull();
    expect(parseScratchDocument("not json")).toBeNull();
  });

  it("inserts a scratch block with block boundaries", () => {
    const scratch = createEmptyScratchDocument("scratch-1");

    expect(insertScratchMarkdown("alpha\nbeta", 6, 6, scratch)).toBe(
      `alpha\n\n${buildScratchMarkdown(scratch)}\n\nbeta`
    );
  });

  it("replaces an existing scratch block in place", () => {
    const original = createEmptyScratchDocument("scratch-1");
    const updated = createEmptyScratchDocument("scratch-1");
    updated.strokes.push({
      color: "#16393d",
      points: [
        { x: 10, y: 12 },
        { x: 18, y: 22 }
      ],
      width: 3
    });

    const originalMarkdown = buildScratchMarkdown(original);
    const value = `before\n\n${originalMarkdown}\n\nafter`;
    const start = value.indexOf(originalMarkdown);
    const end = start + originalMarkdown.length;

    expect(replaceScratchMarkdown(value, start, end, updated)).toBe(`before\n\n${buildScratchMarkdown(updated)}\n\nafter`);
  });
});
