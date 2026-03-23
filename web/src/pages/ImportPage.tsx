import { UploadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { createImportJob } from "../api/client";
import type { ImportJob } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { buttonPrimary } from "../components/buttonStyles";

export function ImportPage() {
  const auth = useAuth();
  const [source, setSource] = useState<"onenote" | "synology_note_station">("onenote");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!auth.user || !file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const createdJob = await createImportJob(source, file);
      setJob(createdJob);
    } catch (importError) {
      setError(String(importError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Imports</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Bring notes in from existing tools</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-slate-600">
          Upload a OneNote archive or a Synology Note Station export and BBNote will create a new top-level notebook subtree for it.
        </p>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-2 text-sm text-slate-700">
            Source
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as "onenote" | "synology_note_station")}
              className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
            >
              <option value="onenote">OneNote</option>
              <option value="synology_note_station">Synology Note Station</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            Archive
            <input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={!file || busy}
          className={`mt-6 ${buttonPrimary}`}
        >
          <UploadSimple size={18} />
          {busy ? "Importing archive" : "Start import"}
        </button>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest job</p>
        {job ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
              <p className="text-sm font-medium text-slate-900">Status: {job.status}</p>
              <p className="mt-2 text-sm text-slate-600">Created notes: {job.createdCount}</p>
              <p className="text-sm text-slate-600">Warnings: {job.warningCount}</p>
            </div>
            {job.warnings.length > 0 ? (
              <ul className="space-y-2 rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                {job.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-slate-500">No import has been started in this session yet.</p>
        )}
      </div>
    </section>
  );
}
