export const DEFAULT_SCRATCH_WIDTH = 1000;
export const DEFAULT_SCRATCH_HEIGHT = 1000;
export const DEFAULT_SCRATCH_STROKE_COLOR = "#16393d";
export const DEFAULT_SCRATCH_STROKE_WIDTH_PX = 3;
export const DEFAULT_SCRATCH_ERASER_WIDTH_PX = 20;

export type ScratchTool = "draw" | "erase";

export interface ScratchPoint {
  x: number;
  y: number;
}

export interface ScratchStroke {
  color: string;
  mode?: ScratchTool;
  points: ScratchPoint[];
  width: number;
}

export interface ScratchDocument {
  height: number;
  id: string;
  strokes: ScratchStroke[];
  version: 1;
  width: number;
}

export interface ScratchViewportMetrics {
  contentHeight: number;
  contentLeft: number;
  contentTop: number;
  contentWidth: number;
  scrollTop: number;
  viewportHeight: number;
}

export function createEmptyScratchDocument(id = createScratchId()): ScratchDocument {
  return {
    height: DEFAULT_SCRATCH_HEIGHT,
    id,
    strokes: [],
    version: 1,
    width: DEFAULT_SCRATCH_WIDTH
  };
}

export function createScratchId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `scratch-${Date.now()}`;
}

export function cloneScratchDocument(document: ScratchDocument | null) {
  if (!document) {
    return null;
  }

  return {
    ...document,
    strokes: document.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point }))
    }))
  };
}

export function hasScratchInk(document: ScratchDocument | null) {
  return Boolean(document && document.strokes.some((stroke) => getScratchStrokeMode(stroke) === "draw" && stroke.points.length > 0));
}

export function serializeScratchpad(document: ScratchDocument | null) {
  return JSON.stringify(document ?? null);
}

export function getScratchStrokeMode(stroke: Pick<ScratchStroke, "mode">): ScratchTool {
  return stroke.mode === "erase" ? "erase" : "draw";
}

export function normalizeScratchStrokeWidth(pixelWidth: number, surfaceWidth: number, documentWidth = DEFAULT_SCRATCH_WIDTH) {
  if (surfaceWidth <= 0) {
    return pixelWidth;
  }

  return (pixelWidth / surfaceWidth) * documentWidth;
}

export function denormalizeScratchStrokeWidth(strokeWidth: number, surfaceWidth: number, documentWidth: number) {
  if (documentWidth <= 0) {
    return strokeWidth;
  }

  return (strokeWidth / documentWidth) * surfaceWidth;
}

export function resolveScratchViewportPoint(
  viewportX: number,
  viewportY: number,
  document: ScratchDocument,
  metrics: ScratchViewportMetrics
): ScratchPoint {
  const localX = clampScratchCoordinate(viewportX - metrics.contentLeft, metrics.contentWidth);
  const localY = clampScratchCoordinate(viewportY - metrics.contentTop, metrics.viewportHeight);
  return {
    x: clampScratchCoordinate((localX / Math.max(1, metrics.contentWidth)) * document.width, document.width),
    y: clampScratchCoordinate(((metrics.scrollTop + localY) / Math.max(1, metrics.contentHeight)) * document.height, document.height)
  };
}

export function mapScratchPointToViewport(point: ScratchPoint, document: ScratchDocument, metrics: ScratchViewportMetrics): ScratchPoint {
  return {
    x: metrics.contentLeft + (point.x / Math.max(1, document.width)) * metrics.contentWidth,
    y: metrics.contentTop + (point.y / Math.max(1, document.height)) * metrics.contentHeight - metrics.scrollTop
  };
}

function clampScratchCoordinate(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), Math.max(0, max));
}
