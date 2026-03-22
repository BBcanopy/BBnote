export function NotesPage() {
  return (
    <section className="grid min-h-[100dvh] gap-6 md:grid-cols-[240px_320px_minmax(0,1fr)]">
      <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.18)]">
        <p className="text-xs uppercase tracking-[0.3em] text-emerald-700">Folders</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">BBNote</h1>
        <p className="mt-3 max-w-[28ch] text-sm leading-relaxed text-slate-600">
          Calm, notebook-first markdown notes with room for imports, exports, and attachments.
        </p>
      </div>
      <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.18)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notes</p>
        <div className="mt-6 space-y-4">
          <div className="h-20 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50" />
          <div className="h-20 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50" />
          <div className="h-20 rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50" />
        </div>
      </div>
      <div className="rounded-[2rem] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_40px_-20px_rgba(15,23,42,0.18)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Editor</p>
        <div className="mt-6 h-[60dvh] rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50" />
      </div>
    </section>
  );
}

