import { ArrowsInSimple, ArrowsOutSimple, CaretDown, CaretLeft, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { FolderNode } from "../api/types";
import type { FolderMoveInstruction, FolderMovePosition } from "../utils/folderTree";

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
  onSelectFolder(folderId: string | null): void;
  onCollapse?(): void;
}) {
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const initializedExpansionRef = useRef(false);
  const dragging = draggedFolderId !== null;
  const canCreateNotebook = props.pendingName.trim().length > 0;
  const allNotesCount = props.folders.reduce((total, folder) => total + folder.noteCount, 0);
  const folderById = useMemo(() => new Map(props.folders.map((folder) => [folder.id, folder])), [props.folders]);
  const childFoldersByParent = useMemo(() => {
    const grouped = new Map<string | null, FolderNode[]>();
    for (const folder of props.folders) {
      const bucket = grouped.get(folder.parentId) ?? [];
      bucket.push(folder);
      grouped.set(folder.parentId, bucket);
    }
    return grouped;
  }, [props.folders]);
  const parentFolderIds = useMemo(
    () => new Set(props.folders.filter((folder) => (childFoldersByParent.get(folder.id)?.length ?? 0) > 0).map((folder) => folder.id)),
    [childFoldersByParent, props.folders]
  );
  const allParentsExpanded = parentFolderIds.size > 0 && [...parentFolderIds].every((folderId) => expandedFolderIds.has(folderId));
  const anyParentExpanded = [...parentFolderIds].some((folderId) => expandedFolderIds.has(folderId));

  useEffect(() => {
    setExpandedFolderIds((current) => {
      const next = new Set<string>();
      for (const folderId of current) {
        if (parentFolderIds.has(folderId)) {
          next.add(folderId);
        }
      }
      if (!initializedExpansionRef.current && parentFolderIds.size > 0) {
        for (const folderId of parentFolderIds) {
          next.add(folderId);
        }
        initializedExpansionRef.current = true;
      }
      return next;
    });
  }, [parentFolderIds]);

  useEffect(() => {
    const selectedFolderId = props.selectedFolderId;
    if (!selectedFolderId) {
      return;
    }

    setExpandedFolderIds((current) => {
      const next = new Set(current);
      let cursor = folderById.get(selectedFolderId);
      while (cursor?.parentId) {
        const parentId = cursor.parentId;
        next.add(parentId);
        cursor = folderById.get(parentId);
      }
      return next;
    });
  }, [folderById, props.selectedFolderId]);

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

  function toggleFolder(folderId: string) {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }

  function expandAllFolders() {
    setExpandedFolderIds(new Set(parentFolderIds));
    if (parentFolderIds.size > 0) {
      initializedExpansionRef.current = true;
    }
  }

  function collapseAllFolders() {
    setExpandedFolderIds(new Set());
    if (parentFolderIds.size > 0) {
      initializedExpansionRef.current = true;
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-200/70 bg-white/88 p-4 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.18)] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Notebooks</p>
        <div data-testid="notebooks-actions" className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Expand all notebooks"
            title="Expand all notebooks"
            onClick={expandAllFolders}
            disabled={parentFolderIds.size === 0 || allParentsExpanded}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-900 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
          >
            <ArrowsOutSimple size={16} />
          </button>
          <button
            type="button"
            aria-label="Collapse all notebooks"
            title="Collapse all notebooks"
            onClick={collapseAllFolders}
            disabled={parentFolderIds.size === 0 || !anyParentExpanded}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-900 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
          >
            <ArrowsInSimple size={16} />
          </button>
          <button
            type="button"
            aria-label="New notebook"
            title="New notebook"
            onClick={props.onCreateNotebook}
            disabled={!canCreateNotebook}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-emerald-300 hover:text-emerald-700 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
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
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <button
          type="button"
          onClick={() => props.onSelectFolder(null)}
          className={`flex w-full items-center gap-2.5 rounded-[1.1rem] px-3.5 py-2.5 text-left transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            props.selectedFolderId === null ? "bg-slate-950 text-white" : "bg-slate-50/70 text-slate-700 hover:-translate-y-[1px] hover:bg-white"
          }`}
        >
          <span
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.9rem] border ${
              props.selectedFolderId === null ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-400"
            }`}
          >
            <FolderSimple size={16} />
          </span>
          <span className="flex-1 truncate text-sm font-medium tracking-tight">All Notes</span>
          <span className={`text-[11px] ${props.selectedFolderId === null ? "text-slate-300" : "text-slate-400"}`}>{allNotesCount}</span>
        </button>

        {props.folders.length === 0 ? (
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">No notebooks yet.</div>
        ) : (
          (childFoldersByParent.get(null) ?? []).map((folder) =>
            renderNotebook(folder, 0, {
              childFoldersByParent,
              clearDragState,
              draggedFolderId,
              dragging,
              dropTarget,
              expandedFolderIds,
              handleDragOver,
              handleDragStart,
              handleDrop,
              onSelectFolder: props.onSelectFolder,
              selectedFolderId: props.selectedFolderId,
              toggleFolder
            })
          )
        )}
      </div>

      <div className="mt-4 border-t border-slate-200/80 pt-4">
        <input
          value={props.pendingName}
          onChange={(event) => props.onPendingNameChange(event.target.value)}
          onKeyDown={handlePendingNameKeyDown}
          placeholder="Notebook name"
          className="w-full rounded-[1rem] border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
        />
      </div>
    </section>
  );
}

function renderNotebook(
  folder: FolderNode,
  depth: number,
  helpers: {
    childFoldersByParent: Map<string | null, FolderNode[]>;
    clearDragState(): void;
    draggedFolderId: string | null;
    dragging: boolean;
    dropTarget: DropTarget | null;
    expandedFolderIds: Set<string>;
    handleDragOver(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition): void;
    handleDragStart(event: DragEvent<HTMLDivElement>, folderId: string): void;
    handleDrop(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition): void;
    onSelectFolder(folderId: string | null): void;
    selectedFolderId: string | null;
    toggleFolder(folderId: string): void;
  }
) {
  const children = helpers.childFoldersByParent.get(folder.id) ?? [];
  const hasChildren = children.length > 0;
  const expanded = hasChildren ? helpers.expandedFolderIds.has(folder.id) : false;
  const selected = helpers.selectedFolderId === folder.id;
  const insideDropActive = helpers.dropTarget?.targetId === folder.id && helpers.dropTarget.position === "inside";

  return (
    <div key={folder.id} className="space-y-1">
      <NotebookDropZone
        testId={buildNotebookTestId("before", folder.name)}
        folderId={folder.id}
        depth={depth}
        position="before"
        active={helpers.dropTarget?.targetId === folder.id && helpers.dropTarget.position === "before"}
        dragging={helpers.dragging && helpers.draggedFolderId !== folder.id}
        onDragOver={helpers.handleDragOver}
        onDrop={helpers.handleDrop}
      />

      <div
        draggable
        data-testid={buildNotebookTestId("drag", folder.name)}
        onDragStart={(event) => helpers.handleDragStart(event, folder.id)}
        onDragEnd={helpers.clearDragState}
        onDragOver={(event) => helpers.handleDragOver(event, folder.id, "inside")}
        onDrop={(event) => helpers.handleDrop(event, folder.id, "inside")}
        className={`rounded-[1.15rem] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          insideDropActive ? "bg-emerald-50/80 ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-white" : ""
        }`}
      >
        <div
          className={`flex items-center gap-2 rounded-[1.1rem] px-3.5 py-2.5 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            selected ? "bg-slate-950 text-white" : "bg-slate-50/70 text-slate-700 hover:bg-white"
          }`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} notebook ${folder.name}`}
              onClick={() => helpers.toggleFolder(folder.id)}
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                selected ? "text-emerald-300 hover:bg-slate-900" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              <CaretDown size={13} weight="bold" className={`transition-transform duration-300 ${expanded ? "rotate-0" : "-rotate-90"}`} />
            </button>
          ) : (
            <span className="inline-flex h-6 w-6 shrink-0" aria-hidden="true" />
          )}

          <button
            type="button"
            onClick={() => helpers.onSelectFolder(selected ? null : folder.id)}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.9rem] border ${
                selected ? "border-slate-700 bg-slate-900 text-slate-300" : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <FolderSimple size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">{folder.name}</span>
            <span className={`shrink-0 text-[11px] ${selected ? "text-slate-300" : "text-slate-400"}`}>{folder.noteCount}</span>
          </button>
        </div>
      </div>

      {hasChildren && expanded ? children.map((child) => renderNotebook(child, depth + 1, helpers)) : null}

      <NotebookDropZone
        testId={buildNotebookTestId("after", folder.name)}
        folderId={folder.id}
        depth={depth}
        position="after"
        active={helpers.dropTarget?.targetId === folder.id && helpers.dropTarget.position === "after"}
        dragging={helpers.dragging && helpers.draggedFolderId !== folder.id}
        onDragOver={helpers.handleDragOver}
        onDrop={helpers.handleDrop}
      />
    </div>
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
