import { z } from "zod";

/**
 * Version 1 was an unreleased format that normalized coordinates to the rendered note height, which
 * stretched ink whenever the text changed. It cannot be converted without the layout it was drawn on,
 * so version 1 documents read back as empty and stay untouched in the database until redrawn.
 */
export const SCRATCH_FORMAT_VERSION = 2;

export const SCRATCH_MAX_STROKES = 5_000;
export const SCRATCH_MAX_POINTS = 50_000;
const SCRATCH_MAX_LAYOUT_WIDTH = 16_384;
const SCRATCH_MAX_STROKE_WIDTH = 256;
const SCRATCH_MAX_COORDINATE = 1_000_000;

const scratchPointSchema = z.object({
  x: z.number().min(0).max(SCRATCH_MAX_COORDINATE),
  y: z.number().min(0).max(SCRATCH_MAX_COORDINATE)
});

const scratchStrokeSchema = z.object({
  tool: z.enum(["draw", "erase"]),
  width: z.number().positive().max(SCRATCH_MAX_STROKE_WIDTH),
  points: z.array(scratchPointSchema).min(1)
});

/** Coordinates and stroke widths are CSS pixels on a stage that is `layoutWidth` wide. */
export const scratchDocumentSchema = z
  .object({
    version: z.literal(SCRATCH_FORMAT_VERSION),
    layoutWidth: z.number().positive().max(SCRATCH_MAX_LAYOUT_WIDTH),
    strokes: z.array(scratchStrokeSchema).max(SCRATCH_MAX_STROKES)
  })
  .refine((document) => document.strokes.reduce((total, stroke) => total + stroke.points.length, 0) <= SCRATCH_MAX_POINTS, {
    message: `Scratch overlays can hold at most ${SCRATCH_MAX_POINTS} points.`,
    path: ["strokes"]
  });

export type ScratchDocument = z.infer<typeof scratchDocumentSchema>;

export function serializeScratchpad(scratchpad: ScratchDocument | null) {
  return scratchpad && scratchpad.strokes.length > 0 ? JSON.stringify(scratchpad) : null;
}

/** Stored documents were validated on write, so reads only need to recognize the format. */
export function parseScratchpad(scratchpadJson: string | null): ScratchDocument | null {
  if (!scratchpadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(scratchpadJson) as { version?: unknown } | null;
    return parsed?.version === SCRATCH_FORMAT_VERSION ? (parsed as ScratchDocument) : null;
  } catch {
    return null;
  }
}
