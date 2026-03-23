import { CaretLeft, DotsSixVertical, MagnifyingGlass, NotePencil, Plus } from "@phosphor-icons/react";
import { useEffect, useState, type DragEvent } from "react";
import type { NoteSummary } from "../api/types";
import type { NoteMoveInstruction, NoteMovePosition } from "../utils/noteOrder";

const NOTE_PREVIEW_EXCERPT_LIMIT = 54;

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
  onCollapse?(): void;
  loading: boolean;
  notebookName: string | null;
  canReorder: boolean;
  onMoveNote(move: NoteMoveInstruction): void;
}) {
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<NoteDropTarget | null>(null);
  const dragging = props.canReorder && draggedNoteId !== null;

  useEffect(() => {
    if (!props.canReorder) {
      setDraggedNoteId(null);
      setDropTarget(null);
    }
  }, [props.canReorder]);

  function clearDragState() {
    setDraggedNoteId(null);
    setDropTarget(null);
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, noteId: string) {
    if (!props.canReorder) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", noteId);
    setDraggedNoteId(noteId);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    if (!props.canReorder || !draggedNoteId || draggedNoteId === targetId) {
      return;
    }

    event.preventDefault();
    setDropTarget({ targetId, position });
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition) {
    if (!props.canReorder) {
      return;
    }

    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggedNoteId;
    clearDragState();

    if (!draggedId || draggedId === targetId) {
      return;
    }

    props.onMoveNote({
      draggedId,
      targetId,
      position
    });
  }

  return (
    <section className="bb-pane-card">
      <div className="bb-pane-card__header justify-end">
        <div data-testid="notes-actions" className="flex items-center gap-2">
          <button
            type="button"
            aria-label="New note"
            title="New note"
            onClick={props.onCreateNote}
            className="bb-icon-button bb-icon-button--accent"
          >
            <Plus size={17} />
          </button>
          {props.onCollapse ? (
            <button
              type="button"
              aria-label="Collapse notes pane"
              onClick={props.onCollapse}
              className="bb-icon-button"
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
      <div className="space-y-2">
        {props.loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : props.notes.length === 0 ? (
          <div className="bb-empty-state text-sm leading-relaxed">
            No notes yet.
          </div>
        ) : (
          props.notes.map((note) => renderNote(note, {
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
          }))
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
    canReorder: boolean;
    draggedNoteId: string | null;
    dragging: boolean;
    dropTarget: NoteDropTarget | null;
    onDragEnd(): void;
    onDragOver(event: DragEvent<HTMLElement>, targetId: string, position: NoteMovePosition): void;
    onDragStart(event: DragEvent<HTMLDivElement>, noteId: string): void;
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
      className={`bb-note-card w-full px-3.5 py-3 text-left ${selected ? "is-active" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight">{note.title}</p>
          <p className={`mt-1 overflow-hidden break-words text-[13px] leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${selected ? "text-white/72" : "text-[color:var(--ink-soft)]"}`}>
            {previewExcerpt || "Empty note"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {helpers.canReorder ? (
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

  if (!helpers.canReorder) {
    return <div key={note.id}>{noteCard}</div>;
  }

  return (
    <div key={note.id} className="space-y-1">
      <NoteDropZone
        testId={buildNoteTestId("before", note.title)}
        noteId={note.id}
        position="before"
        active={helpers.dropTarget?.targetId === note.id && helpers.dropTarget.position === "before"}
        dragging={helpers.dragging && helpers.draggedNoteId !== note.id}
        onDragOver={helpers.onDragOver}
        onDrop={helpers.onDrop}
      />
      <div
        draggable
        data-testid={buildNoteTestId("drag", note.title)}
        onDragStart={(event) => helpers.onDragStart(event, note.id)}
        onDragEnd={helpers.onDragEnd}
        className={helpers.dropTarget?.targetId === note.id ? "bb-tree-drop-target rounded-[1.15rem]" : "rounded-[1.15rem]"}
      >
        {noteCard}
      </div>
      <NoteDropZone
        testId={buildNoteTestId("after", note.title)}
        noteId={note.id}
        position="after"
        active={helpers.dropTarget?.targetId === note.id && helpers.dropTarget.position === "after"}
        dragging={helpers.dragging && helpers.draggedNoteId !== note.id}
        onDragOver={helpers.onDragOver}
        onDrop={helpers.onDrop}
      />
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
