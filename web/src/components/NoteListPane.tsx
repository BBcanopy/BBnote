import { CaretLeft, MagnifyingGlass, NotePencil, Plus } from "@phosphor-icons/react";
import type { NoteSummary } from "../api/types";
import { buttonPrimary } from "./buttonStyles";

const NOTE_PREVIEW_EXCERPT_LIMIT = 72;

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
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/88 p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</p>
          <p className="mt-2 text-sm font-medium tracking-tight text-slate-900">{props.notebookName ?? "All notes"}</p>
        </div>
        <div className="flex items-center gap-2">
          {props.onCollapse ? (
            <button
              type="button"
              aria-label="Collapse notes pane"
              onClick={props.onCollapse}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-900 active:translate-y-0"
            >
              <CaretLeft size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={props.onCreateNote}
            className={buttonPrimary}
          >
            <Plus size={18} />
            New note
          </button>
        </div>
      </div>
      <label className="mt-5 flex items-center gap-3 rounded-[1.3rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
        <MagnifyingGlass size={18} className="text-slate-400" />
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>
      <div className="mt-5 space-y-3">
        {props.loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : props.notes.length === 0 ? (
          <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm leading-relaxed text-slate-500">
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
                className={`w-full rounded-[1.4rem] border px-4 py-4 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  selected
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium tracking-tight">{note.title}</p>
                    <p
                      className={`mt-2 overflow-hidden break-words text-sm leading-relaxed [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] ${
                        selected ? "text-slate-300" : "text-slate-500"
                      }`}
                    >
                      {previewExcerpt || "Empty note"}
                    </p>
                  </div>
                  <NotePencil size={18} className={`shrink-0 ${selected ? "text-emerald-300" : "text-slate-400"}`} />
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
  return <div className="h-24 animate-pulse rounded-[1.4rem] border border-slate-200 bg-slate-100/80" />;
}

function formatPreviewExcerpt(excerpt: string) {
  const cleaned = excerpt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= NOTE_PREVIEW_EXCERPT_LIMIT) {
    return cleaned;
  }
  return `${cleaned.slice(0, NOTE_PREVIEW_EXCERPT_LIMIT).trimEnd()}...`;
}
