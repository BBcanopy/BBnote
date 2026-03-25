import {
  CaretLeft,
  CaretRight,
  CircleNotch,
  Eye,
  FolderSimple,
  ListBullets,
  PencilSimple,
  Plus,
  Trash
} from "@phosphor-icons/react";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  createFolder,
  createNote,
  deleteAttachment,
  deleteFolder,
  deleteNote,
  fetchAttachmentBlob,
  getNote,
  listFolders,
  listNotes,
  moveNote,
  reorderNotes,
  updateFolder,
  updateNote,
  uploadAttachment
} from "../api/client";
import type { AttachmentRef, FolderNode, NoteDetail, NoteSummary } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { AttachmentList } from "../components/AttachmentList";
import { buttonGhost, buttonPrimary, buttonSecondary } from "../components/buttonStyles";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { FolderTree } from "../components/FolderTree";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { NoteListPane } from "../components/NoteListPane";
import { TextPromptDialog } from "../components/TextPromptDialog";
import { buildFolderMutations, moveFolders, type FolderMoveInstruction } from "../utils/folderTree";
import { buildNoteOrderIds, moveNotes, type NoteMoveInstruction } from "../utils/noteOrder";

type EditorPane = "markdown" | "preview";

interface EditorState {
  noteId: string | null;
  folderId: string | null;
  title: string;
  bodyMarkdown: string;
  attachments: AttachmentRef[];
  createdAt: string | null;
  updatedAt: string | null;
  isDraft: boolean;
}

const AUTOSAVE_DELAY_MS = 700;
const DEFAULT_FOLDER_PANE_WIDTH = 320;
const DEFAULT_NOTE_PANE_WIDTH = 340;
const MIN_FOLDER_PANE_WIDTH = 260;
const MAX_FOLDER_PANE_WIDTH = 420;
const MIN_NOTE_PANE_WIDTH = 280;
const MAX_NOTE_PANE_WIDTH = 480;
const KEYBOARD_RESIZE_STEP = 24;

type PaneResizeTarget = "folders" | "notes";

interface PaneResizeState {
  target: PaneResizeTarget;
  startX: number;
  startWidth: number;
}

export function NotesPage() {
  const auth = useAuth();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorNote, setEditorNote] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [editorPane, setEditorPane] = useState<EditorPane>("markdown");
  const [folderPaneCollapsed, setFolderPaneCollapsed] = useState(false);
  const [notePaneCollapsed, setNotePaneCollapsed] = useState(false);
  const [folderPaneWidth, setFolderPaneWidth] = useState(DEFAULT_FOLDER_PANE_WIDTH);
  const [notePaneWidth, setNotePaneWidth] = useState(DEFAULT_NOTE_PANE_WIDTH);
  const [paneResize, setPaneResize] = useState<PaneResizeState | null>(null);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteNoteOpen, setDeleteNoteOpen] = useState(false);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<FolderNode | null>(null);
  const [lastSyncedContentKey, setLastSyncedContentKey] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const saveInFlightRef = useRef(false);
  const editorSessionRef = useRef(0);
  const noteLoadRef = useRef(0);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const currentContentKey = useMemo(
    () => (editorNote ? buildContentKey(editorNote.folderId, editorNote.title, editorNote.bodyMarkdown) : null),
    [editorNote]
  );
  const canPersistEditor = Boolean(editorNote?.folderId && editorNote.title.trim().length > 0);
  const explorerCollapsed = folderPaneCollapsed && notePaneCollapsed;
  const canCreateDraft = selectedFolderId !== null;
  const canReorderNotes = Boolean(selectedFolderId && search.trim().length === 0);

  useEffect(() => {
    if (!auth.user) {
      return;
    }
    void refreshFolders();
  }, [auth.user]);

  useEffect(() => {
    if (!auth.user) {
      return;
    }
    void refreshNotes();
  }, [auth.user, deferredSearch, selectedFolderId]);

  useEffect(() => {
    if (!auth.user || !selectedNoteId) {
      return;
    }

    const loadId = ++noteLoadRef.current;
    setLoadingEditor(true);
    setError(null);

    getNote(selectedNoteId)
      .then((note) => {
        if (loadId !== noteLoadRef.current) {
          return;
        }

        editorSessionRef.current += 1;
        setEditorNote(mapNoteDetail(note));
        setLastSyncedContentKey(buildContentKey(note.folderId, note.title, note.bodyMarkdown));
      })
      .catch((noteError) => {
        if (loadId !== noteLoadRef.current) {
          return;
        }
        setError(String(noteError));
      })
      .finally(() => {
        if (loadId === noteLoadRef.current) {
          setLoadingEditor(false);
        }
      });
  }, [auth.user, selectedNoteId]);

  useEffect(() => {
    if (!auth.user || !editorNote || !currentContentKey || !canPersistEditor || currentContentKey === lastSyncedContentKey) {
      return;
    }

    if (saveInFlightRef.current) {
      return;
    }

    const sessionId = editorSessionRef.current;
    const payload = {
      noteId: editorNote.noteId,
      folderId: editorNote.folderId as string,
      title: editorNote.title.trim(),
      bodyMarkdown: editorNote.bodyMarkdown
    };
    const refreshFoldersAfterSave = !payload.noteId;
    const timer = window.setTimeout(async () => {
      saveInFlightRef.current = true;
      setSaving(true);
      setError(null);

      try {
        const persisted = payload.noteId
          ? await updateNote(payload.noteId, {
              folderId: payload.folderId,
              title: payload.title,
              bodyMarkdown: payload.bodyMarkdown
            })
          : await createNote({
              folderId: payload.folderId,
              title: payload.title,
              bodyMarkdown: payload.bodyMarkdown
            });

        if (sessionId === editorSessionRef.current) {
          setLastSyncedContentKey(buildContentKey(payload.folderId, payload.title, payload.bodyMarkdown));
          startTransition(() => {
            setSelectedNoteId(persisted.id);
            setEditorNote((current) => {
              if (!current) {
                return current;
              }
              const sameRecord = current.noteId ? current.noteId === persisted.id : sessionId === editorSessionRef.current;
              if (!sameRecord) {
                return current;
              }

              return {
                ...current,
                noteId: persisted.id,
                attachments: persisted.attachments,
                createdAt: persisted.createdAt,
                updatedAt: persisted.updatedAt,
                isDraft: false
              };
            });
          });
        }

        if (refreshFoldersAfterSave) {
          await Promise.all([refreshNotes(), refreshFolders()]);
        } else {
          await refreshNotes();
        }
      } catch (saveError) {
        if (sessionId === editorSessionRef.current) {
          setError(String(saveError));
        }
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [auth.user, canPersistEditor, currentContentKey, editorNote, lastSyncedContentKey]);

  useEffect(() => {
    if (!paneResize) {
      return;
    }

    const activeResize = paneResize;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: PointerEvent) {
      const delta = event.clientX - activeResize.startX;
      if (activeResize.target === "folders") {
        setFolderPaneWidth(clampValue(activeResize.startWidth + delta, MIN_FOLDER_PANE_WIDTH, MAX_FOLDER_PANE_WIDTH));
        return;
      }

      setNotePaneWidth(clampValue(activeResize.startWidth + delta, MIN_NOTE_PANE_WIDTH, MAX_NOTE_PANE_WIDTH));
    }

    function handlePointerUp() {
      setPaneResize(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [paneResize]);

  async function refreshFolders() {
    try {
      const nextFolders = await listFolders();
      setFolders(nextFolders);

      if (selectedFolderId && !nextFolders.some((folder) => folder.id === selectedFolderId)) {
        setSelectedFolderId(null);
        setFolderPaneCollapsed(false);
      }

      if (editorNote?.folderId && !nextFolders.some((folder) => folder.id === editorNote.folderId)) {
        setEditorNote((current) => (current ? { ...current, folderId: null } : current));
      }
    } catch (folderError) {
      setError(String(folderError));
    }
  }

  async function refreshNotes(options?: {
    folderId?: string | null;
    search?: string;
  }) {
    const nextFolderId = options?.folderId === undefined ? selectedFolderId : options.folderId;
    const nextSearch = options?.search === undefined ? deferredSearch : options.search;

    try {
      setLoadingNotes(true);
      const payload = await listNotes({
        folderId: nextFolderId ?? undefined,
        q: nextSearch || undefined,
        sort: nextFolderId && !nextSearch ? "priority" : undefined,
        order: nextFolderId && !nextSearch ? "asc" : undefined
      });
      setNotes(payload.items);
    } catch (notesError) {
      setError(String(notesError));
    } finally {
      setLoadingNotes(false);
    }
  }

  async function handleUpdateNotebookIcon(folderId: string, icon: FolderNode["icon"]) {
    if (!auth.user) {
      return;
    }

    const folder = folders.find((entry) => entry.id === folderId);
    if (!folder || folder.icon === icon) {
      return;
    }

    setError(null);
    await updateFolder(folderId, {
      name: folder.name,
      icon,
      parentId: folder.parentId
    });
    await refreshFolders();
  }

  function openCreateNotebookDialog() {
    setNewNotebookName("");
    setCreateNotebookOpen(true);
  }

  function closeCreateNotebookDialog() {
    setCreateNotebookOpen(false);
    setNewNotebookName("");
  }

  async function handleCreateNotebook() {
    if (!auth.user || !newNotebookName.trim()) {
      return;
    }

    setError(null);

    try {
      const created = await createFolder({
        name: newNotebookName.trim(),
        parentId: selectedFolderId
      });
      closeCreateNotebookDialog();
      await refreshFolders();
      setSelectedFolderId(created.id);
      setFolderPaneCollapsed(false);
      setNotePaneCollapsed(false);
      setMobileFoldersOpen(false);

      setEditorNote((current) => {
        if (!current || current.folderId) {
          return current;
        }
        return {
          ...current,
          folderId: created.id
        };
      });
    } catch (folderError) {
      setError(String(folderError));
    }
  }

  async function handleMoveNotebook(move: FolderMoveInstruction) {
    if (!auth.user) {
      return;
    }

    const nextFolders = moveFolders(folders, move);
    if (!nextFolders) {
      return;
    }

    const previousFolders = folders;
    const previousMutations = new Map(buildFolderMutations(previousFolders).map((mutation) => [mutation.id, mutation]));
    const nextMutations = buildFolderMutations(nextFolders);
    const nextFolderById = new Map(nextFolders.map((folder) => [folder.id, folder]));
    const changedFolders = nextMutations.filter((mutation) => {
      const previous = previousMutations.get(mutation.id);
      return !previous || previous.parentId !== mutation.parentId || previous.sortOrder !== mutation.sortOrder;
    });

    setError(null);
    setFolders(nextFolders);

    try {
      for (const mutation of changedFolders) {
        const folder = nextFolderById.get(mutation.id);
        if (!folder) {
          continue;
        }

        await updateFolder(mutation.id, {
          name: folder.name,
          parentId: mutation.parentId,
          sortOrder: mutation.sortOrder
        });
      }
      await refreshFolders();
    } catch (moveError) {
      setFolders(previousFolders);
      setError(String(moveError));
      await refreshFolders();
    }
  }

  async function handleMoveNote(move: NoteMoveInstruction) {
    if (!auth.user || !selectedFolderId || !canReorderNotes) {
      return;
    }

    const nextNotes = moveNotes(notes, move);
    if (!nextNotes) {
      return;
    }

    const previousNotes = notes;
    setError(null);
    setNotes(nextNotes);

    try {
      await reorderNotes({
        folderId: selectedFolderId,
        orderedNoteIds: buildNoteOrderIds(nextNotes)
      });
      await refreshNotes();
    } catch (moveError) {
      setNotes(previousNotes);
      setError(String(moveError));
      await refreshNotes();
    }
  }

  function handleCreateDraft() {
    if (!canCreateDraft) {
      return;
    }

    editorSessionRef.current += 1;
    noteLoadRef.current += 1;
    setError(null);
    setSelectedNoteId(null);
    setEditorNote(createDraft(selectedFolderId));
    setLastSyncedContentKey(null);
    setEditorPane("markdown");
    setFolderPaneCollapsed(false);
    setNotePaneCollapsed(false);
    setMobileNotesOpen(false);
  }

  function handleSelectFolder(folderId: string | null) {
    setSelectedFolderId(folderId);
    setFolderPaneCollapsed(false);
    setNotePaneCollapsed(false);
    setMobileFoldersOpen(false);
    setSelectedNoteId(null);
  }

  function handleSelectNote(noteId: string) {
    setSelectedNoteId(noteId);
    setMobileNotesOpen(false);
  }

  async function handleMoveNoteToNotebook(noteId: string, folderId: string) {
    if (!auth.user) {
      return;
    }

    const movingSelectedNote = selectedNoteId === noteId || editorNote?.noteId === noteId;
    setError(null);

    try {
      const movedNote = await moveNote(noteId, { folderId });
      setSearch("");
      setSelectedFolderId(folderId);
      setFolderPaneCollapsed(false);
      setNotePaneCollapsed(false);
      setMobileFoldersOpen(false);
      setMobileNotesOpen(false);

      if (movingSelectedNote) {
        setSelectedNoteId(noteId);
        setEditorNote(mapNoteDetail(movedNote));
        setLastSyncedContentKey(buildContentKey(movedNote.folderId, movedNote.title, movedNote.bodyMarkdown));
      }

      await Promise.all([
        refreshFolders(),
        refreshNotes({
          folderId,
          search: ""
        })
      ]);
    } catch (moveError) {
      setError(String(moveError));
    }
  }

  function handleRequestDeleteCurrentNote() {
    if (!editorNote?.noteId) {
      return;
    }
    setDeleteNoteOpen(true);
  }

  async function handleDeleteCurrentNote() {
    if (!auth.user || !editorNote?.noteId) {
      return;
    }

    setError(null);

    try {
      await deleteNote(editorNote.noteId);
      editorSessionRef.current += 1;
      noteLoadRef.current += 1;
      setDeleteNoteOpen(false);
      setEditorNote(null);
      setSelectedNoteId(null);
      setLastSyncedContentKey(null);
      await Promise.all([refreshNotes(), refreshFolders()]);
    } catch (deleteError) {
      setError(String(deleteError));
    }
  }

  function handleRequestDeleteNotebook(folder: FolderNode) {
    setPendingFolderDelete(folder);
  }

  async function handleDeleteNotebook() {
    if (!auth.user || !pendingFolderDelete) {
      return;
    }

    setError(null);

    try {
      await deleteFolder(pendingFolderDelete.id);
      if (selectedFolderId === pendingFolderDelete.id) {
        setSelectedFolderId(null);
      }
      setPendingFolderDelete(null);
      await Promise.all([refreshFolders(), refreshNotes({ folderId: null })]);
    } catch (deleteError) {
      setError(String(deleteError));
    }
  }

  async function handleAttachmentUpload(files: FileList | null) {
    if (!auth.user || !editorNote?.noteId || !files?.[0]) {
      return;
    }

    setUploadingAttachment(true);
    setError(null);

    try {
      await uploadAttachment(editorNote.noteId, files[0]);
      const refreshed = await getNote(editorNote.noteId);
      setEditorNote(mapNoteDetail(refreshed));
      setLastSyncedContentKey(buildContentKey(refreshed.folderId, refreshed.title, refreshed.bodyMarkdown));
      await refreshNotes();
    } catch (uploadError) {
      setError(String(uploadError));
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!auth.user || !editorNote?.noteId) {
      return;
    }

    setError(null);

    try {
      await deleteAttachment(attachmentId);
      const refreshed = await getNote(editorNote.noteId);
      setEditorNote(mapNoteDetail(refreshed));
      setLastSyncedContentKey(buildContentKey(refreshed.folderId, refreshed.title, refreshed.bodyMarkdown));
    } catch (attachmentError) {
      setError(String(attachmentError));
    }
  }

  async function handleDownloadAttachment(attachment: AttachmentRef) {
    if (!auth.user) {
      return;
    }
    const blob = await fetchAttachmentBlob(attachment.url);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = attachment.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function appendToBody(snippet: string) {
    setEditorNote((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        bodyMarkdown: `${current.bodyMarkdown}${current.bodyMarkdown.endsWith("\n") || current.bodyMarkdown.length === 0 ? "" : "\n"}${snippet}`
      };
    });
  }

  const editorStatus = getEditorStatus({
    editorNote,
    foldersCount: folders.length,
    loadingEditor,
    saving
  });

  function startPaneResize(target: PaneResizeTarget, startX: number) {
    setPaneResize({
      target,
      startX,
      startWidth: target === "folders" ? folderPaneWidth : notePaneWidth
    });
  }

  function nudgePaneWidth(target: PaneResizeTarget, delta: number) {
    if (target === "folders") {
      setFolderPaneWidth((current) => clampValue(current + delta, MIN_FOLDER_PANE_WIDTH, MAX_FOLDER_PANE_WIDTH));
      return;
    }

    setNotePaneWidth((current) => clampValue(current + delta, MIN_NOTE_PANE_WIDTH, MAX_NOTE_PANE_WIDTH));
  }

  return (
    <>
      <section className="mb-4 flex flex-wrap gap-2 lg:hidden">
        <button type="button" onClick={() => setMobileFoldersOpen(true)} className={buttonSecondary}>
          <FolderSimple size={18} />
          Notebooks
        </button>
        <button type="button" onClick={() => setMobileNotesOpen(true)} className={buttonSecondary}>
          <ListBullets size={18} />
          Notes
        </button>
        <button
          type="button"
          onClick={handleCreateDraft}
          disabled={!canCreateDraft}
          title={canCreateDraft ? "New note" : "Select a notebook to create a note"}
          className={buttonPrimary}
        >
          <Plus size={18} />
          New note
        </button>
      </section>

      <div className="hidden min-h-[calc(100dvh-7rem)] items-stretch lg:flex">
        {explorerCollapsed ? (
          <CollapsedPaneRail
            label="Notebooks and notes"
            ariaLabel="Open notebooks and notes panes"
            titleText="Open notebooks and notes panes"
            onOpen={() => {
              setFolderPaneCollapsed(false);
              setNotePaneCollapsed(false);
            }}
          />
        ) : (
          <>
            {folderPaneCollapsed ? (
              <CollapsedPaneRail
                label="Notebooks"
                onOpen={() => setFolderPaneCollapsed(false)}
              />
            ) : (
                <div className="flex shrink-0 items-stretch">
                  <div data-testid="notebook-pane" className="bb-workspace-lane bb-workspace-lane--folders shrink-0" style={{ width: folderPaneWidth }}>
                  <FolderTree
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    onCreateNotebook={openCreateNotebookDialog}
                    onMoveNotebook={(move) => void handleMoveNotebook(move)}
                    onMoveNote={(noteId, folderId) => void handleMoveNoteToNotebook(noteId, folderId)}
                    onRequestDeleteNotebook={handleRequestDeleteNotebook}
                    onUpdateNotebookIcon={(folderId, icon) => handleUpdateNotebookIcon(folderId, icon)}
                    onCollapse={() => setFolderPaneCollapsed(true)}
                    onSelectFolder={handleSelectFolder}
                    acceptDraggedNotes
                    enableFolderDragAndDrop
                  />
                </div>
                <PaneResizeHandle
                  testId="notebook-pane-resizer"
                  label="Resize notebooks pane"
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    startPaneResize("folders", event.clientX);
                  }}
                  onNudge={(delta) => nudgePaneWidth("folders", delta)}
                />
              </div>
            )}

            {notePaneCollapsed ? (
              <CollapsedPaneRail
                label="Notes"
                onOpen={() => setNotePaneCollapsed(false)}
              />
            ) : (
                <div className="flex shrink-0 items-stretch">
                  <div data-testid="notes-pane" className="bb-workspace-lane bb-workspace-lane--notes shrink-0" style={{ width: notePaneWidth }}>
                  <NoteListPane
                    notes={notes}
                    search={search}
                    onSearchChange={setSearch}
                    selectedNoteId={selectedNoteId}
                    onSelectNote={handleSelectNote}
                    onCreateNote={handleCreateDraft}
                    onCollapse={() => setNotePaneCollapsed(true)}
                    loading={loadingNotes}
                    notebookName={selectedFolder?.name ?? null}
                    canCreateNote={canCreateDraft}
                    canReorder={canReorderNotes}
                    enableCrossNotebookMove
                    onMoveNote={(move) => void handleMoveNote(move)}
                  />
                </div>
                <PaneResizeHandle
                  testId="notes-pane-resizer"
                  label="Resize notes pane"
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }
                    event.preventDefault();
                    startPaneResize("notes", event.clientX);
                  }}
                  onNudge={(delta) => nudgePaneWidth("notes", delta)}
                />
              </div>
            )}
          </>
        )}

        <EditorPanel
          editorNote={editorNote}
          editorPane={editorPane}
          onEditorPaneChange={setEditorPane}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onDeleteRequest={handleRequestDeleteCurrentNote}
          onUpload={(files) => void handleAttachmentUpload(files)}
          onInsertLink={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertImage={(attachment) => appendToBody(`![${attachment.name}](${attachment.url})`)}
          onDeleteAttachment={(attachmentId) => void handleDeleteAttachment(attachmentId)}
          onDownloadAttachment={(attachment) => void handleDownloadAttachment(attachment)}
          statusText={editorStatus}
          loading={loadingEditor}
          saving={saving}
          uploadingAttachment={uploadingAttachment}
          error={error}
        />
      </div>

      <div className="lg:hidden">
        <EditorPanel
          editorNote={editorNote}
          editorPane={editorPane}
          onEditorPaneChange={setEditorPane}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onDeleteRequest={handleRequestDeleteCurrentNote}
          onUpload={(files) => void handleAttachmentUpload(files)}
          onInsertLink={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertImage={(attachment) => appendToBody(`![${attachment.name}](${attachment.url})`)}
          onDeleteAttachment={(attachmentId) => void handleDeleteAttachment(attachmentId)}
          onDownloadAttachment={(attachment) => void handleDownloadAttachment(attachment)}
          statusText={editorStatus}
          loading={loadingEditor}
          saving={saving}
          uploadingAttachment={uploadingAttachment}
          error={error}
        />
      </div>

      <MobileDrawer open={mobileFoldersOpen} title="Notebooks" onClose={() => setMobileFoldersOpen(false)}>
        <FolderTree
          folders={folders}
          selectedFolderId={selectedFolderId}
          onCreateNotebook={openCreateNotebookDialog}
          onMoveNotebook={(move) => void handleMoveNotebook(move)}
          onMoveNote={(noteId, folderId) => void handleMoveNoteToNotebook(noteId, folderId)}
          onRequestDeleteNotebook={handleRequestDeleteNotebook}
          onUpdateNotebookIcon={(folderId, icon) => handleUpdateNotebookIcon(folderId, icon)}
          onSelectFolder={handleSelectFolder}
          acceptDraggedNotes={false}
          enableFolderDragAndDrop={false}
        />
      </MobileDrawer>

      <MobileDrawer open={mobileNotesOpen} title="Notes" onClose={() => setMobileNotesOpen(false)}>
        <NoteListPane
          notes={notes}
          search={search}
          onSearchChange={setSearch}
          selectedNoteId={selectedNoteId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateDraft}
          loading={loadingNotes}
          notebookName={selectedFolder?.name ?? null}
          canCreateNote={canCreateDraft}
          canReorder={canReorderNotes}
          enableCrossNotebookMove={false}
          onMoveNote={(move) => void handleMoveNote(move)}
        />
      </MobileDrawer>

      <TextPromptDialog
        open={createNotebookOpen}
        title={selectedFolder ? `Create notebook in ${selectedFolder.name}` : "Create notebook"}
        description={selectedFolder ? "The new notebook will be created inside the currently selected notebook." : "Create a new top-level notebook."}
        value={newNotebookName}
        placeholder="Notebook name"
        confirmLabel="Create notebook"
        onChange={setNewNotebookName}
        onClose={closeCreateNotebookDialog}
        onConfirm={() => void handleCreateNotebook()}
      />

      <ConfirmationDialog
        open={deleteNoteOpen}
        title="Delete note?"
        description="This note will be removed permanently."
        confirmLabel="Delete note"
        tone="danger"
        onClose={() => setDeleteNoteOpen(false)}
        onConfirm={() => void handleDeleteCurrentNote()}
      />

      <ConfirmationDialog
        open={pendingFolderDelete !== null}
        title="Delete notebook?"
        description={pendingFolderDelete ? `${pendingFolderDelete.name} will be removed permanently once you confirm.` : undefined}
        confirmLabel="Delete notebook"
        tone="danger"
        onClose={() => setPendingFolderDelete(null)}
        onConfirm={() => void handleDeleteNotebook()}
      />
    </>
  );
}

function EditorPanel(props: {
  editorNote: EditorState | null;
  editorPane: EditorPane;
  onEditorPaneChange(value: EditorPane): void;
  onTitleChange(title: string): void;
  onBodyChange(bodyMarkdown: string): void;
  onDeleteRequest(): void;
  onUpload(files: FileList | null): void;
  onInsertLink(attachment: AttachmentRef): void;
  onInsertImage(attachment: AttachmentRef): void;
  onDeleteAttachment(attachmentId: string): void;
  onDownloadAttachment(attachment: AttachmentRef): void;
  statusText: string;
  loading: boolean;
  saving: boolean;
  uploadingAttachment: boolean;
  error: string | null;
}) {
  return (
    <section className="bb-editor-panel bb-editor-panel--workspace lg:flex-1">
      <div className="bb-editor-header">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onDeleteRequest}
            disabled={!props.editorNote?.noteId}
            aria-label="Delete note"
            title="Delete note"
            className="bb-icon-button bb-icon-button--bare bb-icon-button--danger"
          >
            <Trash size={17} />
          </button>
        </div>
      </div>

      {props.error ? (
        <p className="bb-error-banner text-sm">{props.error}</p>
      ) : null}

      {props.loading ? (
        <div className="bb-empty-state bb-empty-state--center text-sm">
          <span className="inline-flex items-center gap-2">
            <CircleNotch size={18} className="animate-spin text-[color:var(--accent-strong)]" />
            Loading note
          </span>
        </div>
      ) : !props.editorNote ? (
        <div className="bb-empty-state bb-empty-state--center px-6 py-8">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-tight text-[color:var(--ink)]">No note selected</p>
            <p className="text-sm text-[color:var(--ink-soft)]">Choose a note or start a new draft.</p>
          </div>
        </div>
      ) : (
      <div className="bb-editor-panel__content">
        <label className="bb-field">
          <span className="bb-field__label">Title</span>
          <input
            value={props.editorNote?.title ?? ""}
            onChange={(event) => props.onTitleChange(event.target.value)}
            placeholder="Note title"
            disabled={!props.editorNote}
            className="bb-input text-lg font-medium tracking-tight"
          />
        </label>

        <div className="bb-editor-body-header">
          <span className="bb-field__label bb-field__label--mode">{props.editorPane === "markdown" ? "Notes" : "Preview"}</span>
          <div className="bb-editor-mode">
            <ModeButton
              active={props.editorPane === "markdown"}
              label="Markdown"
              icon={<PencilSimple size={17} />}
              onClick={() => props.onEditorPaneChange("markdown")}
            />
            <ModeButton
              active={props.editorPane === "preview"}
              label="Preview"
              icon={<Eye size={17} />}
              onClick={() => props.onEditorPaneChange("preview")}
            />
          </div>
        </div>

        {props.editorPane === "markdown" ? (
          <label className="bb-field">
            <textarea
              value={props.editorNote?.bodyMarkdown ?? ""}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder="Write in Markdown"
              disabled={!props.editorNote}
              className="bb-textarea bb-note-content min-h-[30rem] text-sm leading-7"
            />
          </label>
        ) : (
          <div className="bb-pane-card min-h-[30rem]">
            <MarkdownPreview bodyMarkdown={props.editorNote.bodyMarkdown} />
          </div>
        )}

        <AttachmentList
          attachments={props.editorNote?.attachments ?? []}
          uploading={props.uploadingAttachment}
          disabled={!props.editorNote?.noteId}
          onUpload={props.onUpload}
          onInsertLink={props.onInsertLink}
          onInsertImage={props.onInsertImage}
          onDelete={props.onDeleteAttachment}
          onDownload={props.onDownloadAttachment}
        />

      </div>
      )}

      <div className="bb-editor-footer">
        <span>{props.statusText}</span>
      </div>
    </section>
  );
}

function CollapsedPaneRail(props: {
  label: string;
  onOpen(): void;
  ariaLabel?: string;
  titleText?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={props.ariaLabel ?? `Open ${props.label} pane`}
      title={props.titleText ?? `Open ${props.label} pane`}
      className="bb-collapsed-rail"
    >
      <span className="bb-collapsed-rail__action" aria-hidden="true">
        <CaretRight size={15} />
      </span>
    </button>
  );
}

function PaneResizeHandle(props: {
  testId: string;
  label: string;
  onPointerDown(event: ReactPointerEvent<HTMLButtonElement>): void;
  onNudge(delta: number): void;
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-label={props.label}
      title={props.label}
      onPointerDown={props.onPointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          props.onNudge(-KEYBOARD_RESIZE_STEP);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          props.onNudge(KEYBOARD_RESIZE_STEP);
        }
      }}
      className="bb-pane-resizer"
    >
      <span className="bb-pane-resizer__handle" aria-hidden="true">
        <span />
        <span />
      </span>
    </button>
  );
}

function MobileDrawer(props: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  if (!props.open) {
    return null;
  }

  return (
    <div className="bb-mobile-drawer lg:hidden">
      <div className="bb-mobile-drawer__panel">
        <div className="bb-mobile-drawer__header">
          <p className="bb-eyebrow">{props.title}</p>
          <button type="button" onClick={props.onClose} className={buttonGhost}>
            <CaretLeft size={18} />
            Close
          </button>
        </div>
        <div className="bb-mobile-drawer__body">{props.children}</div>
      </div>
    </div>
  );
}

function ModeButton(props: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className={`bb-editor-mode__button ${props.active ? "is-active" : ""}`}
    >
      {props.icon}
    </button>
  );
}

function createDraft(folderId: string | null): EditorState {
  return {
    noteId: null,
    folderId,
    title: "",
    bodyMarkdown: "",
    attachments: [],
    createdAt: null,
    updatedAt: null,
    isDraft: true
  };
}

function mapNoteDetail(note: NoteDetail): EditorState {
  return {
    noteId: note.id,
    folderId: note.folderId,
    title: note.title,
    bodyMarkdown: note.bodyMarkdown,
    attachments: note.attachments,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    isDraft: false
  };
}

function buildContentKey(folderId: string | null, title: string, bodyMarkdown: string) {
  return JSON.stringify({
    folderId,
    title: title.trim(),
    bodyMarkdown
  });
}

function getEditorStatus(props: {
  editorNote: EditorState | null;
  foldersCount: number;
  loadingEditor: boolean;
  saving: boolean;
}) {
  if (props.loadingEditor) {
    return "Loading note";
  }

  if (!props.editorNote) {
    return "No note selected";
  }

  if (props.saving) {
    return "Saving";
  }

  if (!props.foldersCount) {
    return "No notebooks yet";
  }

  if (!props.editorNote.folderId) {
    return "Select a notebook to save";
  }

  if (!props.editorNote.title.trim()) {
    return "Add a title to save";
  }

  if (props.editorNote.updatedAt) {
    return props.editorNote.updatedAt;
  }

  return "Draft";
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
