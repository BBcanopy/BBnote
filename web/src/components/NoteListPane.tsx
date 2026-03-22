import { MagnifyingGlass, NotePencil, Plus } from "@phosphor-icons/react";
import type { NoteSummary } from "../api/types";

export function NoteListPane(props: {
  notes: NoteSummary[];
  search: string;
  onSearchChange(value: string): void;
  selectedNoteId: string | null;
  onSelectNote(noteId: string): void;
  onCreateNote(): void;
  loading: boolean;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</p>
          <p className="mt-2 text-sm text-slate-600">Search runs through titles and markdown body text.</p>
        </div>
        <button
          type="button"
          onClick={props.onCreateNote}
          className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]"
        >
          <Plus size={18} />
          New note
        </button>
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
            No notes match this folder and search combination yet.
          </div>
        ) : (
          props.notes.map((note) => {
            const selected = props.selectedNoteId === note.id;
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
                  <div>
                    <p className="font-medium tracking-tight">{note.title}</p>
                    <p className={`mt-2 text-sm leading-relaxed ${selected ? "text-slate-300" : "text-slate-500"}`}>
                      {note.excerpt || "Empty note"}
                    </p>
                  </div>
                  <NotePencil size={18} className={selected ? "text-emerald-300" : "text-slate-400"} />
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

