import { CaretLeft, DotsSixVertical, MagnifyingGlass, NotePencil, Plus, Trash } from "@phosphor-icons/react";
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

  function clearDragState() {
    setDraggedNoteId(null);
    setDropTarget(null);
    setDeleteTargetActive(false);
    props.onDraggedNoteChange(null);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, note: NoteSummary) {
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
    props.onDraggedNoteChange({
      id: note.id,
      title: note.title
    });
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    const payload = getDragPayload(event.dataTransfer);
    if (!props.canReorder || payload?.kind !== "note" || payload.id === targetId) {
      return;
    }

    event.preventDefault();
    setDropTarget({ targetId, position });
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    const payload = getDragPayload(event.dataTransfer);
    clearDragState();

    if (!props.canReorder || payload?.kind !== "note" || payload.id === targetId) {
      return;
    }

    event.preventDefault();
    props.onMoveNote({
      draggedId: payload.id,
      targetId,
      position
    });
  }

  return (
    <section className="bb-pane-card bb-pane-card--notes">
      <div className="bb-pane-card__header justify-end">
        <div data-testid="notes-actions" className="flex items-center gap-2">
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
          {draggedNote ? (
            <button
              type="button"
              data-testid="notes-delete-target"
              aria-label="Delete note"
              title={`Drop ${draggedNote.title} here to delete it`}
              onDragOver={(event) => {
                const payload = getDragPayload(event.dataTransfer);
                const draggedId = payload?.kind === "note" ? payload.id : draggedNoteId;
                if (!draggedId) {
                  return;
                }

                event.preventDefault();
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
              className={`bb-icon-button bb-icon-button--bare bb-icon-button--danger bb-note-trash-target ${deleteTargetActive ? "is-active" : ""}`}
            >
              <Trash size={16} />
            </button>
          ) : null}
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
      {!props.canCreateNote ? (
        <div className="bb-panel-note text-sm">
          Select or create a notebook to add a new note.
        </div>
      ) : null}
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
    onDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition): void;
    onDragStart(event: DragEvent<HTMLDivElement>, note: NoteSummary): void;
    onDrop(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition): void;
    onSelectNote(noteId: string): void;
    selectedNoteId: string | null;
  }
) {
  const selected = helpers.selectedNoteId === note.id;
  const previewExcerpt = formatPreviewExcerpt(note.excerpt);
  const noteCard = (
    <button
      type="button"
      onClick={() => helpers.onSelectNote(note.id)}
      className={`bb-note-card w-full text-left ${selected ? "is-active" : ""}`}
    >
      <div className="bb-note-card__layout">
        <div className="bb-note-card__copy">
          <p className="bb-note-card__title">{note.title}</p>
          <p className="bb-note-card__excerpt">
            {previewExcerpt || "Empty note"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {helpers.canDragNotes ? (
            <span className="bb-note-drag-handle" aria-hidden="true">
              <DotsSixVertical size={16} />
            </span>
          ) : null}
          <span className="bb-note-icon mt-0.5 shrink-0">
            <NotePencil size={16} />
          </span>
        </div>
      </div>
    </button>
  );

  if (!helpers.canDragNotes) {
    return <div key={note.id} className="min-w-0">{noteCard}</div>;
  }

  return (
    <div key={note.id} className="min-w-0 space-y-0.5">
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
      <div
        draggable
        data-testid={buildNoteTestId("drag", note.title)}
        onDragStart={(event) => helpers.onDragStart(event, note)}
        onDragEnd={helpers.onDragEnd}
        className={helpers.canReorder && helpers.dropTarget?.targetId === note.id ? "bb-tree-drop-target min-w-0 rounded-[1.15rem]" : "min-w-0 rounded-[1.15rem]"}
      >
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
      onDragOver={(event) => props.onDragOver(event, props.noteId, props.position)}
      onDrop={(event) => props.onDrop(event, props.noteId, props.position)}
      className={`bb-dropzone ${props.dragging ? "is-visible" : ""} ${props.active ? "is-active" : ""}`}
    />
  );
}

function buildNoteTestId(kind: "drag" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}
