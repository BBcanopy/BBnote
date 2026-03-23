import { CaretDown, CaretLeft, FolderSimple, FolderSimplePlus, MagnifyingGlass, NotePencil, Plus } from "@phosphor-icons/react";
import { useMemo, useState, type DragEvent, type KeyboardEvent } from "react";
import type { FolderNode, NoteSummary } from "../api/types";
import type { FolderMoveInstruction, FolderMovePosition } from "../utils/folderTree";
import { buttonPrimary } from "./buttonStyles";

const NOTE_TREE_EXCERPT_LIMIT = 52;

interface DropTarget {
  targetId: string;
  position: FolderMovePosition;
}

export function NotebookTreePane(props: {
  folders: FolderNode[];
  notes: NoteSummary[];
  search: string;
  selectedFolderId: string | null;
  selectedNoteId: string | null;
  pendingName: string;
  loading: boolean;
  onSearchChange(value: string): void;
  onPendingNameChange(value: string): void;
  onCreateNotebook(): void;
  onCreateNote(): void;
  onMoveNotebook(move: FolderMoveInstruction): void;
  onSelectFolder(folderId: string | null): void;
  onSelectNote(noteId: string, folderId: string): void;
  onCollapse?(): void;
}) {
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dragging = draggedFolderId !== null;
  const normalizedSearch = props.search.trim().toLowerCase();

  const notesByFolder = useMemo(() => {
    const grouped = new Map<string, NoteSummary[]>();
    for (const note of props.notes) {
      const bucket = grouped.get(note.folderId) ?? [];
      bucket.push(note);
      grouped.set(note.folderId, bucket);
    }
    return grouped;
  }, [props.notes]);

  const visibleFolderIds = useMemo(() => {
    if (!normalizedSearch) {
      return new Set(props.folders.map((folder) => folder.id));
    }

    const byId = new Map(props.folders.map((folder) => [folder.id, folder]));
    const visible = new Set<string>();

    for (const folder of props.folders) {
      const folderMatches = folder.name.toLowerCase().includes(normalizedSearch);
      const noteMatches = (notesByFolder.get(folder.id) ?? []).length > 0;
      if (!folderMatches && !noteMatches) {
        continue;
      }

      let current: FolderNode | undefined = folder;
      while (current) {
        visible.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }

    return visible;
  }, [props.folders, notesByFolder, normalizedSearch]);

  const visibleFolders = useMemo(
    () => props.folders.filter((folder) => visibleFolderIds.has(folder.id)),
    [props.folders, visibleFolderIds]
  );

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notebooks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="New notebook"
            title="New notebook"
            onClick={props.onCreateNotebook}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-emerald-300 hover:text-emerald-700 active:translate-y-0"
          >
            <FolderSimplePlus size={17} />
          </button>
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
          <button type="button" onClick={props.onCreateNote} className={buttonPrimary}>
            <Plus size={18} />
            New note
          </button>
        </div>
      </div>

      <label className="mt-5 flex items-center gap-3 rounded-[1.3rem] border border-slate-200 bg-slate-50/70 px-4 py-3">
        <MagnifyingGlass size={18} className="text-slate-400" />
        <input
          value={props.search}
          onChange={(event) => props.onSearchChange(event.target.value)}
          placeholder="Search notes"
          className="w-full bg-transparent text-sm outline-none"
        />
      </label>

      <div className="mt-5 space-y-2">
        {props.loading ? (
          <>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </>
        ) : props.folders.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            No notebooks yet.
          </div>
        ) : visibleFolders.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
            No matching notes.
          </div>
        ) : (
          visibleFolders.map((folder) => {
            const depth = folder.path.split(" / ").length - 1;
            const folderSelected = props.selectedFolderId === folder.id;
            const insideDropActive = dropTarget?.targetId === folder.id && dropTarget.position === "inside";
            const folderNotes = notesByFolder.get(folder.id) ?? [];

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
                    onClick={() => props.onSelectFolder(folderSelected ? null : folder.id)}
                    className={`flex w-full items-center gap-2.5 rounded-[1.2rem] px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      folderSelected ? "bg-slate-950 text-white" : "bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:bg-white"
                    }`}
                    style={{ paddingLeft: `${18 + depth * 18}px` }}
                  >
                    <CaretDown size={14} weight="bold" className={folderSelected ? "text-emerald-300" : "text-slate-400"} />
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[1rem] border ${
                      folderSelected ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-400"
                    }`}>
                      <FolderSimple size={18} />
                    </span>
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className={`text-xs ${folderSelected ? "text-slate-300" : "text-slate-400"}`}>{folder.noteCount}</span>
                  </button>

                  {folderNotes.length > 0 ? (
                    <div className="mt-1 space-y-1 pb-1">
                      {folderNotes.map((note) => {
                        const noteSelected = props.selectedNoteId === note.id;
                        return (
                          <button
                            key={note.id}
                            type="button"
                            onClick={() => props.onSelectNote(note.id, note.folderId)}
                            className={`flex w-full items-start gap-3 rounded-[1rem] border px-4 py-3 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                              noteSelected
                                ? "border-emerald-200 bg-emerald-50 text-slate-950"
                                : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white/80 hover:text-slate-900"
                            }`}
                            style={{ paddingLeft: `${44 + depth * 18}px` }}
                          >
                            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.9rem] border ${
                              noteSelected ? "border-emerald-200 bg-white text-emerald-700" : "border-slate-200 bg-white text-slate-400"
                            }`}>
                              <NotePencil size={16} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium tracking-tight">{note.title}</span>
                              <span className={`mt-1 block truncate text-xs ${noteSelected ? "text-slate-600" : "text-slate-400"}`}>
                                {formatPreviewExcerpt(note.excerpt) || "Empty note"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
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

      <div className="mt-5 border-t border-slate-200/80 pt-5">
        <input
          value={props.pendingName}
          onChange={(event) => props.onPendingNameChange(event.target.value)}
          onKeyDown={handlePendingNameKeyDown}
          placeholder="Notebook name"
          className="w-full rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
        />
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

function SkeletonRow() {
  return <div className="h-16 animate-pulse rounded-[1.3rem] border border-slate-200 bg-slate-100/80" />;
}

function formatPreviewExcerpt(excerpt: string) {
  const cleaned = excerpt.replace(/\s+/g, " ").trim();
  if (cleaned.length <= NOTE_TREE_EXCERPT_LIMIT) {
    return cleaned;
  }
  return `${cleaned.slice(0, NOTE_TREE_EXCERPT_LIMIT).trimEnd()}...`;
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}
