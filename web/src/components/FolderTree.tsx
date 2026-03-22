import { CaretDown, FolderSimplePlus, FolderSimple } from "@phosphor-icons/react";
import type { FolderNode } from "../api/types";

export function FolderTree(props: {
  folders: FolderNode[];
  selectedFolderId: string | null;
  pendingName: string;
  onPendingNameChange(value: string): void;
  onCreateFolder(): void;
  onSelectFolder(folderId: string): void;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Folders</p>
          <p className="mt-2 text-sm text-slate-600">One note belongs to one notebook at a time.</p>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <input
          value={props.pendingName}
          onChange={(event) => props.onPendingNameChange(event.target.value)}
          placeholder="New folder"
          className="w-full rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
        />
        <button
          type="button"
          onClick={props.onCreateFolder}
          aria-label="Create folder"
          className="inline-flex items-center gap-2 rounded-[1.1rem] bg-emerald-700 px-4 py-3 text-sm font-medium text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-emerald-600 active:translate-y-0 active:scale-[0.98]"
        >
          <FolderSimplePlus size={18} />
        </button>
      </div>
      <div className="mt-5 space-y-2">
        {props.folders.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            Your first folder will appear here.
          </div>
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
