import { CaretDown, CaretLeft, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import type { FolderNode } from "../api/types";
import { buttonPrimary, buttonSecondary } from "./buttonStyles";

export function FolderTree(props: {
  folders: FolderNode[];
  selectedFolderId: string | null;
  pendingName: string;
  onPendingNameChange(value: string): void;
  onCreateNotebook(parentId: string | null): void;
  onSelectFolder(folderId: string): void;
  onClearSelection(): void;
  onCollapse?(): void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/88 p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notebooks</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">{props.folders.length}</span>
          {props.onCollapse ? (
            <button
              type="button"
              aria-label="Collapse notebooks pane"
              onClick={props.onCollapse}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-900 active:translate-y-0"
            >
              <CaretLeft size={16} />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        <input
          value={props.pendingName}
          onChange={(event) => props.onPendingNameChange(event.target.value)}
          placeholder="Notebook name"
          className="w-full rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => props.onCreateNotebook(null)} className={buttonPrimary}>
            <FolderSimplePlus size={18} />
            New notebook
          </button>
          <button
            type="button"
            onClick={() => props.onCreateNotebook(props.selectedFolderId)}
            disabled={!props.selectedFolderId}
            className={buttonSecondary}
          >
            <CaretDown size={18} />
            Sub-notebook
          </button>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={props.onClearSelection}
          className={`flex w-full items-center gap-3 rounded-[1.2rem] px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            props.selectedFolderId === null
              ? "bg-slate-950 text-white"
              : "bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:bg-white"
          }`}
        >
          <FolderSimple size={18} className={props.selectedFolderId === null ? "text-emerald-300" : "text-slate-400"} />
          <span className="flex-1 truncate">All notes</span>
        </button>
        {props.folders.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">No notebooks yet.</div>
        ) : (
          props.folders.map((folder) => {
            const depth = folder.path.split(" / ").length - 1;
            const selected = props.selectedFolderId === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => props.onSelectFolder(folder.id)}
                className={`flex w-full items-center gap-3 rounded-[1.2rem] px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  selected ? "bg-slate-950 text-white" : "bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:bg-white"
                }`}
                style={{ paddingLeft: `${16 + depth * 18}px` }}
              >
                <CaretDown size={14} weight="bold" className={selected ? "text-emerald-300" : "text-slate-400"} />
                <FolderSimple size={18} />
                <span className="flex-1 truncate">{folder.name}</span>
                <span className={`text-xs ${selected ? "text-slate-300" : "text-slate-400"}`}>{folder.noteCount}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
