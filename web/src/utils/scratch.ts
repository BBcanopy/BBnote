export const DEFAULT_SCRATCH_WIDTH = 1000;
export const DEFAULT_SCRATCH_HEIGHT = 1000;
export const DEFAULT_SCRATCH_STROKE_COLOR = "#16393d";
export const DEFAULT_SCRATCH_STROKE_WIDTH_PX = 3;

export interface ScratchPoint {
  x: number;
  y: number;
}

export interface ScratchStroke {
  color: string;
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
  return Boolean(document && document.strokes.length > 0);
}

export function serializeScratchpad(document: ScratchDocument | null) {
  return JSON.stringify(document ?? null);
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
