import { ArrowsInSimple, ArrowsOutSimple, CaretDown, CaretLeft, FolderSimplePlus, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import type { FolderIconId, FolderNode, NoteSummary } from "../api/types";
import { FolderIconGlyph, folderIconOptions } from "./folderIcons";
import { getDragPayload, setDragPayload } from "../utils/dragPayload";
import type { FolderMoveInstruction, FolderMovePosition } from "../utils/folderTree";

interface FolderDropTarget {
  targetId: string;
  position: FolderMovePosition;
}

export function FolderTree(props: {
  folders: FolderNode[];
  selectedFolderId: string | null;
  draggedNote: Pick<NoteSummary, "id" | "title"> | null;
  onCreateNotebook(): void;
  onMoveNotebook(move: FolderMoveInstruction): void;
  onMoveNote(noteId: string, folderId: string): void;
  onRenameNotebook(folder: FolderNode): void;
  onRequestDeleteNote(note: Pick<NoteSummary, "id" | "title">): void;
  onRequestDeleteNotebook(folder: FolderNode): void;
  onSelectFolder(folderId: string | null): void;
  onUpdateNotebookIcon(folderId: string, icon: FolderIconId): Promise<void>;
  onCollapse?(): void;
  acceptDraggedNotes?: boolean;
  enableFolderDragAndDrop?: boolean;
}) {
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [folderDropTarget, setFolderDropTarget] = useState<FolderDropTarget | null>(null);
  const [noteDropFolderId, setNoteDropFolderId] = useState<string | null>(null);
  const [trashActive, setTrashActive] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [iconPickerFolderId, setIconPickerFolderId] = useState<string | null>(null);
  const [iconSavingFolderId, setIconSavingFolderId] = useState<string | null>(null);
  const initializedExpansionRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const allNotesCount = props.folders.reduce((total, folder) => total + folder.noteCount, 0);
  const draggedFolder = draggedFolderId ? folderById.get(draggedFolderId) ?? null : null;
  const showDeleteTarget = draggedFolder !== null || props.draggedNote !== null;
  const canDeleteDraggedFolder = Boolean(
    props.enableFolderDragAndDrop !== false &&
      draggedFolder &&
      draggedFolder.childCount === 0 &&
      draggedFolder.noteCount === 0
  );

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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIconPickerFolderId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    function clearTransientDragState() {
      setNoteDropFolderId(null);
      setTrashActive(false);
      setFolderDropTarget(null);
    }

    window.addEventListener("dragend", clearTransientDragState);
    window.addEventListener("drop", clearTransientDragState);
    return () => {
      window.removeEventListener("dragend", clearTransientDragState);
      window.removeEventListener("drop", clearTransientDragState);
    };
  }, []);

  function clearDragState() {
    setDraggedFolderId(null);
    setFolderDropTarget(null);
    setNoteDropFolderId(null);
    setTrashActive(false);
  }

  function handleFolderDragStart(event: DragEvent<HTMLElement>, folderId: string) {
    if (props.enableFolderDragAndDrop === false) {
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    setDragPayload(event.dataTransfer, {
      kind: "folder",
      id: folderId
    });
    setDraggedFolderId(folderId);
  }

  function handleFolderDragOver(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition) {
    const payload = getDragPayload(event.dataTransfer);
    const draggedNoteId = payload?.kind === "note" ? payload.id : props.draggedNote?.id ?? null;
    const draggedNoteFolderId = payload?.kind === "note" ? payload.folderId : props.selectedFolderId;
    if (!payload) {
      if (props.enableFolderDragAndDrop === false || !draggedFolderId || draggedFolderId === targetId) {
        if (!props.acceptDraggedNotes || !draggedNoteId || draggedNoteFolderId === targetId) {
          return;
        }

        event.preventDefault();
        setNoteDropFolderId(targetId);
        setFolderDropTarget(null);
        return;
      }

      event.preventDefault();
      setFolderDropTarget({ targetId, position });
      setNoteDropFolderId(null);
      return;
    }

    if (payload.kind === "note") {
      if (!props.acceptDraggedNotes || draggedNoteFolderId === targetId) {
        return;
      }

      event.preventDefault();
      setNoteDropFolderId(targetId);
      setFolderDropTarget(null);
      return;
    }

    const draggedId = payload.id || draggedFolderId;
    if (props.enableFolderDragAndDrop === false || !draggedId || draggedId === targetId) {
      return;
    }

    event.preventDefault();
    setFolderDropTarget({ targetId, position });
    setNoteDropFolderId(null);
  }

  function handleFolderDrop(event: DragEvent<HTMLElement>, targetId: string, position: FolderMovePosition) {
    const payload = getDragPayload(event.dataTransfer);
    const draggedId = payload?.kind === "folder" ? payload.id : draggedFolderId;
    const draggedNoteId = payload?.kind === "note" ? payload.id : props.draggedNote?.id ?? null;
    const draggedNoteFolderId = payload?.kind === "note" ? payload.folderId : props.selectedFolderId;
    clearDragState();

    if (!payload && !draggedId && !draggedNoteId) {
      return;
    }

    if ((payload?.kind === "note" || (!payload && draggedNoteId)) && draggedNoteId) {
      if (!props.acceptDraggedNotes || draggedNoteFolderId === targetId) {
        return;
      }

      event.preventDefault();
      props.onMoveNote(draggedNoteId, targetId);
      return;
    }

    if (props.enableFolderDragAndDrop === false || !draggedId || draggedId === targetId) {
      return;
    }

    event.preventDefault();
    props.onMoveNotebook({
      draggedId,
      targetId,
      position
    });
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

  async function handleIconSelection(folder: FolderNode, icon: FolderIconId) {
    setIconSavingFolderId(folder.id);
    try {
      await props.onUpdateNotebookIcon(folder.id, icon);
      setIconPickerFolderId(null);
    } finally {
      setIconSavingFolderId(null);
    }
  }

  function renderNotebook(folder: FolderNode, depth: number) {
    const children = childFoldersByParent.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const expanded = hasChildren ? expandedFolderIds.has(folder.id) : false;
    const selected = props.selectedFolderId === folder.id;
    const activeFolderDrop = folderDropTarget?.targetId === folder.id && folderDropTarget.position === "inside";
    const activeNoteDrop = noteDropFolderId === folder.id;

    return (
      <div key={folder.id} className="bb-tree-node">
        {props.enableFolderDragAndDrop === false ? null : (
          <NotebookDropZone
            testId={buildNotebookTestId("before", folder.name)}
            folderId={folder.id}
            depth={depth}
            position="before"
            active={folderDropTarget?.targetId === folder.id && folderDropTarget.position === "before"}
            dragging={draggedFolderId !== null && draggedFolderId !== folder.id}
            onDragOver={handleFolderDragOver}
            onDrop={handleFolderDrop}
          />
        )}

        <div className={`bb-tree-branch ${activeFolderDrop || activeNoteDrop ? "is-drop-active" : ""}`}>
          <div
            data-testid={buildNotebookTestId("drag", folder.name)}
            onDragOver={(event) => handleFolderDragOver(event, folder.id, "inside")}
            onDrop={(event) => handleFolderDrop(event, folder.id, "inside")}
            className="bb-tree-branch__body"
          >
            <div
              className={`bb-tree-row ${selected ? "is-active" : ""} ${activeNoteDrop ? "is-note-target" : ""}`}
              style={{ "--tree-depth": depth } as CSSProperties}
            >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={`${expanded ? "Collapse" : "Expand"} notebook ${folder.name}`}
                  onClick={() => toggleFolder(folder.id)}
                  className="bb-tree-toggle shrink-0"
                >
                  <CaretDown size={12} weight="bold" className={`transition-transform duration-300 ${expanded ? "rotate-0" : "-rotate-90"}`} />
                </button>
              ) : (
                <span className="bb-tree-toggle-placeholder" aria-hidden="true" />
              )}

              <div className="bb-tree-icon-shell">
                <button
                  type="button"
                  aria-label={`Choose icon for ${folder.name}`}
                  title={`Choose icon for ${folder.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIconPickerFolderId((current) => (current === folder.id ? null : folder.id));
                  }}
                  className="bb-tree-icon-button"
                >
                  <FolderIconGlyph icon={folder.icon} size={16} className="bb-tree-icon-glyph" />
                </button>
                {iconPickerFolderId === folder.id ? (
                  <div role="menu" className="bb-icon-picker">
                    {folderIconOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitem"
                        aria-label={`Use ${option.label} icon`}
                        title={option.label}
                        disabled={iconSavingFolderId === folder.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleIconSelection(folder, option.id);
                        }}
                        className={`bb-icon-picker__option ${folder.icon === option.id ? "is-active" : ""}`}
                      >
                        <FolderIconGlyph icon={option.id} size={16} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => props.onSelectFolder(folder.id)}
                onDoubleClick={() => props.onRenameNotebook(folder)}
                draggable={props.enableFolderDragAndDrop !== false}
                onDragStart={(event) => handleFolderDragStart(event, folder.id)}
                onDragEnd={clearDragState}
                className={`bb-tree-row__content ${props.enableFolderDragAndDrop !== false ? "bb-tree-row__content--draggable" : ""}`}
              >
                <span className="bb-tree-row__label">{folder.name}</span>
                <span className="bb-count-pill shrink-0">{folder.noteCount}</span>
              </button>
            </div>
          </div>
        </div>

        {hasChildren && expanded ? (
          <div className="bb-tree-children">
            {children.map((child) => renderNotebook(child, depth + 1))}
          </div>
        ) : null}

        {props.enableFolderDragAndDrop === false ? null : (
          <NotebookDropZone
            testId={buildNotebookTestId("after", folder.name)}
            folderId={folder.id}
            depth={depth}
            position="after"
            active={folderDropTarget?.targetId === folder.id && folderDropTarget.position === "after"}
            dragging={draggedFolderId !== null && draggedFolderId !== folder.id}
            onDragOver={handleFolderDragOver}
            onDrop={handleFolderDrop}
          />
        )}
      </div>
    );
  }

  return (
    <section className="bb-pane-card bb-pane-card--tree" ref={containerRef}>
      <div className="bb-pane-card__header bb-pane-card__header--overlay">
        {showDeleteTarget ? null : (
          <div data-testid="notebooks-actions" className="bb-pane-card__header-actions bb-pane-card__header-actions--end">
            <button
              type="button"
              aria-label="Expand all notebooks"
              title="Expand all notebooks"
              onClick={expandAllFolders}
              disabled={parentFolderIds.size === 0 || allParentsExpanded}
              className="bb-icon-button bb-icon-button--bare"
            >
              <ArrowsOutSimple size={16} />
            </button>
            <button
              type="button"
              aria-label="Collapse all notebooks"
              title="Collapse all notebooks"
              onClick={collapseAllFolders}
              disabled={parentFolderIds.size === 0 || !anyParentExpanded}
              className="bb-icon-button bb-icon-button--bare"
            >
              <ArrowsInSimple size={16} />
            </button>
            <button
              type="button"
              aria-label="New notebook"
              title="New notebook"
              onClick={props.onCreateNotebook}
              className="bb-icon-button bb-icon-button--bare bb-icon-button--accent"
            >
              <FolderSimplePlus size={17} />
            </button>
            {props.onCollapse ? (
              <button
                type="button"
                aria-label="Collapse notebooks pane"
                onClick={props.onCollapse}
                className="bb-icon-button bb-icon-button--bare"
              >
                <CaretLeft size={16} />
              </button>
            ) : null}
          </div>
        )}
        {showDeleteTarget ? (
          <button
            type="button"
            data-testid="notebooks-delete-target"
            aria-label={draggedFolder ? "Delete notebook" : "Delete note"}
            title={
              draggedFolder
                ? canDeleteDraggedFolder
                  ? "Drop the dragged notebook here to delete it"
                  : "Only empty notebooks can be deleted"
                : props.draggedNote
                  ? `Drop ${props.draggedNote.title} here to delete it`
                  : "Delete item"
            }
            disabled={draggedFolder ? !canDeleteDraggedFolder : false}
            onDragOver={(event) => {
              const payload = getDragPayload(event.dataTransfer);
              const draggedNote = props.draggedNote;
              const draggedNoteId = payload?.kind === "note" ? payload.id : draggedNote?.id;
              if (draggedNote && draggedNoteId) {
                event.preventDefault();
                setTrashActive(true);
                return;
              }

              const isFolderDrag = payload?.kind === "folder" || (!payload && draggedFolderId !== null);
              if (!isFolderDrag || !canDeleteDraggedFolder) {
                return;
              }
              event.preventDefault();
              setTrashActive(true);
            }}
            onDragLeave={() => setTrashActive(false)}
            onDrop={(event) => {
              const payload = getDragPayload(event.dataTransfer);
              const isFolderDrag = payload?.kind === "folder" || draggedFolderId !== null;
              const folderToDelete = draggedFolder;
              const draggedNote = props.draggedNote;
              const draggedNoteId = payload?.kind === "note" ? payload.id : draggedNote?.id;
              clearDragState();
              if (draggedNote && draggedNoteId) {
                event.preventDefault();
                props.onRequestDeleteNote(draggedNote);
                return;
              }

              if (!isFolderDrag || !canDeleteDraggedFolder || !folderToDelete) {
                return;
              }

              event.preventDefault();
              props.onRequestDeleteNotebook(folderToDelete);
            }}
            className={`bb-pane-card__header-center-action bb-pane-card__header-center-action--lane ${draggedFolder ? "bb-folder-trash-target" : "bb-note-trash-target"} ${trashActive ? "is-active" : ""}`}
          >
            <Trash size={16} />
          </button>
        ) : null}
      </div>

      <div className="bb-tree-list space-y-1">
        <button
          type="button"
          onClick={() => props.onSelectFolder(null)}
          className={`bb-tree-row bb-tree-row--all ${props.selectedFolderId === null ? "is-active" : ""}`}
        >
          <span className="bb-tree-icon-button" aria-hidden="true">
            <FolderIconGlyph icon="folder" size={16} className="bb-tree-icon-glyph" />
          </span>
          <span className="bb-tree-row__content">
            <span className="bb-tree-row__label">All Notes</span>
            <span className="bb-count-pill shrink-0">{allNotesCount}</span>
          </span>
        </button>

        {props.folders.length === 0 ? (
          <div className="bb-empty-state text-sm">No notebooks yet.</div>
        ) : (
          (childFoldersByParent.get(null) ?? []).map((folder) => renderNotebook(folder, 0))
        )}
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
      className={`bb-dropzone bb-dropzone--tree ${props.dragging ? "is-visible" : ""} ${props.active ? "is-active" : ""}`}
      style={{ marginLeft: `${14 + props.depth * 16}px` }}
    />
  );
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}

