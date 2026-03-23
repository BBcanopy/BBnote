import { CaretDown, CaretLeft, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { FolderNode } from "../api/types";
import type { FolderMoveInstruction, FolderMovePosition } from "../utils/folderTree";
import { buttonPrimary } from "./buttonStyles";

interface DropTarget {
  targetId: string;
  position: FolderMovePosition;
}

export function FolderTree(props: {
  folders: FolderNode[];
  selectedFolderId: string | null;
  pendingName: string;
  onPendingNameChange(value: string): void;
  onCreateNotebook(): void;
  onMoveNotebook(move: FolderMoveInstruction): void;
  onSelectFolder(folderId: string): void;
  onClearSelection(): void;
  onCollapse?(): void;
}) {
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragging = draggedFolderId !== null;

  function handleDragStart(event: DragEvent<HTMLDivElement>, folderId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", folderId);
    setDraggedFolderId(folderId);
  }

  function handleDragOver(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition) {
    event.preventDefault();
    if (!draggedFolderId || draggedFolderId === targetId) {
      return;
    }
    setDropTarget({ targetId, position });
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData("text/plain") || draggedFolderId;
    clearDragState();

    if (!draggedId || draggedId === targetId) {
      return;
    }

    props.onMoveNotebook({
      draggedId,
      targetId,
      position
    });
  }

  function clearDragState() {
    setDraggedFolderId(null);
    setDropTarget(null);
  }

  function handlePendingNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      props.onCreateNotebook();
    }
  }

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
            const insideDropActive = dropTarget?.targetId === folder.id && dropTarget.position === "inside";

            return (
              <div key={folder.id} className="space-y-1">
                <NotebookDropZone
                  testId={buildNotebookTestId("before", folder.name)}
                  folderId={folder.id}
                  depth={depth}
                  position="before"
                  active={dropTarget?.targetId === folder.id && dropTarget.position === "before"}
                  dragging={dragging && draggedFolderId !== folder.id}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />

                <div
                  draggable
                  data-testid={buildNotebookTestId("drag", folder.name)}
                  onDragStart={(event) => handleDragStart(event, folder.id)}
                  onDragEnd={clearDragState}
                  onDragOver={(event) => handleDragOver(event, folder.id, "inside")}
                  onDrop={(event) => handleDrop(event, folder.id, "inside")}
                  className={`rounded-[1.3rem] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    insideDropActive ? "bg-emerald-50/80 ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-white" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => props.onSelectFolder(folder.id)}
                    className={`flex w-full items-center gap-2.5 rounded-[1.2rem] px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      selected ? "bg-slate-950 text-white" : "bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:bg-white"
                    }`}
                    style={{ paddingLeft: `${18 + depth * 18}px` }}
                  >
                    <CaretDown size={14} weight="bold" className={selected ? "text-emerald-300" : "text-slate-400"} />
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] border ${
                      selected ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-400"
                    }`}>
                      <FolderSimple size={18} />
                    </span>
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className={`text-xs ${selected ? "text-slate-300" : "text-slate-400"}`}>{folder.noteCount}</span>
                  </button>
                </div>

                <NotebookDropZone
                  testId={buildNotebookTestId("after", folder.name)}
                  folderId={folder.id}
                  depth={depth}
                  position="after"
                  active={dropTarget?.targetId === folder.id && dropTarget.position === "after"}
                  dragging={dragging && draggedFolderId !== folder.id}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 grid gap-2 border-t border-slate-200/80 pt-5">
        <input
          value={props.pendingName}
          onChange={(event) => props.onPendingNameChange(event.target.value)}
          onKeyDown={handlePendingNameKeyDown}
          placeholder="Notebook name"
          className="w-full rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
        />
        <button type="button" onClick={props.onCreateNotebook} className={buttonPrimary}>
          <FolderSimplePlus size={18} />
          New notebook
        </button>
      </div>
    </section>
  );
}

function NotebookDropZone(props: {
  testId: string;
  folderId: string;
  depth: number;
  position: FolderMovePosition;
  active: boolean;
  dragging: boolean;
  onDragOver(event: DragEvent<HTMLElement>, folderId: string, position: FolderMovePosition): void;
  onDrop(event: DragEvent<HTMLElement>, folderId: string, position: FolderMovePosition): void;
}) {
  return (
    <div
      data-testid={props.testId}
      onDragOver={(event) => props.onDragOver(event, props.folderId, props.position)}
      onDrop={(event) => props.onDrop(event, props.folderId, props.position)}
      className={`rounded-full border transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        props.active
          ? "h-2 border-emerald-300 bg-emerald-100/80"
          : props.dragging
            ? "h-2 border-slate-200/80 bg-slate-100/70"
            : "h-1 border-transparent bg-transparent"
      }`}
      style={{ marginLeft: `${16 + props.depth * 18}px` }}
    />
  );
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}
