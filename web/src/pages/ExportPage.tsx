import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { createExportJob, downloadExport } from "../api/client";
import type { ExportJob } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { buttonPrimary, buttonSecondary } from "../components/buttonStyles";

export function ExportPage() {
  const auth = useAuth();
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateExport() {
    if (!auth.user) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const createdJob = await createExportJob();
      setJob(createdJob);
    } catch (exportError) {
      setError(String(exportError));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!auth.user || !job) {
      return;
    }
    const blob = await downloadExport(job.id);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${job.id}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
      <div className="bb-overview-card">
        <p className="bb-eyebrow">Exports</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[color:var(--ink)] md:text-4xl">Take everything out as Markdown</h1>
        <p className="max-w-[60ch] text-sm leading-relaxed text-[color:var(--ink-soft)]">
          Export jobs package your notes into nested notebooks with YAML front matter and relative asset paths.
        </p>
        <button
          type="button"
          onClick={() => void handleCreateExport()}
          disabled={busy}
          className={buttonPrimary}
        >
          <DownloadSimple size={18} />
          {busy ? "Building export" : "Export all notes"}
        </button>
        {error ? <p className="bb-inline-error">{error}</p> : null}
      </div>
      <div className="bb-job-card">
        <p className="bb-eyebrow">Latest job</p>
        {job ? (
          <div className="space-y-4">
            <div className="bb-summary-card px-4 py-4">
              <p className="text-sm font-medium text-[color:var(--ink)]">Status: {job.status}</p>
              <p className="mt-2 text-sm text-[color:var(--ink-soft)]">Notes: {job.summary.noteCount}</p>
              <p className="text-sm text-[color:var(--ink-soft)]">Notebooks: {job.summary.folderCount}</p>
              <p className="text-sm text-[color:var(--ink-soft)]">Attachments: {job.summary.attachmentCount}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className={buttonSecondary}
            >
              <DownloadSimple size={18} />
              Download ZIP
            </button>
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-[color:var(--ink-soft)]">No export has been generated in this session yet.</p>
        )}
      </div>
    </section>
  );
}
