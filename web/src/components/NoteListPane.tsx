import { CaretLeft, MagnifyingGlass, Plus, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import type { NoteSummary } from "../api/types";
import { getDragPayload, setDragPayload } from "../utils/dragPayload";
import type { NoteMoveInstruction, NoteMovePosition } from "../utils/noteOrder";

const NOTE_PREVIEW_EXCERPT_LIMIT = 42;

interface NoteDropTarget {
  targetId: string;
  position: NoteMovePosition;
}

export function NoteListPane(props: {
  notes: NoteSummary[];
  search: string;
  onSearchChange(value: string): void;
  selectedNoteId: string | null;
  onSelectNote(noteId: string): void;
  onCreateNote(): void;
  onDraggedNoteChange(note: Pick<NoteSummary, "id" | "title"> | null): void;
  onRequestDeleteNote(note: Pick<NoteSummary, "id" | "title">): void;
  onCollapse?(): void;
  loading: boolean;
  notebookName: string | null;
  canCreateNote: boolean;
  canReorder: boolean;
  enableCrossNotebookMove?: boolean;
  onMoveNote(move: NoteMoveInstruction): void;
}) {
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedNoteFolderId, setDraggedNoteFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<NoteDropTarget | null>(null);
  const [deleteTargetActive, setDeleteTargetActive] = useState(false);
  const canDragNotes = props.enableCrossNotebookMove || props.canReorder;
  const dragging = canDragNotes && draggedNoteId !== null;
  const draggedNote = useMemo(
    () => props.notes.find((note) => note.id === draggedNoteId) ?? null,
    [draggedNoteId, props.notes]
  );

  useEffect(() => {
    if (!props.canReorder) {
      setDropTarget(null);
    }
  }, [props.canReorder]);

  useEffect(() => {
    if (draggedNoteId && (!draggedNote || (draggedNoteFolderId !== null && draggedNote.folderId !== draggedNoteFolderId))) {
      clearDragState();
    }
  }, [draggedNote, draggedNoteFolderId, draggedNoteId]);

  function clearDragState() {
    setDraggedNoteId(null);
    setDraggedNoteFolderId(null);
    setDropTarget(null);
    setDeleteTargetActive(false);
    props.onDraggedNoteChange(null);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, note: NoteSummary) {
    if (!canDragNotes) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    setDragPayload(event.dataTransfer, {
      kind: "note",
      id: note.id,
      folderId: note.folderId
    });
    setDraggedNoteId(note.id);
    setDraggedNoteFolderId(note.folderId);
    props.onDraggedNoteChange({
      id: note.id,
      title: getDisplayNoteTitle(note.title)
    });
  }

  function resolveDraggedNoteId(event: Pick<DragEvent<HTMLElement>, "dataTransfer">) {
    const payload = getDragPayload(event.dataTransfer);
    return payload?.kind === "note" ? payload.id : draggedNoteId;
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    const draggedId = resolveDraggedNoteId(event);
    if (!props.canReorder || !draggedId || draggedId === targetId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    setDeleteTargetActive(false);
    setDropTarget({ targetId, position });
  }

  function resolveNoteCardDropTarget(event: DragEvent<HTMLElement>, targetId: string) {
    const draggedId = resolveDraggedNoteId(event);
    if (!props.canReorder || !draggedId || draggedId === targetId) {
      return null;
    }

    return {
      targetId,
      position: resolveNoteCardDropPosition(event, targetId, draggedId)
    } satisfies NoteDropTarget;
  }

  function handleNoteCardDragOver(event: DragEvent<HTMLElement>, targetId: string) {
    const nextDropTarget = resolveNoteCardDropTarget(event, targetId);
    if (!nextDropTarget) {
      return;
    }

    handleDragOver(event, nextDropTarget.targetId, nextDropTarget.position);
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    const draggedId = resolveDraggedNoteId(event);

    if (!props.canReorder || !draggedId || draggedId === targetId) {
      clearDragState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    clearDragState();
    props.onMoveNote({
      draggedId,
      targetId,
      position
    });
  }

  function handleNoteCardDrop(event: DragEvent<HTMLElement>, targetId: string) {
    const nextDropTarget = dropTarget?.targetId === targetId ? dropTarget : resolveNoteCardDropTarget(event, targetId);
    if (!nextDropTarget) {
      clearDragState();
      return;
    }

    handleDrop(event, nextDropTarget.targetId, nextDropTarget.position);
  }

  function resolveNoteCardDropPosition(event: DragEvent<HTMLElement>, targetId: string, draggedId: string | null): NoteMovePosition {
    const fallbackPosition = resolveRelativeDropPosition(props.notes, targetId, draggedId);
    const rect = resolveNoteDropReferenceRect(event.currentTarget);
    if (rect.height <= 0) {
      return normalizeNoteCardDropPosition(props.notes, draggedId, targetId, fallbackPosition);
    }

    const relativeY = event.clientY - rect.top;
    const upperThreshold = rect.height * 0.35;
    const lowerThreshold = rect.height * 0.65;

    if (relativeY <= upperThreshold) {
      return normalizeNoteCardDropPosition(props.notes, draggedId, targetId, "before");
    }

    if (relativeY >= lowerThreshold) {
      return normalizeNoteCardDropPosition(props.notes, draggedId, targetId, "after");
    }

    return normalizeNoteCardDropPosition(props.notes, draggedId, targetId, fallbackPosition);
  }

  return (
    <section className="bb-pane-card bb-pane-card--notes">
      <div className={`bb-pane-card__header ${draggedNote ? "bb-pane-card__header--overlay" : "justify-end"}`}>
        {draggedNote ? (
          <button
            type="button"
            data-testid="notes-delete-target"
            aria-label="Delete note"
            title={`Drop ${getDisplayNoteTitle(draggedNote.title)} here to delete it`}
            onDragOver={(event) => {
              const payload = getDragPayload(event.dataTransfer);
              const draggedId = payload?.kind === "note" ? payload.id : draggedNoteId;
              if (!draggedId) {
                return;
              }

              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "move";
              }
              setDeleteTargetActive(true);
              setDropTarget(null);
            }}
            onDragLeave={() => setDeleteTargetActive(false)}
            onDrop={(event) => {
              const payload = getDragPayload(event.dataTransfer);
              const draggedId = payload?.kind === "note" ? payload.id : draggedNoteId;
              const noteToDelete = props.notes.find((note) => note.id === draggedId) ?? draggedNote;
              clearDragState();

              if (!draggedId || !noteToDelete) {
                return;
              }

              event.preventDefault();
              props.onRequestDeleteNote({
                id: noteToDelete.id,
                title: noteToDelete.title
              });
            }}
            className={`bb-pane-card__header-center-action bb-pane-card__header-center-action--lane bb-note-trash-target ${deleteTargetActive ? "is-active" : ""}`}
          >
            <Trash size={16} />
          </button>
        ) : (
          <div data-testid="notes-actions" className="bb-pane-card__header-actions bb-pane-card__header-actions--end">
            <button
              type="button"
              aria-label="New note"
              title={props.canCreateNote ? "New note" : "Select a notebook to create a note"}
              onClick={props.onCreateNote}
              disabled={!props.canCreateNote}
              className="bb-icon-button bb-icon-button--bare bb-icon-button--accent"
            >
              <Plus size={17} />
            </button>
            {props.onCollapse ? (
              <button
                type="button"
                aria-label="Collapse notes pane"
                onClick={props.onCollapse}
                className="bb-icon-button bb-icon-button--bare"
              >
                <CaretLeft size={16} />
              </button>
            ) : null}
          </div>
        )}
      </div>
      <label className="bb-search-shell bb-search-shell--plain">
        <MagnifyingGlass size={16} className="text-[color:var(--ink-soft)]" />
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Search notes"
          className="text-sm"
        />
      </label>
      <div className="bb-note-list">
        {props.loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : props.notes.length === 0 ? (
          <div className="bb-empty-state text-sm leading-relaxed">
            {props.notebookName ? "No notes yet." : "No notes match this view."}
          </div>
        ) : (
          props.notes.map((note) =>
            renderNote(note, {
              canDragNotes,
              canReorder: props.canReorder,
              draggedNoteId,
              dragging,
              dropTarget,
              onDragEnd: clearDragState,
              onCardDragOver: handleNoteCardDragOver,
              onCardDrop: handleNoteCardDrop,
              onDragOver: handleDragOver,
              onDragStart: handleDragStart,
              onDrop: handleDrop,
              onSelectNote: props.onSelectNote,
              selectedNoteId: props.selectedNoteId
            })
          )
        )}
      </div>
    </section>
  );
}

function SkeletonCard() {
  return <div className="bb-skeleton bb-skeleton-card" />;
}

function formatPreviewExcerpt(excerpt: string) {
  const cleaned = excerpt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= NOTE_PREVIEW_EXCERPT_LIMIT) {
    return cleaned;
  }
  return `${cleaned.slice(0, NOTE_PREVIEW_EXCERPT_LIMIT).trimEnd()}...`;
}

function renderNote(
  note: NoteSummary,
  helpers: {
    canDragNotes: boolean;
    canReorder: boolean;
    draggedNoteId: string | null;
    dragging: boolean;
    dropTarget: NoteDropTarget | null;
    onDragEnd(): void;
    onCardDragOver(event: DragEvent<HTMLElement>, targetId: string): void;
    onCardDrop(event: DragEvent<HTMLElement>, targetId: string): void;
    onDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition): void;
    onDragStart(event: DragEvent<HTMLElement>, note: NoteSummary): void;
    onDrop(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition): void;
    onSelectNote(noteId: string): void;
    selectedNoteId: string | null;
  }
) {
  const selected = helpers.selectedNoteId === note.id;
  const dropPosition = helpers.canReorder && helpers.dropTarget?.targetId === note.id ? helpers.dropTarget.position : null;
  const draggingSource = helpers.draggedNoteId === note.id;
  const previewExcerpt = formatPreviewExcerpt(note.excerpt);
  const displayTitle = getDisplayNoteTitle(note.title);
  const noteCard = (
    <div
      role="button"
      tabIndex={0}
      draggable={helpers.canDragNotes}
      data-testid={buildNoteTestId("drag", note.title)}
      onDragStart={(event) => helpers.onDragStart(event, note)}
      onDragEnd={helpers.onDragEnd}
      onDragEnter={helpers.canReorder ? (event) => helpers.onCardDragOver(event, note.id) : undefined}
      onDragOver={helpers.canReorder ? (event) => helpers.onCardDragOver(event, note.id) : undefined}
      onDrop={helpers.canReorder ? (event) => helpers.onCardDrop(event, note.id) : undefined}
      onClick={() => helpers.onSelectNote(note.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          helpers.onSelectNote(note.id);
        }
      }}
      className={`bb-note-card ${helpers.canDragNotes ? "bb-note-card--draggable" : ""} w-full text-left ${selected ? "is-active" : ""} ${
        dropPosition ? "bb-tree-drop-target" : ""
      } ${dropPosition ? `bb-note-card--drop-${dropPosition}` : ""} ${draggingSource ? "bb-note-card--dragging" : ""}`}
    >
      <div className="bb-note-card__layout">
        <div className="bb-note-card__copy">
          <p className="bb-note-card__title">{displayTitle}</p>
          <p className="bb-note-card__excerpt">
            {previewExcerpt || "Empty note"}
          </p>
        </div>
      </div>
    </div>
  );

  if (!helpers.canDragNotes) {
    return <div key={note.id} className="min-w-0">{noteCard}</div>;
  }

  return (
    <div
      key={note.id}
      data-testid={buildNoteTestId("slot", note.title)}
      className={`bb-note-drop-slot min-w-0 space-y-0.5 ${dropPosition ? `is-drop-${dropPosition}` : ""}`}
      onDragEnter={helpers.canReorder ? (event) => helpers.onCardDragOver(event, note.id) : undefined}
      onDragOver={helpers.canReorder ? (event) => helpers.onCardDragOver(event, note.id) : undefined}
      onDrop={helpers.canReorder ? (event) => helpers.onCardDrop(event, note.id) : undefined}
    >
      {helpers.canReorder ? (
        <NoteDropZone
          testId={buildNoteTestId("before", note.title)}
          noteId={note.id}
          position="before"
          active={helpers.dropTarget?.targetId === note.id && helpers.dropTarget.position === "before"}
          dragging={helpers.dragging && helpers.draggedNoteId !== note.id}
          onDragOver={helpers.onDragOver}
          onDrop={helpers.onDrop}
        />
      ) : null}
      <div className="min-w-0 rounded-[1.15rem]">
        {noteCard}
      </div>
      {helpers.canReorder ? (
        <NoteDropZone
          testId={buildNoteTestId("after", note.title)}
          noteId={note.id}
          position="after"
          active={helpers.dropTarget?.targetId === note.id && helpers.dropTarget.position === "after"}
          dragging={helpers.dragging && helpers.draggedNoteId !== note.id}
          onDragOver={helpers.onDragOver}
          onDrop={helpers.onDrop}
        />
      ) : null}
    </div>
  );
}

function NoteDropZone(props: {
  testId: string;
  noteId: string;
  position: NoteMovePosition;
  active: boolean;
  dragging: boolean;
  onDragOver(event: DragEvent<HTMLElement>, noteId: string, position: NoteMovePosition): void;
  onDrop(event: DragEvent<HTMLElement>, noteId: string, position: NoteMovePosition): void;
}) {
  return (
    <div
      data-testid={props.testId}
      onDragEnter={(event) => props.onDragOver(event, props.noteId, props.position)}
      onDragOver={(event) => props.onDragOver(event, props.noteId, props.position)}
      onDrop={(event) => props.onDrop(event, props.noteId, props.position)}
      className={`bb-dropzone bb-dropzone--note ${props.dragging ? "is-visible" : ""} ${props.active ? "is-active" : ""}`}
    />
  );
}

function buildNoteTestId(kind: "drag" | "slot" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}

function resolveNoteDropReferenceRect(currentTarget: EventTarget | null) {
  if (!(currentTarget instanceof HTMLElement)) {
    return EMPTY_DOM_RECT;
  }

  if (currentTarget.classList.contains("bb-note-drop-slot")) {
    const card = currentTarget.querySelector<HTMLElement>(".bb-note-card");
    if (card) {
      return card.getBoundingClientRect();
    }
  }

  return currentTarget.getBoundingClientRect();
}

function getDisplayNoteTitle(title: string) {
  const trimmedTitle = title.trim();
  return trimmedTitle || "Untitled note";
}

function resolveRelativeDropPosition(notes: NoteSummary[], targetId: string, draggedId: string | null): NoteMovePosition {
  const targetIndex = notes.findIndex((note) => note.id === targetId);
  const draggedIndex = draggedId ? notes.findIndex((note) => note.id === draggedId) : -1;

  if (targetIndex < 0 || draggedIndex < 0) {
    return "before";
  }

  return draggedIndex > targetIndex ? "before" : "after";
}

function normalizeNoteCardDropPosition(
  notes: NoteSummary[],
  draggedId: string | null,
  targetId: string,
  position: NoteMovePosition
): NoteMovePosition {
  if (!draggedId || wouldCardDropReorder(notes, draggedId, targetId, position)) {
    return position;
  }

  return position === "before" ? "after" : "before";
}

function wouldCardDropReorder(notes: NoteSummary[], draggedId: string, targetId: string, position: NoteMovePosition) {
  const draggedIndex = notes.findIndex((note) => note.id === draggedId);
  const targetIndex = notes.findIndex((note) => note.id === targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return false;
  }

  if (position === "before") {
    return draggedIndex !== targetIndex - 1;
  }

  return draggedIndex !== targetIndex + 1;
}

const EMPTY_DOM_RECT = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  toJSON() {
    return {};
  }
} as DOMRect;
