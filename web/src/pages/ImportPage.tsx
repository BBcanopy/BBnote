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
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
      <div className="bb-overview-card">
        <p className="bb-eyebrow">Imports</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--ink)] md:text-4xl">Bring notes in from existing tools</h1>
        <p className="max-w-[60ch] text-sm leading-relaxed text-[color:var(--ink-soft)]">
          Upload a OneNote archive or a Synology Note Station export and BBNote will create a new top-level notebook subtree for it.
        </p>
        <div className="grid gap-4">
          <label className="bb-field">
            <span className="bb-field__label">Source</span>
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as "onenote" | "synology_note_station")}
              className="bb-select"
            >
              <option value="onenote">OneNote</option>
              <option value="synology_note_station">Synology Note Station</option>
            </select>
          </label>
          <label className="bb-field">
            <span className="bb-field__label">Archive</span>
            <input
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="bb-file-input"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={!file || busy}
          className={buttonPrimary}
        >
          <UploadSimple size={18} />
          {busy ? "Importing archive" : "Start import"}
        </button>
        {error ? <p className="bb-inline-error">{error}</p> : null}
      </div>
      <div className="bb-job-card">
        <p className="bb-eyebrow">Latest job</p>
        {job ? (
          <div className="space-y-4">
            <div className="bb-summary-card px-4 py-4">
              <p className="text-sm font-medium text-[color:var(--ink)]">Status: {job.status}</p>
              <p className="mt-2 text-sm text-[color:var(--ink-soft)]">Created notes: {job.createdCount}</p>
              <p className="text-sm text-[color:var(--ink-soft)]">Warnings: {job.warningCount}</p>
            </div>
            {job.warnings.length > 0 ? (
              <ul
                className="space-y-2 rounded-[1.2rem] border px-4 py-4 text-sm text-[color:var(--danger)]"
                style={{
                  borderColor: "color-mix(in srgb, var(--danger) 22%, var(--line))",
                  background: "color-mix(in srgb, var(--danger) 8%, transparent)"
                }}
              >
                {job.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-[color:var(--ink-soft)]">No import has been started in this session yet.</p>
        )}
      </div>
    </section>
  );
}
