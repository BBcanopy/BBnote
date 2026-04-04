export const SCRATCH_FENCE_LANGUAGE = "scratch";
export const DEFAULT_SCRATCH_WIDTH = 640;
export const DEFAULT_SCRATCH_HEIGHT = 360;
export const DEFAULT_SCRATCH_STROKE_COLOR = "#16393d";
export const DEFAULT_SCRATCH_STROKE_WIDTH = 3;

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

export interface ScratchEditTarget {
  document: ScratchDocument;
  endOffset: number;
  startOffset: number;
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

export function buildScratchMarkdown(document: ScratchDocument) {
  return `\`\`\`${SCRATCH_FENCE_LANGUAGE}\n${JSON.stringify(document)}\n\`\`\``;
}

export function parseScratchDocument(source: string): ScratchDocument | null {
  try {
    const parsed = JSON.parse(source) as Partial<ScratchDocument>;
    if (parsed.version !== 1 || typeof parsed.id !== "string" || typeof parsed.width !== "number" || typeof parsed.height !== "number") {
      return null;
    }

    if (!Array.isArray(parsed.strokes)) {
      return null;
    }

    const strokes = parsed.strokes
      .map((stroke) => normalizeScratchStroke(stroke))
      .filter((stroke): stroke is ScratchStroke => stroke !== null);

    if (strokes.length !== parsed.strokes.length) {
      return null;
    }

    return {
      height: parsed.height,
      id: parsed.id,
      strokes,
      version: 1,
      width: parsed.width
    };
  } catch {
    return null;
  }
}

export function insertScratchMarkdown(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  document: ScratchDocument
) {
  const safeStart = clampSelectionIndex(selectionStart, value.length);
  const safeEnd = clampSelectionIndex(selectionEnd, value.length);
  const prefix = getBlockBoundaryPrefix(value.slice(0, safeStart));
  const suffix = getBlockBoundarySuffix(value.slice(safeEnd));
  const scratchMarkdown = buildScratchMarkdown(document);

  return `${value.slice(0, safeStart)}${prefix}${scratchMarkdown}${suffix}${value.slice(safeEnd)}`;
}

export function replaceScratchMarkdown(value: string, startOffset: number, endOffset: number, document: ScratchDocument) {
  const safeStart = clampSelectionIndex(startOffset, value.length);
  const safeEnd = clampSelectionIndex(endOffset, value.length);
  return `${value.slice(0, safeStart)}${buildScratchMarkdown(document)}${value.slice(safeEnd)}`;
}

function normalizeScratchStroke(stroke: unknown): ScratchStroke | null {
  if (!stroke || typeof stroke !== "object") {
    return null;
  }

  const candidate = stroke as Partial<ScratchStroke>;
  if (typeof candidate.color !== "string" || typeof candidate.width !== "number" || !Array.isArray(candidate.points)) {
    return null;
  }

  const points = candidate.points
    .map((point) => normalizeScratchPoint(point))
    .filter((point): point is ScratchPoint => point !== null);

  if (points.length !== candidate.points.length) {
    return null;
  }

  return {
    color: candidate.color,
    points,
    width: candidate.width
  };
}

function normalizeScratchPoint(point: unknown): ScratchPoint | null {
  if (!point || typeof point !== "object") {
    return null;
  }

  const candidate = point as Partial<ScratchPoint>;
  if (typeof candidate.x !== "number" || typeof candidate.y !== "number") {
    return null;
  }

  return {
    x: candidate.x,
    y: candidate.y
  };
}

function clampSelectionIndex(value: number, max: number) {
  return Math.max(0, Math.min(value, max));
}

function getBlockBoundaryPrefix(valueBeforeSelection: string) {
  if (valueBeforeSelection.length === 0) {
    return "";
  }

  if (valueBeforeSelection.endsWith("\n\n")) {
    return "";
  }

  if (valueBeforeSelection.endsWith("\n")) {
    return "\n";
  }

  return "\n\n";
}

function getBlockBoundarySuffix(valueAfterSelection: string) {
  if (valueAfterSelection.length === 0) {
    return "";
  }

  if (valueAfterSelection.startsWith("\n\n")) {
    return "";
  }

  if (valueAfterSelection.startsWith("\n")) {
    return "\n";
  }

  return "\n\n";
}
