import { CaretLeft, MagnifyingGlass, NotePencil, Plus } from "@phosphor-icons/react";
import type { NoteSummary } from "../api/types";

const NOTE_PREVIEW_EXCERPT_LIMIT = 54;

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
}) {
  return (
    <section className="bb-pane-card">
      <div className="bb-pane-card__header">
        <div className="bb-panel-header__copy">
          <p className="bb-eyebrow">Notes</p>
          <p className="bb-panel-title">{props.notebookName ?? "All notes"}</p>
        </div>
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
      <label className="bb-search-shell">
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
          props.notes.map((note) => {
            const selected = props.selectedNoteId === note.id;
            const previewExcerpt = formatPreviewExcerpt(note.excerpt);
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => props.onSelectNote(note.id)}
                className={`bb-note-card w-full px-3.5 py-3 text-left ${selected ? "is-active" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium tracking-tight">{note.title}</p>
                    <p className={`mt-1.5 overflow-hidden break-words text-[13px] leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] ${selected ? "text-white/72" : "text-[color:var(--ink-soft)]"}`}>
                      {previewExcerpt || "Empty note"}
                    </p>
                  </div>
                  <span className="bb-note-icon mt-0.5 shrink-0">
                    <NotePencil size={16} />
                  </span>
                </div>
              </button>
            );
          })
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
