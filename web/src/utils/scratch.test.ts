import { describe, expect, it } from "vitest";
import {
  cloneScratchDocument,
  createEmptyScratchDocument,
  denormalizeScratchStrokeWidth,
  hasScratchInk,
  normalizeScratchStrokeWidth,
  serializeScratchpad
} from "./scratch";

describe("scratch utils", () => {
  it("clones a scratch document without sharing nested arrays", () => {
    const scratch = createEmptyScratchDocument("scratch-1");
    scratch.strokes.push({
      color: "#16393d",
      points: [
        { x: 100, y: 120 },
        { x: 180, y: 220 }
      ],
      width: 8
    });

    const cloned = cloneScratchDocument(scratch);
    expect(cloned).toEqual(scratch);

    cloned!.strokes[0].points[0].x = 999;
    expect(scratch.strokes[0].points[0].x).toBe(100);
  });

  it("tracks whether a scratchpad has ink", () => {
    const empty = createEmptyScratchDocument("scratch-1");
    const inked = createEmptyScratchDocument("scratch-2");
    inked.strokes.push({
      color: "#16393d",
      points: [{ x: 10, y: 20 }],
      width: 6
    });

    expect(hasScratchInk(null)).toBe(false);
    expect(hasScratchInk(empty)).toBe(false);
    expect(hasScratchInk(inked)).toBe(true);
  });

  it("serializes nullable scratchpad content for autosave keys", () => {
    expect(serializeScratchpad(null)).toBe("null");
    expect(serializeScratchpad(createEmptyScratchDocument("scratch-1"))).toContain("\"id\":\"scratch-1\"");
  });

  it("normalizes stroke width across different surface widths", () => {
    const normalized = normalizeScratchStrokeWidth(3, 600, 1000);

    expect(normalized).toBeCloseTo(5);
    expect(denormalizeScratchStrokeWidth(normalized, 600, 1000)).toBeCloseTo(3);
  });
});
