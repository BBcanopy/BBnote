import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { createExportJob, downloadExport } from "../api/client";
import type { ExportJob } from "../api/types";
import { useAuth } from "../auth/AuthProvider";

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
    <section className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Exports</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Take everything out as Markdown</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-slate-600">
          Export jobs package your notes into nested folders with YAML front matter and relative asset paths.
        </p>
        <button
          type="button"
          onClick={() => void handleCreateExport()}
          disabled={busy}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]"
        >
          <DownloadSimple size={18} />
          {busy ? "Building export" : "Export all notes"}
        </button>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
      <div className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-6 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Latest job</p>
        {job ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/70 px-4 py-4">
              <p className="text-sm font-medium text-slate-900">Status: {job.status}</p>
              <p className="mt-2 text-sm text-slate-600">Notes: {job.summary.noteCount}</p>
              <p className="text-sm text-slate-600">Folders: {job.summary.folderCount}</p>
              <p className="text-sm text-slate-600">Attachments: {job.summary.attachmentCount}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]"
            >
              <DownloadSimple size={18} />
              Download ZIP
            </button>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-slate-500">No export has been generated in this session yet.</p>
        )}
      </div>
    </section>
  );
}
