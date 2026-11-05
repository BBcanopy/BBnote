import { describe, expect, it } from "vitest";
import {
  addScratchStroke,
  appendScratchPoint,
  createScratchStroke,
  getRemainingScratchPoints,
  getScratchMinStageHeight,
  hasScratchInk,
  resolveScratchCanvasDensity,
  resolveScratchPoint,
  resolveScratchStageScale,
  SCRATCH_DRAW_WIDTH,
  SCRATCH_ERASER_WIDTH,
  SCRATCH_MAX_POINTS,
  SCRATCH_MAX_STROKES,
  SCRATCH_MIN_STAGE_SCALE,
  serializeScratchpad,
  type ScratchDocument
} from "./scratch";

const point = { x: 10, y: 20 };
const drawStroke = createScratchStroke("draw", point);
const eraseStroke = createScratchStroke("erase", point);

describe("addScratchStroke", () => {
  it("locks the stage to the width of the first stroke and keeps it afterwards", () => {
    const first = addScratchStroke(null, drawStroke, 720);
    expect(first).toEqual({ version: 2, layoutWidth: 720, strokes: [drawStroke] });

    expect(addScratchStroke(first, drawStroke, 1400)?.layoutWidth).toBe(720);
  });

  it("does not mutate the previous document, so it can back undo", () => {
    const first = addScratchStroke(null, drawStroke, 720);
    const second = addScratchStroke(first, eraseStroke, 720);

    expect(first?.strokes).toHaveLength(1);
    expect(second?.strokes).toHaveLength(2);
    expect(second?.strokes[0]).toBe(first?.strokes[0]);
  });

  it("ignores erasing when there is no ink to erase", () => {
    expect(addScratchStroke(null, eraseStroke, 720)).toBeNull();

    const onlyErased = { version: 2, layoutWidth: 720, strokes: [eraseStroke] } satisfies ScratchDocument;
    expect(addScratchStroke(onlyErased, eraseStroke, 720)).toBe(onlyErased);
  });
});

describe("createScratchStroke", () => {
  it("uses a wider brush for the eraser", () => {
    expect(drawStroke).toMatchObject({ tool: "draw", width: SCRATCH_DRAW_WIDTH });
    expect(eraseStroke).toMatchObject({ tool: "erase", width: SCRATCH_ERASER_WIDTH });
  });
});

describe("hasScratchInk", () => {
  it("only counts drawn strokes", () => {
    expect(hasScratchInk(null)).toBe(false);
    expect(hasScratchInk({ version: 2, layoutWidth: 720, strokes: [eraseStroke] })).toBe(false);
    expect(hasScratchInk({ version: 2, layoutWidth: 720, strokes: [eraseStroke, drawStroke] })).toBe(true);
  });
});

describe("getRemainingScratchPoints", () => {
  it("counts down from the point limit", () => {
    expect(getRemainingScratchPoints(null)).toBe(SCRATCH_MAX_POINTS);
    expect(getRemainingScratchPoints({ version: 2, layoutWidth: 720, strokes: [drawStroke, drawStroke] })).toBe(SCRATCH_MAX_POINTS - 2);
  });

  it("reports nothing left when the overlay is out of points or strokes", () => {
    const points = Array.from({ length: SCRATCH_MAX_POINTS }, () => point);
    expect(getRemainingScratchPoints({ version: 2, layoutWidth: 720, strokes: [{ ...drawStroke, points }] })).toBe(0);

    const strokes = Array.from({ length: SCRATCH_MAX_STROKES }, () => drawStroke);
    expect(getRemainingScratchPoints({ version: 2, layoutWidth: 720, strokes })).toBe(0);
  });
});

describe("appendScratchPoint", () => {
  it("drops samples too close to the previous point", () => {
    const points = [{ x: 0, y: 0 }];

    expect(appendScratchPoint(points, { x: 0.5, y: 0.5 })).toBe(false);
    expect(appendScratchPoint(points, { x: 3, y: 4 })).toBe(true);
    expect(points).toEqual([{ x: 0, y: 0 }, { x: 3, y: 4 }]);
  });
});

describe("resolveScratchPoint", () => {
  const stage = { width: 800, height: 2000 };

  it("maps client coordinates through the scaled and scrolled canvas rect", () => {
    const halfScaleRect = { left: 100, top: -300, width: 400, height: 1000 };

    expect(resolveScratchPoint(300, 200, halfScaleRect, stage)).toEqual({ x: 400, y: 1000 });
  });

  it("clamps pointers captured outside the stage", () => {
    const rect = { left: 0, top: 0, width: 800, height: 2000 };

    expect(resolveScratchPoint(-50, 3000, rect, stage)).toEqual({ x: 0, y: 2000 });
  });

  it("rounds coordinates to keep stored overlays small", () => {
    const rect = { left: 0, top: 0, width: 800, height: 2000 };

    expect(resolveScratchPoint(10.123456, 20.987654, rect, stage)).toEqual({ x: 10.1, y: 21 });
  });

  it("gives the same stage point at every zoom level", () => {
    const atFullSize = resolveScratchPoint(400, 500, { left: 0, top: 0, width: 800, height: 2000 }, stage);
    const zoomedToFit = resolveScratchPoint(200, 250, { left: 0, top: 0, width: 400, height: 1000 }, stage);

    expect(zoomedToFit).toEqual(atFullSize);
  });
});

describe("resolveScratchStageScale", () => {
  it("scales down to fit a narrower viewport", () => {
    expect(resolveScratchStageScale(600, 800)).toBe(0.75);
  });

  it("never scales above full size", () => {
    expect(resolveScratchStageScale(1600, 800)).toBe(1);
  });

  it("stops at the minimum scale so text stays readable", () => {
    expect(resolveScratchStageScale(100, 800)).toBe(SCRATCH_MIN_STAGE_SCALE);
  });

  it("stays at full size until the viewport has been measured", () => {
    expect(resolveScratchStageScale(0, 800)).toBe(1);
    expect(resolveScratchStageScale(800, 0)).toBe(1);
  });
});

describe("getScratchMinStageHeight", () => {
  it("has no minimum without ink", () => {
    expect(getScratchMinStageHeight(null)).toBe(0);
    expect(getScratchMinStageHeight({ version: 2, layoutWidth: 720, strokes: [{ ...eraseStroke, points: [{ x: 0, y: 900 }] }] })).toBe(0);
  });

  it("clears the lowest drawn point", () => {
    const document: ScratchDocument = {
      version: 2,
      layoutWidth: 720,
      strokes: [{ ...drawStroke, width: 4, points: [{ x: 0, y: 100 }, { x: 0, y: 900 }, { x: 0, y: 400 }] }]
    };

    expect(getScratchMinStageHeight(document)).toBeGreaterThan(902);
  });
});

describe("resolveScratchCanvasDensity", () => {
  it("matches device pixels on screen", () => {
    expect(resolveScratchCanvasDensity(800, 1000, 2, 1)).toBe(2);
    expect(resolveScratchCanvasDensity(800, 1000, 2, 0.5)).toBe(1);
    expect(resolveScratchCanvasDensity(800, 1000, 0.5, 1)).toBe(1);
  });

  it("stays inside browser canvas limits for very long notes instead of going blank", () => {
    const stageWidth = 1000;
    const stageHeight = 200_000;
    const density = resolveScratchCanvasDensity(stageWidth, stageHeight, 2, 1);

    expect(stageWidth * density * (stageHeight * density)).toBeLessThanOrEqual(16_000_001);
    expect(stageHeight * density).toBeLessThanOrEqual(16_384);
    expect(density).toBeGreaterThan(0);
  });
});

describe("serializeScratchpad", () => {
  it("serializes a missing overlay", () => {
    expect(serializeScratchpad(null)).toBe("null");
  });

  it("ignores property order so an overlay echoed by the server does not look edited", () => {
    const local: ScratchDocument = {
      version: 2,
      layoutWidth: 720,
      strokes: [{ tool: "draw", width: 3, points: [{ x: 1, y: 2 }] }]
    };
    const echoed = JSON.parse('{"strokes":[{"points":[{"y":2,"x":1}],"width":3,"tool":"draw"}],"layoutWidth":720,"version":2}') as ScratchDocument;

    expect(serializeScratchpad(echoed)).toBe(serializeScratchpad(local));
  });

  it("changes when the strokes change", () => {
    const first = addScratchStroke(null, drawStroke, 720);
    const second = addScratchStroke(first, drawStroke, 720);

    expect(serializeScratchpad(second)).not.toBe(serializeScratchpad(first));
  });
});
