import { ArrowRight, NotePencil, SignIn } from "@phosphor-icons/react";

export function AuthSplash(props: { onLogin(): void; busy: boolean }) {
  return (
    <section className="grid min-h-[100dvh] items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6 rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.35)]">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-700">OIDC only</p>
        <h1 className="max-w-[12ch] text-5xl font-semibold tracking-tight text-slate-950 md:text-6xl">
          Notes that stay calm on screen and readable on disk.
        </h1>
        <p className="max-w-[60ch] text-base leading-relaxed text-slate-600">
          BBNote keeps markdown bodies in files, keeps metadata in SQLite, and stays simple enough to run in one
          container.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onLogin}
            disabled={props.busy}
            className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-medium text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-emerald-600 active:translate-y-0 active:scale-[0.98]"
          >
            <SignIn size={18} weight="bold" />
            {props.busy ? "Preparing sign-in" : "Sign in with OIDC"}
          </button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr] md:grid-rows-[1fr_1fr]">
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Storage</p>
              <p className="mt-3 text-lg font-medium tracking-tight text-slate-900">Markdown files plus SQLite</p>
            </div>
            <NotePencil size={24} className="text-emerald-700" />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Human-readable note paths, notebook-aware directories, and a consistency checker for the file and DB split.
          </p>
        </div>
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)] md:row-span-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Interoperability</p>
          <div className="mt-6 space-y-4">
            {[
              "Import OneNote archives",
              "Import Synology Note Station exports",
              "Export portable Markdown bundles"
            ].map((item) => (
              <div
                key={item}
                className="flex items-center justify-between rounded-[1.5rem] border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px]"
              >
                <span>{item}</span>
                <ArrowRight size={18} className="text-emerald-700" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Deployment</p>
          <p className="mt-3 text-lg font-medium tracking-tight text-slate-900">Single-node Docker Compose</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">A web app, server, SQLite database, and file storage without extra moving parts.</p>
        </div>
      </div>
    </section>
  );
}

