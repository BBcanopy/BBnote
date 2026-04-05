import { describe, expect, it } from "vitest";
import {
  cloneScratchDocument,
  createEmptyScratchDocument,
  getScratchStrokeMode,
  mapScratchPointToViewport,
  denormalizeScratchStrokeWidth,
  hasScratchInk,
  normalizeScratchStrokeWidth,
  resolveScratchViewportPoint,
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

  it("treats missing stroke modes as draw and ignores erase-only documents for visible ink", () => {
    const eraseOnly = createEmptyScratchDocument("scratch-3");
    eraseOnly.strokes.push({
      color: "#16393d",
      mode: "erase",
      points: [{ x: 24, y: 40 }],
      width: 12
    });

    expect(getScratchStrokeMode({})).toBe("draw");
    expect(getScratchStrokeMode({ mode: "erase" })).toBe("erase");
    expect(hasScratchInk(eraseOnly)).toBe(false);
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

  it("maps scratch coordinates through the content box instead of the outer shell", () => {
    const scratch = createEmptyScratchDocument("scratch-4");
    const point = resolveScratchViewportPoint(56, 76, scratch, {
      contentLeft: 16,
      contentTop: 20,
      contentWidth: 400,
      contentHeight: 800,
      scrollTop: 120,
      viewportHeight: 300
    });

    expect(point).toEqual({
      x: 100,
      y: 220
    });

    expect(
      mapScratchPointToViewport(point, scratch, {
        contentLeft: 16,
        contentTop: 20,
        contentWidth: 400,
        contentHeight: 800,
        scrollTop: 120,
        viewportHeight: 300
      })
    ).toEqual({
      x: 56,
      y: 76
    });
  });
});
