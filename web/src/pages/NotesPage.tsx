import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretLeft,
  CaretRight,
  CircleNotch,
  Code,
  Eye,
  FileArrowUp,
  FolderSimple,
  ImageSquare,
  ListBullets,
  Microphone,
  MusicNotesSimple,
  PencilSimple,
  Plus,
  Quotes,
  Table,
  TextB,
  TextItalic,
  TextStrikethrough,
  TextUnderline,
  Trash,
  VideoCamera
} from "@phosphor-icons/react";
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { formatMarkdownSelection, type MarkdownFormatKind } from "../utils/markdownFormat";
import { buildNotesPath } from "../utils/noteRoute";
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
const MEDIA_PLACEHOLDER_TITLE = "Untitled note";

type MediaInsertBehavior = "image" | "link" | "none";
type RecorderPhase = "closed" | "starting" | "recording" | "paused" | "processing" | "saving" | "recorded" | "error";

type PaneResizeTarget = "folders" | "notes";

interface PaneResizeState {
  target: PaneResizeTarget;
  startX: number;
  startWidth: number;
}

interface PendingNoteDelete {
  id: string;
  title: string;
}

export function NotesPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ folderId?: string; noteId?: string }>();
  const routeFolderId = params.folderId ?? null;
  const routeNoteId = params.noteId ?? null;
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(routeFolderId);
  const [createNotebookOpen, setCreateNotebookOpen] = useState(false);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [renameNotebookOpen, setRenameNotebookOpen] = useState(false);
  const [renameNotebookName, setRenameNotebookName] = useState("");
  const [renameNotebookId, setRenameNotebookId] = useState<string | null>(null);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(routeNoteId);
  const [editorNote, setEditorNote] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [editorPane, setEditorPane] = useState<EditorPane>("markdown");
  const [editorFullscreen, setEditorFullscreen] = useState(false);
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
  const [draggedNoteDeleteCandidate, setDraggedNoteDeleteCandidate] = useState<PendingNoteDelete | null>(null);
  const [pendingNoteDelete, setPendingNoteDelete] = useState<PendingNoteDelete | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<FolderNode | null>(null);
  const [lastSyncedContentKey, setLastSyncedContentKey] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const saveInFlightRef = useRef(false);
  const autosaveTimerRef = useRef<number | null>(null);
  const editorSessionRef = useRef(0);
  const notesRefreshRef = useRef(0);
  const noteLoadRef = useRef(0);
  const skipNextNoteLoadRef = useRef<string | null>(null);
  const syncingRouteRef = useRef(false);
  const previousRouteSelectionRef = useRef(JSON.stringify({
    folderId: routeFolderId,
    noteId: routeNoteId
  }));
  const selectedFolderIdRef = useRef(selectedFolderId);
  const deferredSearchRef = useRef(deferredSearch);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const currentContentKey = useMemo(
    () => (editorNote ? buildContentKey(editorNote.folderId, editorNote.title, editorNote.bodyMarkdown) : null),
    [editorNote]
  );
  const canPersistEditor = Boolean(editorNote?.folderId);
  const explorerCollapsed = folderPaneCollapsed && notePaneCollapsed;
  const canCreateDraft = selectedFolderId !== null;
  const canReorderNotes = Boolean(selectedFolderId && search.trim().length === 0);
  const canUseMediaActions = Boolean(editorNote?.folderId ?? selectedFolderId);

  selectedFolderIdRef.current = selectedFolderId;
  deferredSearchRef.current = deferredSearch;

  function updateSelectedFolderId(folderId: string | null) {
    selectedFolderIdRef.current = folderId;
    setSelectedFolderId(folderId);
  }

  useEffect(() => {
    const routeSelectionKey = JSON.stringify({
      folderId: routeFolderId,
      noteId: routeNoteId
    });
    if (previousRouteSelectionRef.current === routeSelectionKey) {
      return;
    }

    previousRouteSelectionRef.current = routeSelectionKey;
    syncingRouteRef.current = true;
    updateSelectedFolderId(routeFolderId);
    setSelectedNoteId(routeNoteId);
  }, [routeFolderId, routeNoteId]);

  useEffect(() => {
    if (syncingRouteRef.current) {
      if (selectedFolderId === routeFolderId && selectedNoteId === routeNoteId) {
        syncingRouteRef.current = false;
      }
      return;
    }

    const nextPath = buildNotesPath({
      folderId: selectedFolderId,
      noteId: selectedNoteId
    });
    const currentPath = buildNotesPath({
      folderId: routeFolderId,
      noteId: routeNoteId
    });
    if (nextPath === currentPath) {
      return;
    }

    navigate(nextPath);
  }, [navigate, routeFolderId, routeNoteId, selectedFolderId, selectedNoteId]);

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
      noteLoadRef.current += 1;
      setLoadingEditor(false);
      return;
    }

    if (skipNextNoteLoadRef.current === selectedNoteId) {
      skipNextNoteLoadRef.current = null;
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
        if (routeFolderId && routeFolderId !== note.folderId) {
          updateSelectedFolderId(note.folderId);
        }
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
  }, [auth.user, routeFolderId, selectedNoteId]);

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
    clearAutosaveTimer();
    autosaveTimerRef.current = window.setTimeout(async () => {
      autosaveTimerRef.current = null;
      const persisted = await persistEditorPayload(payload, sessionId);
      if (persisted) {
        skipNextNoteLoadRef.current = persisted.id;
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearAutosaveTimer();
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
        updateSelectedFolderId(null);
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
    showLoading?: boolean;
  }) {
    const requestId = ++notesRefreshRef.current;
    const nextFolderId = options?.folderId === undefined ? selectedFolderIdRef.current : options.folderId;
    const nextSearch = options?.search === undefined ? deferredSearchRef.current : options.search;
    const shouldShowLoading = options?.showLoading !== false;

    try {
      if (shouldShowLoading) {
        setLoadingNotes(true);
      }
      const payload = await listNotes({
        folderId: nextFolderId ?? undefined,
        q: nextSearch || undefined,
        sort: nextFolderId && !nextSearch ? "priority" : undefined,
        order: nextFolderId && !nextSearch ? "asc" : undefined
      });
      if (requestId !== notesRefreshRef.current) {
        return;
      }
      setNotes(payload.items);
    } catch (notesError) {
      if (requestId !== notesRefreshRef.current) {
        return;
      }
      setError(String(notesError));
    } finally {
      if (shouldShowLoading && requestId === notesRefreshRef.current) {
        setLoadingNotes(false);
      }
    }
  }

  function clearAutosaveTimer() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }

  async function waitForSaveInFlight() {
    while (saveInFlightRef.current) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }

  async function persistEditorPayload(
    payload: { noteId: string | null; folderId: string; title: string; bodyMarkdown: string },
    sessionId: number
  ) {
    const refreshFoldersAfterSave = !payload.noteId;
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
              return mapNoteDetail(persisted);
            }

            const sameRecord = current.noteId ? current.noteId === persisted.id : sessionId === editorSessionRef.current;
            if (!sameRecord) {
              return current;
            }

            return {
              ...current,
              noteId: persisted.id,
              folderId: persisted.folderId,
              title: current.title.trim() ? current.title : persisted.title,
              attachments: persisted.attachments,
              createdAt: persisted.createdAt,
              updatedAt: persisted.updatedAt,
              isDraft: false
            };
          });
        });
      }

      if (refreshFoldersAfterSave) {
        await Promise.all([refreshNotes({ showLoading: false }), refreshFolders()]);
      } else {
        await refreshNotes({ showLoading: false });
      }

      return persisted;
    } catch (saveError) {
      if (sessionId === editorSessionRef.current) {
        setError(String(saveError));
      }
      return null;
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  async function ensurePersistedNoteForMedia() {
    if (!auth.user) {
      return null;
    }

    if (editorNote?.noteId) {
      return editorNote.noteId;
    }

    const folderId = editorNote?.folderId ?? selectedFolderId;
    if (!folderId) {
      setError("Select a notebook to add media.");
      return null;
    }

    clearAutosaveTimer();
    await waitForSaveInFlight();

    if (editorNote?.noteId) {
      return editorNote.noteId;
    }

    if (!editorNote) {
      editorSessionRef.current += 1;
      noteLoadRef.current += 1;
      setSelectedNoteId(null);
    }

    const sessionId = editorSessionRef.current;
    const persisted = await persistEditorPayload(
      {
        noteId: editorNote?.noteId ?? null,
        folderId,
        title: editorNote?.title.trim() || MEDIA_PLACEHOLDER_TITLE,
        bodyMarkdown: editorNote?.bodyMarkdown ?? ""
      },
      sessionId
    );

    return persisted?.id ?? null;
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

  function openRenameNotebookDialog(folder: FolderNode) {
    setRenameNotebookId(folder.id);
    setRenameNotebookName(folder.name);
    setRenameNotebookOpen(true);
  }

  function closeRenameNotebookDialog() {
    setRenameNotebookOpen(false);
    setRenameNotebookId(null);
    setRenameNotebookName("");
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
      updateSelectedFolderId(created.id);
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
    if (!auth.user || !canCreateDraft || !selectedFolderId || saveInFlightRef.current) {
      return;
    }

    clearAutosaveTimer();
    setError(null);
    setFolderPaneCollapsed(false);
    setNotePaneCollapsed(false);
    setMobileNotesOpen(false);
    setEditorPane("markdown");

    const nextSessionId = editorSessionRef.current + 1;
    const previousEditor = editorNote;
    const previousContentKey = currentContentKey;
    const shouldPersistPreviousEditor = Boolean(previousEditor && previousContentKey && canPersistEditor && previousContentKey !== lastSyncedContentKey);

    editorSessionRef.current = nextSessionId;
    noteLoadRef.current += 1;
    setSelectedNoteId(null);
    setEditorNote(createDraft(selectedFolderId));
    setLastSyncedContentKey(null);

    saveInFlightRef.current = true;
    setSaving(true);

    void (async () => {
      try {
        if (previousEditor && shouldPersistPreviousEditor) {
          const refreshFoldersAfterSave = !previousEditor.noteId;

          if (previousEditor.noteId) {
            await updateNote(previousEditor.noteId, {
              folderId: previousEditor.folderId as string,
              title: previousEditor.title.trim(),
              bodyMarkdown: previousEditor.bodyMarkdown
            });
          } else {
            await createNote({
              folderId: previousEditor.folderId as string,
              title: previousEditor.title.trim(),
              bodyMarkdown: previousEditor.bodyMarkdown
            });
          }

          if (refreshFoldersAfterSave) {
            await Promise.all([refreshNotes(), refreshFolders()]);
          } else {
            await refreshNotes();
          }
        }

        const created = await createNote({
          folderId: selectedFolderId,
          title: "",
          bodyMarkdown: ""
        });

        if (nextSessionId === editorSessionRef.current) {
          setLastSyncedContentKey(buildContentKey(created.folderId, created.title, created.bodyMarkdown));
          skipNextNoteLoadRef.current = created.id;
          startTransition(() => {
            setSelectedNoteId(created.id);
            setEditorNote((current) => {
              if (!current || current.noteId || current.folderId !== created.folderId) {
                return current;
              }

              return {
                ...current,
                noteId: created.id,
                attachments: created.attachments,
                createdAt: created.createdAt,
                updatedAt: created.updatedAt,
                isDraft: false
              };
            });
          });
        }

        await Promise.all([refreshNotes(), refreshFolders()]);
      } catch (noteError) {
        setError(String(noteError));
      } finally {
        saveInFlightRef.current = false;
        setSaving(false);
      }
    })();
  }

  function handleSelectFolder(folderId: string | null) {
    updateSelectedFolderId(folderId);
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
      updateSelectedFolderId(folderId);
      setFolderPaneCollapsed(false);
      setNotePaneCollapsed(false);
      setMobileFoldersOpen(false);
      setMobileNotesOpen(false);

      if (movingSelectedNote) {
        setSelectedNoteId(noteId);
        setEditorNote(mapNoteDetail(movedNote));
        setLastSyncedContentKey(buildContentKey(movedNote.folderId, movedNote.title, movedNote.bodyMarkdown));
      } else {
        setSelectedNoteId(null);
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
    setDraggedNoteDeleteCandidate(null);
    setPendingNoteDelete({
      id: editorNote.noteId,
      title: editorNote.title.trim() || "Untitled note"
    });
  }

  function handleRequestDeleteNote(note: PendingNoteDelete) {
    setDraggedNoteDeleteCandidate(null);
    setPendingNoteDelete({
      id: note.id,
      title: note.title.trim() || "Untitled note"
    });
  }

  async function handleDeleteNote() {
    if (!auth.user || !pendingNoteDelete) {
      return;
    }

    const noteId = pendingNoteDelete.id;
    const deletingSelectedNote = selectedNoteId === noteId || editorNote?.noteId === noteId;
    const previousNotes = notes;
    setError(null);
    setNotes((current) => current.filter((note) => note.id !== noteId));

    try {
      await deleteNote(noteId);
      editorSessionRef.current += 1;
      noteLoadRef.current += 1;
      setPendingNoteDelete(null);

      if (deletingSelectedNote) {
        setEditorNote(null);
        setSelectedNoteId(null);
        setLastSyncedContentKey(null);
      }

      await Promise.all([refreshNotes(), refreshFolders()]);
    } catch (deleteError) {
      setNotes(previousNotes);
      setError(String(deleteError));
    }
  }

  async function handleRenameNotebook() {
    if (!auth.user || !renameNotebookId || !renameNotebookName.trim()) {
      return;
    }

    const folder = folders.find((entry) => entry.id === renameNotebookId);
    if (!folder) {
      closeRenameNotebookDialog();
      return;
    }

    setError(null);

    try {
      await updateFolder(renameNotebookId, {
        name: renameNotebookName.trim(),
        icon: folder.icon,
        parentId: folder.parentId
      });
      closeRenameNotebookDialog();
      await refreshFolders();
    } catch (folderError) {
      setError(String(folderError));
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
        updateSelectedFolderId(null);
      }
      setPendingFolderDelete(null);
      await Promise.all([refreshFolders(), refreshNotes({ folderId: null })]);
    } catch (deleteError) {
      setError(String(deleteError));
    }
  }

  async function handleUploadSelectedFile(file: File | null, insertBehavior: MediaInsertBehavior) {
    if (!auth.user || !file) {
      return false;
    }

    const noteId = await ensurePersistedNoteForMedia();
    if (!noteId) {
      return false;
    }

    setUploadingAttachment(true);
    setError(null);

    try {
      const uploaded = await uploadAttachment(noteId, file);
      const refreshed = await getNote(noteId);
      setEditorNote((current) => {
        const baseBodyMarkdown = current?.noteId === noteId ? current.bodyMarkdown : refreshed.bodyMarkdown;
        return {
          ...mapNoteDetail(refreshed),
          bodyMarkdown: applyUploadedAttachmentMarkup(baseBodyMarkdown, uploaded, insertBehavior)
        };
      });
      setLastSyncedContentKey(buildContentKey(refreshed.folderId, refreshed.title, refreshed.bodyMarkdown));
      await refreshNotes();
      return true;
    } catch (uploadError) {
      setError(String(uploadError));
      return false;
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
        bodyMarkdown: appendMarkdownSnippet(current.bodyMarkdown, snippet)
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

      <div
        className={[
          "hidden min-h-0 flex-1 items-stretch overflow-hidden lg:flex",
          editorFullscreen ? "bb-workspace-shell--editor-fullscreen" : ""
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {editorFullscreen ? null : explorerCollapsed ? (
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
                    draggedNote={draggedNoteDeleteCandidate}
                    onCreateNotebook={openCreateNotebookDialog}
                    onMoveNotebook={(move) => void handleMoveNotebook(move)}
                    onMoveNote={(noteId, folderId) => void handleMoveNoteToNotebook(noteId, folderId)}
                    onRenameNotebook={openRenameNotebookDialog}
                    onRequestDeleteNote={handleRequestDeleteNote}
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
                    onDraggedNoteChange={setDraggedNoteDeleteCandidate}
                    onRequestDeleteNote={handleRequestDeleteNote}
                    onCollapse={() => setNotePaneCollapsed(true)}
                    loading={loadingNotes}
                    notebookName={selectedFolder?.name ?? null}
                    canCreateNote={canCreateDraft}
                    canReorder={canReorderNotes}
                    enableCrossNotebookMove={selectedFolderId !== null}
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
          panelTestId="editor-panel-desktop"
          editorNote={editorNote}
          editorPane={editorPane}
          showFullscreenToggle
          isFullscreen={editorFullscreen}
          canUseMediaActions={canUseMediaActions}
          mediaActionDisabledReason="Select a notebook to add media."
          onEditorPaneChange={setEditorPane}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onToggleFullscreen={() => setEditorFullscreen((current) => !current)}
          onDeleteRequest={handleRequestDeleteCurrentNote}
          onUploadSelectedFile={(file, insertBehavior) => handleUploadSelectedFile(file, insertBehavior)}
          onInsertLink={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertImage={(attachment) => appendToBody(`![${attachment.name}](${attachment.url})`)}
          onInsertAudio={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertVideo={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
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
          panelTestId="editor-panel-mobile"
          editorNote={editorNote}
          editorPane={editorPane}
          isFullscreen={false}
          canUseMediaActions={canUseMediaActions}
          mediaActionDisabledReason="Select a notebook to add media."
          onEditorPaneChange={setEditorPane}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onToggleFullscreen={() => undefined}
          onDeleteRequest={handleRequestDeleteCurrentNote}
          onUploadSelectedFile={(file, insertBehavior) => handleUploadSelectedFile(file, insertBehavior)}
          onInsertLink={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertImage={(attachment) => appendToBody(`![${attachment.name}](${attachment.url})`)}
          onInsertAudio={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
          onInsertVideo={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
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
          draggedNote={draggedNoteDeleteCandidate}
          onCreateNotebook={openCreateNotebookDialog}
          onMoveNotebook={(move) => void handleMoveNotebook(move)}
          onMoveNote={(noteId, folderId) => void handleMoveNoteToNotebook(noteId, folderId)}
          onRenameNotebook={openRenameNotebookDialog}
          onRequestDeleteNote={handleRequestDeleteNote}
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
          onDraggedNoteChange={setDraggedNoteDeleteCandidate}
          onRequestDeleteNote={handleRequestDeleteNote}
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
      <TextPromptDialog
        open={renameNotebookOpen}
        title="Rename notebook"
        description="Double-click a notebook in the tree to change its name."
        value={renameNotebookName}
        placeholder="Notebook name"
        confirmLabel="Rename notebook"
        onChange={setRenameNotebookName}
        onClose={closeRenameNotebookDialog}
        onConfirm={() => void handleRenameNotebook()}
      />

      <ConfirmationDialog
        open={pendingNoteDelete !== null}
        title="Delete note?"
        description={pendingNoteDelete ? `${pendingNoteDelete.title} will be removed permanently.` : undefined}
        confirmLabel="Delete note"
        tone="danger"
        onClose={() => setPendingNoteDelete(null)}
        onConfirm={() => void handleDeleteNote()}
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
  panelTestId?: string;
  editorNote: EditorState | null;
  editorPane: EditorPane;
  showFullscreenToggle?: boolean;
  isFullscreen: boolean;
  canUseMediaActions: boolean;
  mediaActionDisabledReason: string;
  onEditorPaneChange(value: EditorPane): void;
  onTitleChange(title: string): void;
  onBodyChange(bodyMarkdown: string): void;
  onToggleFullscreen(): void;
  onDeleteRequest(): void;
  onUploadSelectedFile(file: File | null, insertBehavior: MediaInsertBehavior): Promise<boolean>;
  onInsertLink(attachment: AttachmentRef): void;
  onInsertImage(attachment: AttachmentRef): void;
  onInsertAudio(attachment: AttachmentRef): void;
  onInsertVideo(attachment: AttachmentRef): void;
  onDeleteAttachment(attachmentId: string): void;
  onDownloadAttachment(attachment: AttachmentRef): void;
  statusText: string;
  loading: boolean;
  saving: boolean;
  uploadingAttachment: boolean;
  error: string | null;
}) {
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formatSelectionFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingElapsedOffsetRef = useRef(0);
  const [recorderState, setRecorderState] = useState<{
    phase: RecorderPhase;
    blob: Blob | null;
    error: string | null;
    previewUrl: string | null;
  }>({
    phase: "closed",
    blob: null,
    error: null,
    previewUrl: null
  });
  const [recordingElapsedMs, setRecordingElapsedMs] = useState(0);
  const [savingRecording, setSavingRecording] = useState(false);
  const mediaActionsDisabled = props.loading || props.uploadingAttachment || savingRecording || !props.canUseMediaActions;
  const formatActionsDisabled = !props.editorNote || props.editorPane !== "markdown";
  const hasAttachments = (props.editorNote?.attachments.length ?? 0) > 0;

  useEffect(() => {
    return () => {
      if (formatSelectionFrameRef.current !== null) {
        window.cancelAnimationFrame(formatSelectionFrameRef.current);
      }
      discardRecordingRef.current = true;
      stopRecorder();
      clearRecorderClip();
    };
  }, []);

  useEffect(() => {
    if (recorderState.phase !== "recording") {
      return;
    }

    const syncElapsed = () => {
      setRecordingElapsedMs(getRecorderElapsedMs(recordingStartedAtRef.current, recordingElapsedOffsetRef.current));
    };

    syncElapsed();
    const intervalId = window.setInterval(syncElapsed, 250);
    return () => window.clearInterval(intervalId);
  }, [recorderState.phase]);

  function resetRecorderProgress() {
    recordingStartedAtRef.current = null;
    recordingElapsedOffsetRef.current = 0;
    setRecordingElapsedMs(0);
  }

  function captureRecorderElapsedMs() {
    return getRecorderElapsedMs(recordingStartedAtRef.current, recordingElapsedOffsetRef.current);
  }

  function clearRecorderClip() {
    resetRecorderProgress();
    setRecorderState((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return {
        phase: "closed",
        blob: null,
        error: null,
        previewUrl: null
      };
    });
  }

  function stopRecorderStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function stopRecorder() {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    stopRecorderStream();
  }

  function openFilePicker(inputRef: { current: HTMLInputElement | null }) {
    inputRef.current?.click();
  }

  async function handleInputSelection(input: HTMLInputElement, insertBehavior: MediaInsertBehavior) {
    const [file] = Array.from(input.files ?? []);
    input.value = "";
    if (!file) {
      return;
    }

    await props.onUploadSelectedFile(file, insertBehavior);
  }

  async function handleStartRecording() {
    if (mediaActionsDisabled) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      resetRecorderProgress();
      setRecorderState({
        phase: "error",
        blob: null,
        error: "Voice recording is not supported in this browser.",
        previewUrl: null
      });
      return;
    }

    discardRecordingRef.current = false;
    clearRecorderClip();
    setRecorderState({
      phase: "starting",
      blob: null,
      error: null,
      previewUrl: null
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedAudioRecorderMimeType();
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const clip = recordedChunksRef.current.length
          ? new Blob(recordedChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" })
          : null;

        recordedChunksRef.current = [];
        stopRecorderStream();
        mediaRecorderRef.current = null;

        if (discardRecordingRef.current || !clip) {
          discardRecordingRef.current = false;
          clearRecorderClip();
          return;
        }

        void persistRecordingClip(clip);
      });

      recorder.start();
      recordingStartedAtRef.current = Date.now();
      recordingElapsedOffsetRef.current = 0;
      setRecordingElapsedMs(0);
      setRecorderState({
        phase: "recording",
        blob: null,
        error: null,
        previewUrl: null
      });
    } catch (error) {
      stopRecorderStream();
      mediaRecorderRef.current = null;
      resetRecorderProgress();
      setRecorderState({
        phase: "error",
        blob: null,
        error: formatRecorderError(error),
        previewUrl: null
      });
    }
  }

  function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || (recorder.state !== "recording" && recorder.state !== "paused")) {
      return;
    }

    const elapsedMs = captureRecorderElapsedMs();
    recordingStartedAtRef.current = null;
    recordingElapsedOffsetRef.current = elapsedMs;
    setRecordingElapsedMs(elapsedMs);
    setRecorderState((current) => ({
      ...current,
      phase: "processing"
    }));
    recorder.stop();
  }

  function handlePauseRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording" || typeof recorder.pause !== "function") {
      return;
    }

    const elapsedMs = captureRecorderElapsedMs();
    recordingStartedAtRef.current = null;
    recordingElapsedOffsetRef.current = elapsedMs;
    setRecordingElapsedMs(elapsedMs);
    recorder.pause();
    setRecorderState((current) => ({
      ...current,
      phase: "paused"
    }));
  }

  function handleResumeRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused" || typeof recorder.resume !== "function") {
      return;
    }

    recordingStartedAtRef.current = Date.now();
    setRecordingElapsedMs(recordingElapsedOffsetRef.current);
    recorder.resume();
    setRecorderState((current) => ({
      ...current,
      phase: "recording"
    }));
  }

  function handleDiscardRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === "recording" || recorder.state === "paused")) {
      discardRecordingRef.current = true;
      const elapsedMs = captureRecorderElapsedMs();
      recordingStartedAtRef.current = null;
      recordingElapsedOffsetRef.current = elapsedMs;
      setRecordingElapsedMs(elapsedMs);
      setRecorderState((current) => ({
        ...current,
        phase: "processing"
      }));
      recorder.stop();
      return;
    }

    discardRecordingRef.current = false;
    clearRecorderClip();
  }

  async function persistRecordingClip(clip: Blob) {
    setSavingRecording(true);
    setRecorderState((current) => {
      if (current.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }

      return {
        phase: "saving",
        blob: clip,
        error: null,
        previewUrl: null
      };
    });

    const fileName = `voice-note-${new Date().toISOString().replace(/[^\d]/g, "").slice(0, 14)}${extensionForMimeType(clip.type)}`;

    try {
      const uploaded = await props.onUploadSelectedFile(
        new File([clip], fileName, {
          type: clip.type || "audio/webm"
        }),
        "link"
      );

      if (uploaded) {
        clearRecorderClip();
        return true;
      }

      const previewUrl = URL.createObjectURL(clip);
      setRecorderState({
        phase: "recorded",
        blob: clip,
        error: "Voice note could not be attached. Try again or discard it.",
        previewUrl
      });
      return false;
    } catch (error) {
      const previewUrl = URL.createObjectURL(clip);
      setRecorderState({
        phase: "recorded",
        blob: clip,
        error: formatRecorderError(error),
        previewUrl
      });
      return false;
    } finally {
      setSavingRecording(false);
    }
  }

  async function handleSaveRecording() {
    if (!recorderState.blob) {
      return;
    }

    await persistRecordingClip(recorderState.blob);
  }

  function handleApplyMarkdownFormat(kind: MarkdownFormatKind) {
    if (!props.editorNote || props.editorPane !== "markdown") {
      return;
    }

    const textarea = bodyTextareaRef.current;
    if (!textarea) {
      return;
    }

    const { nextValue, nextSelectionStart, nextSelectionEnd } = formatMarkdownSelection(
      props.editorNote.bodyMarkdown,
      textarea.selectionStart,
      textarea.selectionEnd,
      kind
    );

    props.onBodyChange(nextValue);
    if (formatSelectionFrameRef.current !== null) {
      window.cancelAnimationFrame(formatSelectionFrameRef.current);
    }

    formatSelectionFrameRef.current = window.requestAnimationFrame(() => {
      formatSelectionFrameRef.current = null;
      const nextTextarea = bodyTextareaRef.current;
      if (!nextTextarea || nextTextarea.value !== nextValue) {
        return;
      }

      nextTextarea.focus();
      nextTextarea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  }

  const recorderSummaryText = getRecorderSummaryText(recorderState.phase, recorderState.error);
  const showRecorderProgress = recorderState.phase === "recording" || recorderState.phase === "paused";
  const formattedRecorderElapsed = formatRecorderDuration(recordingElapsedMs);
  const recorderProgressValueText =
    recorderState.phase === "paused"
      ? `Recording paused at ${formattedRecorderElapsed}`
      : `Recording for ${formattedRecorderElapsed}`;
  const formatToolbarDisabledTitle = !props.editorNote ? "Select a note to format text." : "Switch to Markdown to format text.";
  const editorMode = (
    <div className="bb-editor-mode">
      <ModeButton
        active={props.editorPane === "markdown"}
        disabled={!props.editorNote}
        label="Markdown"
        icon={<PencilSimple size={17} />}
        onClick={() => props.onEditorPaneChange("markdown")}
      />
      <ModeButton
        active={props.editorPane === "preview"}
        disabled={!props.editorNote}
        label="Preview"
        icon={<Eye size={17} />}
        onClick={() => props.onEditorPaneChange("preview")}
      />
    </div>
  );
  const mediaToolbar = (
    <div className="bb-editor-toolbar-group bb-editor-media-toolbar" data-testid="editor-media-toolbar">
      <MediaToolbarButton
        label="Add image"
        icon={<ImageSquare size={17} />}
        disabled={mediaActionsDisabled}
        disabledTitle={props.mediaActionDisabledReason}
        onClick={() => openFilePicker(imageInputRef)}
      />
      <MediaToolbarButton
        label="Add audio"
        icon={<MusicNotesSimple size={17} />}
        disabled={mediaActionsDisabled}
        disabledTitle={props.mediaActionDisabledReason}
        onClick={() => openFilePicker(audioInputRef)}
      />
      <MediaToolbarButton
        label="Add video"
        icon={<VideoCamera size={17} />}
        disabled={mediaActionsDisabled}
        disabledTitle={props.mediaActionDisabledReason}
        onClick={() => openFilePicker(videoInputRef)}
      />
      <MediaToolbarButton
        label="Record voice"
        icon={<Microphone size={17} />}
        disabled={mediaActionsDisabled || recorderState.phase === "starting" || recorderState.phase === "processing"}
        disabledTitle={props.mediaActionDisabledReason}
        active={
          recorderState.phase === "recording" ||
          recorderState.phase === "paused" ||
          recorderState.phase === "saving" ||
          recorderState.phase === "recorded"
        }
        onClick={() => void handleStartRecording()}
      />
      <MediaToolbarButton
        label="Upload file"
        icon={<FileArrowUp size={17} />}
        disabled={mediaActionsDisabled}
        disabledTitle={props.mediaActionDisabledReason}
        onClick={() => openFilePicker(fileInputRef)}
      />
    </div>
  );
  const formattingToolbar = props.editorNote ? (
    <div className="bb-editor-toolbar-group bb-editor-format-toolbar" data-testid="editor-format-toolbar">
      <MediaToolbarButton
        label="Bold"
        icon={<TextB size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("bold")}
      />
      <MediaToolbarButton
        label="Italic"
        icon={<TextItalic size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("italic")}
      />
      <MediaToolbarButton
        label="Underline"
        icon={<TextUnderline size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("underline")}
      />
      <MediaToolbarButton
        label="Strikethrough"
        icon={<TextStrikethrough size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("strikethrough")}
      />
      <MediaToolbarButton
        label="Inline code"
        icon={<Code size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("code")}
      />
      <MediaToolbarButton
        label="Quote"
        icon={<Quotes size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("quote")}
      />
      <MediaToolbarButton
        label="Bulleted list"
        icon={<ListBullets size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("bulleted-list")}
      />
      <MediaToolbarButton
        label="Insert table"
        icon={<Table size={17} />}
        disabled={formatActionsDisabled}
        disabledTitle={formatToolbarDisabledTitle}
        preserveFocus
        onClick={() => handleApplyMarkdownFormat("table")}
      />
    </div>
  ) : null;
  const recorderPanel =
    recorderState.phase !== "closed" ? (
      <div className="bb-panel-note">
        <div className="bb-recorder-panel">
          <div className="bb-recorder-panel__copy">
            <p className="text-sm font-medium tracking-tight text-[color:var(--ink)]">
              {getRecorderTitle(recorderState.phase)}
            </p>
            {recorderSummaryText ? (
              <p className="text-sm text-[color:var(--ink-soft)]">
                {recorderSummaryText}
              </p>
            ) : null}
          </div>
          {showRecorderProgress ? (
            <div className="bb-recorder-progress">
              <div className="bb-recorder-progress__meta">
                <span className={`bb-recorder-progress__status${recorderState.phase === "paused" ? " is-paused" : ""}`}>
                  {recorderState.phase === "paused" ? "Paused" : "Live recording"}
                </span>
                <span className="bb-recorder-progress__time" data-testid="recorder-progress-time">
                  {formattedRecorderElapsed}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Recording progress"
                aria-valuetext={recorderProgressValueText}
                className={`bb-recorder-progress__track${recorderState.phase === "paused" ? " is-paused" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`bb-recorder-progress__fill${recorderState.phase === "paused" ? " is-paused" : ""}`}
                />
              </div>
            </div>
          ) : null}
          {recorderState.previewUrl ? (
            <audio controls preload="metadata" src={recorderState.previewUrl} className="bb-recorder-panel__preview" />
          ) : null}
          <div className="bb-recorder-panel__actions">
            {recorderState.phase === "recording" || recorderState.phase === "paused" ? (
              <button type="button" onClick={handleStopRecording} className={buttonSecondary}>
                Stop
              </button>
            ) : null}
            {recorderState.phase === "recording" ? (
              <button type="button" onClick={handlePauseRecording} className={buttonSecondary}>
                Pause
              </button>
            ) : null}
            {recorderState.phase === "paused" ? (
              <button type="button" onClick={handleResumeRecording} className={buttonSecondary}>
                Resume
              </button>
            ) : null}
            {recorderState.phase === "recorded" ? (
              <button
                type="button"
                onClick={() => void handleSaveRecording()}
                disabled={savingRecording || props.uploadingAttachment}
                className={buttonPrimary}
              >
                Retry save
              </button>
            ) : null}
            {recorderState.phase === "error" ? (
              <button type="button" onClick={() => void handleStartRecording()} className={buttonSecondary}>
                Try again
              </button>
            ) : null}
            {recorderState.phase === "recorded" ? (
              <button type="button" onClick={handleDiscardRecording} className={buttonSecondary}>
                Discard
              </button>
            ) : null}
            {recorderState.phase === "error" ? (
              <button type="button" onClick={handleDiscardRecording} className={buttonSecondary}>
                Close
              </button>
            ) : null}
          </div>
        </div>
      </div>
    ) : null;

  return (
    <section
      data-testid={props.panelTestId}
      className={[
        "bb-editor-panel bb-editor-panel--workspace lg:flex-1",
        props.isFullscreen ? "bb-editor-panel--fullscreen" : ""
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="bb-editor-header">
        {props.editorNote ? (
          <label className="bb-editor-titlebar">
            <span className="bb-editor-titlebar__label">Title</span>
            <input
              value={props.editorNote.title}
              onChange={(event) => props.onTitleChange(event.target.value)}
              placeholder="Note title"
              disabled={!props.editorNote}
              className="bb-input bb-editor-titlebar__input text-lg font-medium tracking-tight"
            />
          </label>
        ) : (
          <div className="bb-editor-header__spacer" aria-hidden="true" />
        )}
        <div className="bb-editor-header__actions">
          {editorMode}
          {props.showFullscreenToggle ? (
            <button
              type="button"
              onClick={props.onToggleFullscreen}
              aria-label={props.isFullscreen ? "Exit fullscreen editor" : "Expand editor"}
              title={props.isFullscreen ? "Exit fullscreen editor" : "Expand editor"}
              className={`bb-icon-button bb-icon-button--toolbar bb-icon-button--accent${props.isFullscreen ? " bb-icon-button--is-active" : ""}`}
            >
              {props.isFullscreen ? <ArrowsInSimple size={17} /> : <ArrowsOutSimple size={17} />}
            </button>
          ) : null}
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

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="media-input-image"
        onChange={(event) => void handleInputSelection(event.currentTarget, "image")}
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        data-testid="media-input-audio"
        onChange={(event) => void handleInputSelection(event.currentTarget, "link")}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        data-testid="media-input-video"
        onChange={(event) => void handleInputSelection(event.currentTarget, "link")}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        data-testid="media-input-file"
        onChange={(event) => void handleInputSelection(event.currentTarget, "none")}
      />

      {props.error ? (
        <p className="bb-error-banner text-sm">{props.error}</p>
      ) : null}

      {props.loading ? (
        <div className="bb-editor-panel__content bb-editor-panel__content--empty">
          <div className="bb-empty-state bb-empty-state--center text-sm">
            <span className="inline-flex items-center gap-2">
              <CircleNotch size={18} className="animate-spin text-[color:var(--accent-strong)]" />
              Loading note
            </span>
          </div>
        </div>
      ) : !props.editorNote ? (
        <div className="bb-editor-panel__content bb-editor-panel__content--empty">
          <div className="bb-editor-toolbar-row">{mediaToolbar}</div>

          {recorderPanel}

          <div className="bb-empty-state bb-empty-state--center px-6 py-8">
            <div className="space-y-2">
              <p className="text-sm font-medium tracking-tight text-[color:var(--ink)]">No note selected</p>
              <p className="text-sm text-[color:var(--ink-soft)]">
                {props.canUseMediaActions ? "Choose a media action or start a new draft." : "Select a notebook to add media or start a new draft."}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bb-editor-panel__content bb-editor-panel__content--editor">
          <div className="bb-editor-toolbar-row">
            {mediaToolbar}
            {formattingToolbar ? <span className="bb-editor-toolbar-divider" aria-hidden="true" /> : null}
            {formattingToolbar}
          </div>

          {recorderPanel}

          <div className={`bb-editor-stack ${hasAttachments ? "" : "bb-editor-stack--fill"}`}>
            {props.editorPane === "markdown" ? (
              <label className={`bb-field ${hasAttachments ? "" : "bb-field--stretch"}`}>
                <textarea
                  ref={bodyTextareaRef}
                  value={props.editorNote.bodyMarkdown}
                  onChange={(event) => props.onBodyChange(event.target.value)}
                  placeholder="Write in Markdown"
                  disabled={!props.editorNote}
                  className="bb-textarea bb-editor-surface bb-note-content text-sm leading-7"
                />
              </label>
            ) : (
              <div className={`bb-pane-card bb-editor-preview ${hasAttachments ? "" : "bb-editor-preview--grow"}`}>
                <MarkdownPreview bodyMarkdown={props.editorNote.bodyMarkdown} attachments={props.editorNote.attachments} />
              </div>
            )}

            {hasAttachments ? (
              <AttachmentList
                attachments={props.editorNote.attachments}
                disabled={!props.editorNote.noteId || props.uploadingAttachment}
                onInsertLink={props.onInsertLink}
                onInsertImage={props.onInsertImage}
                onInsertAudio={props.onInsertAudio}
                onInsertVideo={props.onInsertVideo}
                onDelete={props.onDeleteAttachment}
                onDownload={props.onDownloadAttachment}
              />
            ) : null}
          </div>
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
  disabled?: boolean;
  label: string;
  icon: ReactNode;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
      className={`bb-editor-mode__button ${props.active ? "is-active" : ""}`}
    >
      {props.icon}
    </button>
  );
}

function MediaToolbarButton(props: {
  active?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  icon: ReactNode;
  label: string;
  preserveFocus?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        if (props.preserveFocus && !props.disabled) {
          event.preventDefault();
        }
      }}
      onMouseDown={(event) => {
        if (props.preserveFocus && !props.disabled) {
          event.preventDefault();
        }
      }}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.disabled ? props.disabledTitle ?? props.label : props.label}
      className={`bb-icon-button bb-icon-button--toolbar bb-icon-button--accent ${props.active ? "bb-icon-button--is-active" : ""}`}
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

function appendMarkdownSnippet(bodyMarkdown: string, snippet: string) {
  return `${bodyMarkdown}${bodyMarkdown.endsWith("\n") || bodyMarkdown.length === 0 ? "" : "\n"}${snippet}`;
}

function applyUploadedAttachmentMarkup(bodyMarkdown: string, attachment: AttachmentRef, insertBehavior: MediaInsertBehavior) {
  if (insertBehavior === "image") {
    return appendMarkdownSnippet(bodyMarkdown, `![${attachment.name}](${attachment.url})`);
  }

  if (insertBehavior === "link") {
    return appendMarkdownSnippet(bodyMarkdown, `[${attachment.name}](${attachment.url})`);
  }

  return bodyMarkdown;
}

function pickSupportedAudioRecorderMimeType() {
  if (typeof window.MediaRecorder === "undefined" || typeof window.MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4"
  ];

  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) ?? null;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return ".ogg";
  }

  if (mimeType.includes("mp4")) {
    return ".mp4";
  }

  return ".webm";
}

function getRecorderTitle(phase: RecorderPhase) {
  if (phase === "recording") {
    return "Recording voice note";
  }

  if (phase === "paused") {
    return "Recording paused";
  }

  if (phase === "starting") {
    return "Preparing microphone";
  }

  if (phase === "processing") {
    return "Processing recording";
  }

  if (phase === "saving") {
    return "Saving voice note";
  }

  if (phase === "recorded") {
    return "Voice note ready";
  }

  if (phase === "error") {
    return "Voice recorder unavailable";
  }

  return "";
}

function getRecorderSummaryText(phase: RecorderPhase, error: string | null) {
  if (phase === "paused") {
    return "Resume when you're ready to keep going.";
  }

  if (phase === "starting") {
    return "Requesting microphone access.";
  }

  if (phase === "processing") {
    return "Finishing the recorded clip.";
  }

  if (phase === "saving") {
    return "Attaching the clip to this note.";
  }

  if (phase === "recorded") {
    return error;
  }

  if (phase === "error") {
    return error;
  }

  return null;
}

function getRecorderElapsedMs(recordingStartedAt: number | null, recordingElapsedOffsetMs: number) {
  if (recordingStartedAt === null) {
    return recordingElapsedOffsetMs;
  }

  return Math.max(0, recordingElapsedOffsetMs + (Date.now() - recordingStartedAt));
}

function formatRecorderDuration(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRecorderError(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied.";
  }

  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found on this device.";
  }

  return "Voice recording could not be started.";
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

  if (props.editorNote.updatedAt) {
    return props.editorNote.updatedAt;
  }

  return "Draft";
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
