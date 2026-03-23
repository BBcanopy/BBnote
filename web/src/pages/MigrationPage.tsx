import { ArrowsClockwise, DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { createExportJob, createImportJob, downloadExport } from "../api/client";
import type { ExportJob, ImportJob } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { buttonPrimary, buttonSecondary } from "../components/buttonStyles";

const IMPORT_SOURCES = [
  { value: "onenote", label: "OneNote" },
  { value: "synology_note_station", label: "Synology Note Station" }
] as const;

type ImportSource = (typeof IMPORT_SOURCES)[number]["value"];

export function MigrationPage() {
  const auth = useAuth();
  const [source, setSource] = useState<ImportSource>("onenote");
  const [file, setFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [importJob, setImportJob] = useState<ImportJob | null>(null);
  const [exportJob, setExportJob] = useState<ExportJob | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleImport() {
    if (!auth.user || !file) {
      return;
    }

    setImportBusy(true);
    setImportError(null);
    try {
      const createdJob = await createImportJob(source, file);
      setImportJob(createdJob);
    } catch (error) {
      setImportError(String(error));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleCreateExport() {
    if (!auth.user) {
      return;
    }

    setExportBusy(true);
    setExportError(null);
    try {
      const createdJob = await createExportJob();
      setExportJob(createdJob);
    } catch (error) {
      setExportError(String(error));
    } finally {
      setExportBusy(false);
    }
  }

  async function handleDownload() {
    if (!auth.user || !exportJob) {
      return;
    }

    const blob = await downloadExport(exportJob.id);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${exportJob.id}.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  return (
    <section className="bb-migration-layout">
      <header className="bb-migration-hero">
        <div className="bb-migration-hero__copy">
          <p className="bb-eyebrow">Migration</p>
          <h1 className="bb-migration-hero__title">Bring notes in, package everything out.</h1>
          <p className="bb-migration-hero__body">
            Move an archive in from another tool or generate a clean Markdown bundle for handoff, backup, or a fresh start.
          </p>
        </div>
        <div className="bb-migration-hero__stats" aria-label="Migration capabilities">
          <MigrationStat label="Sources" value="OneNote + Synology" />
          <MigrationStat label="Export format" value="Markdown bundle" />
          <MigrationStat label="Attachments" value="Included" />
        </div>
      </header>

      <div className="bb-migration-grid">
        <article className="bb-migration-card">
          <div className="bb-migration-card__header">
            <span className="bb-migration-card__icon">
              <UploadSimple size={18} weight="bold" />
            </span>
            <div className="bb-migration-card__copy">
              <p className="bb-eyebrow">Import</p>
              <h2 className="bb-migration-card__title">Bring in an archive</h2>
              <p className="bb-migration-card__body">
                BBNote creates a new top-level notebook tree from the uploaded archive so the imported material stays grouped.
              </p>
            </div>
          </div>

          <div className="bb-migration-form">
            <label className="bb-field">
              <span className="bb-field__label">Source</span>
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as ImportSource)}
                className="bb-select"
              >
                {IMPORT_SOURCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="bb-field">
              <span className="bb-field__label">Archive</span>
              <input
                type="file"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="bb-file-input"
              />
              <span className="bb-field__hint">
                {file ? `Ready to import: ${file.name}` : "Choose a ZIP archive from your previous notes app."}
              </span>
            </label>
          </div>

          <div className="bb-migration-card__actions">
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!file || importBusy}
              className={buttonPrimary}
            >
              <UploadSimple size={18} />
              {importBusy ? "Importing archive" : "Start import"}
            </button>
            {importError ? <p className="bb-inline-error">{importError}</p> : null}
          </div>

          <MigrationJobPanel
            testId="import-job-panel"
            eyebrow="Latest import"
            emptyText="No import has been started in this session yet."
          >
            {importJob ? (
              <div className="bb-migration-job-stack">
                <MigrationMetricRow label="Status" value={importJob.status} />
                <MigrationMetricRow label="Created notes" value={String(importJob.createdCount)} />
                <MigrationMetricRow label="Warnings" value={String(importJob.warningCount)} />
                {importJob.warnings.length > 0 ? (
                  <ul className="bb-migration-warning-list">
                    {importJob.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </MigrationJobPanel>
        </article>

        <article className="bb-migration-card">
          <div className="bb-migration-card__header">
            <span className="bb-migration-card__icon">
              <DownloadSimple size={18} weight="bold" />
            </span>
            <div className="bb-migration-card__copy">
              <p className="bb-eyebrow">Export</p>
              <h2 className="bb-migration-card__title">Create a Markdown bundle</h2>
              <p className="bb-migration-card__body">
                Generate a portable archive with nested notebooks, Markdown notes, YAML front matter, and relative attachment paths.
              </p>
            </div>
          </div>

          <div className="bb-migration-callout">
            <p className="bb-migration-callout__title">One-click handoff</p>
            <p className="bb-migration-callout__body">Build a ZIP when you need a backup, an export for another tool, or a clean archive for review.</p>
          </div>

          <div className="bb-migration-card__actions">
            <button
              type="button"
              onClick={() => void handleCreateExport()}
              disabled={exportBusy}
              className={buttonPrimary}
            >
              <DownloadSimple size={18} />
              {exportBusy ? "Building export" : "Export all notes"}
            </button>
            {exportError ? <p className="bb-inline-error">{exportError}</p> : null}
          </div>

          <MigrationJobPanel
            testId="export-job-panel"
            eyebrow="Latest export"
            emptyText="No export has been generated in this session yet."
          >
            {exportJob ? (
              <div className="bb-migration-job-stack">
                <MigrationMetricRow label="Status" value={exportJob.status} />
                <MigrationMetricRow label="Notes" value={String(exportJob.summary.noteCount)} />
                <MigrationMetricRow label="Notebooks" value={String(exportJob.summary.folderCount)} />
                <MigrationMetricRow label="Attachments" value={String(exportJob.summary.attachmentCount)} />
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className={buttonSecondary}
                >
                  <DownloadSimple size={18} />
                  Download ZIP
                </button>
              </div>
            ) : null}
          </MigrationJobPanel>
        </article>
      </div>
    </section>
  );
}

function MigrationStat(props: { label: string; value: string }) {
  return (
    <div className="bb-migration-stat">
      <span className="bb-migration-stat__label">{props.label}</span>
      <strong className="bb-migration-stat__value">{props.value}</strong>
    </div>
  );
}

function MigrationJobPanel(props: {
  testId: string;
  eyebrow: string;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <section data-testid={props.testId} className="bb-migration-job-panel">
      <div className="bb-migration-job-panel__header">
        <p className="bb-eyebrow">{props.eyebrow}</p>
        <ArrowsClockwise size={16} className="text-[color:var(--accent-strong)]" />
      </div>
      {props.children ? props.children : <div className="bb-empty-state text-sm leading-relaxed">{props.emptyText}</div>}
    </section>
  );
}

function MigrationMetricRow(props: { label: string; value: string }) {
  return (
    <div className="bb-migration-metric-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
