/**
 * A scratch overlay is freehand ink stored beside a note, never inside its markdown.
 *
 * Coordinates and stroke widths are CSS pixels on a stage that is `layoutWidth` wide. The stage keeps
 * that width for the life of the overlay and is scaled to fit, so the note text cannot re-wrap and ink
 * stays on the words it was drawn over through window resizes and browser zoom. Y is absolute rather
 * than relative to the note height, so editing the text never stretches existing ink.
 */
export const SCRATCH_FORMAT_VERSION = 2;

/** Mirrors the limits enforced by the server (`server/src/service/scratchpad.ts`). */
export const SCRATCH_MAX_STROKES = 5_000;
export const SCRATCH_MAX_POINTS = 50_000;

export const SCRATCH_DRAW_WIDTH = 3;
export const SCRATCH_ERASER_WIDTH = 20;

/** Below this scale text is unreadable, so a narrow viewport pans across the stage instead. */
export const SCRATCH_MIN_STAGE_SCALE = 0.5;

/** Ink keeps the stage at least this tall below its lowest point, even if the text gets shorter. */
const STAGE_INK_MARGIN = 48;
const MIN_POINT_DISTANCE = 1;
const COORDINATE_PRECISION = 10;

/** Browsers silently blank larger canvases; 16M pixels is the lowest limit among current mobile browsers. */
const MAX_CANVAS_AREA = 16_000_000;
const MAX_CANVAS_DIMENSION = 16_384;

export type ScratchTool = "draw" | "erase";

export interface ScratchPoint {
  x: number;
  y: number;
}

export interface ScratchStroke {
  tool: ScratchTool;
  width: number;
  points: ScratchPoint[];
}

export interface ScratchDocument {
  version: typeof SCRATCH_FORMAT_VERSION;
  layoutWidth: number;
  strokes: ScratchStroke[];
}

export function createScratchStroke(tool: ScratchTool, firstPoint: ScratchPoint): ScratchStroke {
  return {
    tool,
    width: tool === "erase" ? SCRATCH_ERASER_WIDTH : SCRATCH_DRAW_WIDTH,
    points: [firstPoint]
  };
}

export function hasScratchInk(document: ScratchDocument | null) {
  return Boolean(document?.strokes.some((stroke) => stroke.tool === "draw"));
}

function countScratchPoints(document: ScratchDocument | null) {
  return document?.strokes.reduce((total, stroke) => total + stroke.points.length, 0) ?? 0;
}

/** How many more points can be drawn, or 0 when the overlay cannot take another stroke. */
export function getRemainingScratchPoints(document: ScratchDocument | null) {
  if ((document?.strokes.length ?? 0) >= SCRATCH_MAX_STROKES) {
    return 0;
  }

  return Math.max(0, SCRATCH_MAX_POINTS - countScratchPoints(document));
}

/**
 * Returns a new document with the stroke added, leaving the previous one intact so it can back undo.
 * The first stroke locks the stage to the width it was drawn on. Erasing nothing changes nothing.
 */
export function addScratchStroke(document: ScratchDocument | null, stroke: ScratchStroke, layoutWidth: number) {
  if (stroke.tool === "erase" && !hasScratchInk(document)) {
    return document;
  }

  return {
    version: SCRATCH_FORMAT_VERSION,
    layoutWidth: document?.layoutWidth ?? layoutWidth,
    strokes: [...(document?.strokes ?? []), stroke]
  } satisfies ScratchDocument;
}

/** Thins out pointer samples that add no visible detail. Returns whether the point was kept. */
export function appendScratchPoint(points: ScratchPoint[], point: ScratchPoint) {
  const last = points.at(-1);
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_POINT_DISTANCE) {
    return false;
  }

  points.push(point);
  return true;
}

/** Maps a pointer position to stage coordinates; the rect already reflects scroll, scale, and zoom. */
export function resolveScratchPoint(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  stage: { width: number; height: number }
): ScratchPoint {
  return {
    x: roundCoordinate(clamp(((clientX - rect.left) / Math.max(1, rect.width)) * stage.width, stage.width)),
    y: roundCoordinate(clamp(((clientY - rect.top) / Math.max(1, rect.height)) * stage.height, stage.height))
  };
}

export function resolveScratchStageScale(viewportWidth: number, layoutWidth: number) {
  if (viewportWidth <= 0 || layoutWidth <= 0) {
    return 1;
  }

  return Math.min(1, Math.max(SCRATCH_MIN_STAGE_SCALE, viewportWidth / layoutWidth));
}

/** The stage must stay tall enough for the lowest ink, however much text remains above it. */
export function getScratchMinStageHeight(document: ScratchDocument | null) {
  let inkBottom = 0;
  for (const stroke of document?.strokes ?? []) {
    if (stroke.tool !== "draw") {
      continue;
    }

    for (const point of stroke.points) {
      inkBottom = Math.max(inkBottom, point.y + stroke.width / 2);
    }
  }

  return inkBottom > 0 ? inkBottom + STAGE_INK_MARGIN : 0;
}

/** Bitmap pixels per stage pixel: sharp on screen, reduced only as far as canvas limits require. */
export function resolveScratchCanvasDensity(stageWidth: number, stageHeight: number, devicePixelRatio: number, scale: number) {
  const onScreenDensity = Math.max(devicePixelRatio, 1) * scale;
  const areaLimit = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, stageWidth * stageHeight));
  const dimensionLimit = MAX_CANVAS_DIMENSION / Math.max(1, stageWidth, stageHeight);
  return Math.min(onScreenDensity, areaLimit, dimensionLimit);
}

const serializedDocuments = new WeakMap<ScratchDocument, string>();

/**
 * A stable comparison key that ignores property order, so a document echoed by the server matches the
 * local one. Documents are immutable, which lets typing in a sketched note reuse the cached key.
 */
export function serializeScratchpad(document: ScratchDocument | null) {
  if (!document) {
    return "null";
  }

  let serialized = serializedDocuments.get(document);
  if (serialized === undefined) {
    serialized = JSON.stringify({
      version: document.version,
      layoutWidth: document.layoutWidth,
      strokes: document.strokes.map(({ tool, width, points }) => ({
        tool,
        width,
        points: points.map(({ x, y }) => ({ x, y }))
      }))
    });
    serializedDocuments.set(document, serialized);
  }

  return serialized;
}

function clamp(value: number, max: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), Math.max(0, max)) : 0;
}

function roundCoordinate(value: number) {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}
