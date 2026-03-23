import type { NoteSummary } from "../api/types";

export type NoteMovePosition = "before" | "after";

export interface NoteMoveInstruction {
  draggedId: string;
  targetId: string;
  position: NoteMovePosition;
}

export function moveNotes(notes: NoteSummary[], move: NoteMoveInstruction): NoteSummary[] | null {
  if (move.draggedId === move.targetId) {
    return null;
  }

  const draggedIndex = notes.findIndex((note) => note.id === move.draggedId);
  const targetIndex = notes.findIndex((note) => note.id === move.targetId);

  if (draggedIndex < 0 || targetIndex < 0) {
    return null;
  }

  const nextNotes = [...notes];
  const [draggedNote] = nextNotes.splice(draggedIndex, 1);
  const adjustedTargetIndex = nextNotes.findIndex((note) => note.id === move.targetId);
  const insertIndex = move.position === "before" ? adjustedTargetIndex : adjustedTargetIndex + 1;
  nextNotes.splice(insertIndex, 0, draggedNote);

  return nextNotes.map((note, index) => ({
    ...note,
    sortOrder: index
  }));
}

export function buildNoteOrderIds(notes: NoteSummary[]) {
  return notes.map((note) => note.id);
}
