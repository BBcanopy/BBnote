import { ArrowsInSimple, ArrowsOutSimple, CaretDown, CaretLeft, FolderSimple, FolderSimplePlus } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { FolderNode } from "../api/types";
import type { FolderMoveInstruction, FolderMovePosition } from "../utils/folderTree";

interface DropTarget {
  targetId: string;
  position: FolderMovePosition;
}

export function FolderTree(props: {
  folders: FolderNode[];
  selectedFolderId: string | null;
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
    <section className="bb-pane-card">
      <div className="bb-pane-card__header justify-end">
        <div data-testid="notebooks-actions" className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Expand all notebooks"
            title="Expand all notebooks"
            onClick={expandAllFolders}
            disabled={parentFolderIds.size === 0 || allParentsExpanded}
            className="bb-icon-button"
          >
            <ArrowsOutSimple size={16} />
          </button>
          <button
            type="button"
            aria-label="Collapse all notebooks"
            title="Collapse all notebooks"
            onClick={collapseAllFolders}
            disabled={parentFolderIds.size === 0 || !anyParentExpanded}
            className="bb-icon-button"
          >
            <ArrowsInSimple size={16} />
          </button>
          <button
            type="button"
            aria-label="New notebook"
            title="New notebook"
            onClick={props.onCreateNotebook}
            className="bb-icon-button bb-icon-button--accent"
          >
            <FolderSimplePlus size={17} />
          </button>
          {props.onCollapse ? (
            <button
              type="button"
              aria-label="Collapse notebooks pane"
              onClick={props.onCollapse}
              className="bb-icon-button"
            >
              <CaretLeft size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => props.onSelectFolder(null)}
          className={`bb-tree-row ${props.selectedFolderId === null ? "is-active" : ""}`}
        >
          <span className="bb-tree-icon shrink-0">
            <FolderSimple size={16} />
          </span>
          <span className="flex-1 truncate text-sm font-medium tracking-tight">All Notes</span>
          <span className="bb-count-pill">{allNotesCount}</span>
        </button>

        {props.folders.length === 0 ? (
          <div className="bb-empty-state text-sm">No notebooks yet.</div>
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
        className={insideDropActive ? "bb-tree-drop-target rounded-[1.15rem]" : "rounded-[1.15rem]"}
      >
        <div
          className={`bb-tree-row ${selected ? "is-active" : ""}`}
          style={{ paddingLeft: `${16 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={`${expanded ? "Collapse" : "Expand"} notebook ${folder.name}`}
              onClick={() => helpers.toggleFolder(folder.id)}
              className="bb-tree-toggle shrink-0"
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
            <span className="bb-tree-icon shrink-0">
              <FolderSimple size={16} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium tracking-tight">{folder.name}</span>
            <span className="bb-count-pill shrink-0">{folder.noteCount}</span>
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
      className={`bb-dropzone ${props.dragging ? "is-visible" : ""} ${props.active ? "is-active" : ""}`}
      style={{ marginLeft: `${16 + props.depth * 18}px` }}
    />
  );
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}
