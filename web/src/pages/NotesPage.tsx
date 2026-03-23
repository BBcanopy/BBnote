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
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  createFolder,
  createNote,
  deleteAttachment,
  deleteNote,
  fetchAttachmentBlob,
  getNote,
  listFolders,
  listNotes,
  updateFolder,
  updateNote,
  uploadAttachment
} from "../api/client";
import type { AttachmentRef, FolderNode, NoteDetail, NoteSummary } from "../api/types";
import { useAuth } from "../auth/AuthProvider";
import { AttachmentList } from "../components/AttachmentList";
import { buttonDanger, buttonGhost, buttonPrimary, buttonSecondary } from "../components/buttonStyles";
import { FolderTree } from "../components/FolderTree";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { NoteListPane } from "../components/NoteListPane";
import { buildFolderMutations, moveFolders, type FolderMoveInstruction } from "../utils/folderTree";

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

export function NotesPage() {
  const auth = useAuth();
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [pendingFolderName, setPendingFolderName] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorNote, setEditorNote] = useState<EditorState | null>(null);
  const [search, setSearch] = useState("");
  const [editorPane, setEditorPane] = useState<EditorPane>("markdown");
  const [folderPaneCollapsed, setFolderPaneCollapsed] = useState(false);
  const [notePaneCollapsed, setNotePaneCollapsed] = useState(false);
  const [mobileFoldersOpen, setMobileFoldersOpen] = useState(false);
  const [mobileNotesOpen, setMobileNotesOpen] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedContentKey, setLastSyncedContentKey] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const saveInFlightRef = useRef(false);
  const editorSessionRef = useRef(0);
  const noteLoadRef = useRef(0);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const editorFolder = useMemo(
    () => folders.find((folder) => folder.id === editorNote?.folderId) ?? null,
    [editorNote?.folderId, folders]
  );
  const currentContentKey = useMemo(
    () => (editorNote ? buildContentKey(editorNote.folderId, editorNote.title, editorNote.bodyMarkdown) : null),
    [editorNote]
  );
  const canPersistEditor = Boolean(editorNote?.folderId && editorNote.title.trim().length > 0);
  const explorerCollapsed = folderPaneCollapsed && notePaneCollapsed;

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

        await refreshNotes();
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

  async function refreshNotes() {
    try {
      setLoadingNotes(true);
      const payload = await listNotes({
        folderId: selectedFolderId ?? undefined,
        q: deferredSearch || undefined
      });
      setNotes(payload.items);
    } catch (notesError) {
      setError(String(notesError));
    } finally {
      setLoadingNotes(false);
    }
  }

  async function handleCreateNotebook() {
    if (!auth.user || !pendingFolderName.trim()) {
      return;
    }

    setError(null);

    try {
      const created = await createFolder({
        name: pendingFolderName.trim(),
        parentId: selectedFolderId
      });
      setPendingFolderName("");
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
    const changedFolders = nextMutations.filter((mutation) => {
      const previous = previousMutations.get(mutation.id);
      return !previous || previous.parentId !== mutation.parentId || previous.sortOrder !== mutation.sortOrder;
    });

    setError(null);
    setFolders(nextFolders);

    try {
      await Promise.all(
        changedFolders.map((mutation) => {
          const folder = nextFolders.find((entry) => entry.id === mutation.id);
          if (!folder) {
            return Promise.resolve();
          }

          return updateFolder(mutation.id, {
            name: folder.name,
            parentId: mutation.parentId,
            sortOrder: mutation.sortOrder
          });
        })
      );
      await refreshFolders();
    } catch (moveError) {
      setFolders(previousFolders);
      setError(String(moveError));
      await refreshFolders();
    }
  }

  function handleCreateDraft() {
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
    setFolderPaneCollapsed(true);
    setNotePaneCollapsed(true);
    setMobileNotesOpen(false);
  }

  function handleEditorFolderChange(nextFolderId: string | null) {
    setEditorNote((current) => (current ? { ...current, folderId: nextFolderId } : current));
    setSelectedFolderId(nextFolderId);
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
      setEditorNote(null);
      setSelectedNoteId(null);
      setLastSyncedContentKey(null);
      setFolderPaneCollapsed(false);
      setNotePaneCollapsed(false);
      await refreshNotes();
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
    editorFolderPath: editorFolder?.path ?? null,
    foldersCount: folders.length,
    loadingEditor,
    saving
  });

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
        <button type="button" onClick={handleCreateDraft} className={buttonPrimary}>
          <Plus size={18} />
          New note
        </button>
      </section>

      <div className="hidden min-h-[calc(100dvh-7.5rem)] gap-4 lg:flex">
        {explorerCollapsed ? (
          <CollapsedPaneRail
            label="Notebooks"
            detail={selectedFolder?.name ?? "All Notes"}
            subdetail={editorNote?.title.trim() || "Draft"}
            ariaLabel="Open notebooks and notes panes"
            titleText={`Notebooks: ${selectedFolder?.name ?? "All Notes"}${editorNote?.title.trim() ? ` / ${editorNote.title.trim()}` : ""}`}
            onOpen={() => {
              setFolderPaneCollapsed(false);
              setNotePaneCollapsed(false);
            }}
            icon={<FolderSimple size={18} />}
          />
        ) : (
          <>
            {folderPaneCollapsed ? (
              <CollapsedPaneRail
                label="Notebooks"
                detail={selectedFolder?.name ?? "Browse"}
                onOpen={() => setFolderPaneCollapsed(false)}
                icon={<FolderSimple size={18} />}
              />
            ) : (
              <div className="w-[320px] shrink-0">
                <FolderTree
                  folders={folders}
                  selectedFolderId={selectedFolderId}
                  pendingName={pendingFolderName}
                  onPendingNameChange={setPendingFolderName}
                  onCreateNotebook={() => void handleCreateNotebook()}
                  onMoveNotebook={(move) => void handleMoveNotebook(move)}
                  onCollapse={() => setFolderPaneCollapsed(true)}
                  onSelectFolder={handleSelectFolder}
                />
              </div>
            )}

            {notePaneCollapsed ? (
              <CollapsedPaneRail
                label="Notes"
                detail={editorNote?.title.trim() || "Draft"}
                onOpen={() => setNotePaneCollapsed(false)}
                icon={<ListBullets size={18} />}
              />
            ) : (
              <div className="w-[340px] shrink-0">
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
                />
              </div>
            )}
          </>
        )}

        <EditorPanel
          editorNote={editorNote}
          editorFolderPath={editorFolder?.path ?? null}
          folders={folders}
          editorPane={editorPane}
          onEditorPaneChange={setEditorPane}
          onFolderChange={handleEditorFolderChange}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onDelete={() => void handleDeleteCurrentNote()}
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
          editorFolderPath={editorFolder?.path ?? null}
          folders={folders}
          editorPane={editorPane}
          onEditorPaneChange={setEditorPane}
          onFolderChange={handleEditorFolderChange}
          onTitleChange={(title) => setEditorNote((current) => (current ? { ...current, title } : current))}
          onBodyChange={(bodyMarkdown) => setEditorNote((current) => (current ? { ...current, bodyMarkdown } : current))}
          onDelete={() => void handleDeleteCurrentNote()}
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
          pendingName={pendingFolderName}
          onPendingNameChange={setPendingFolderName}
          onCreateNotebook={() => void handleCreateNotebook()}
          onMoveNotebook={(move) => void handleMoveNotebook(move)}
          onSelectFolder={handleSelectFolder}
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
        />
      </MobileDrawer>
    </>
  );
}

function EditorPanel(props: {
  editorNote: EditorState | null;
  editorFolderPath: string | null;
  folders: FolderNode[];
  editorPane: EditorPane;
  onEditorPaneChange(value: EditorPane): void;
  onFolderChange(folderId: string | null): void;
  onTitleChange(title: string): void;
  onBodyChange(bodyMarkdown: string): void;
  onDelete(): void;
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
    <section className="bb-editor-panel lg:flex-1">
      <div className="bb-editor-header">
        <div className="bb-panel-header__copy">
          <p className="bb-eyebrow">{props.editorFolderPath ?? "Draft"}</p>
          <p className="bb-panel-subtitle">{props.statusText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            onClick={props.onDelete}
            disabled={!props.editorNote?.noteId}
            className={buttonDanger}
          >
            <Trash size={18} />
            Delete
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
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_14rem]">
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
          <label className="bb-field">
            <span className="bb-field__label">Notebook</span>
            <select
              value={props.editorNote?.folderId ?? ""}
              onChange={(event) => props.onFolderChange(event.target.value || null)}
              disabled={!props.editorNote}
              className="bb-select"
            >
              <option value="">Select a notebook</option>
              {props.folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path}
                </option>
              ))}
            </select>
          </label>
        </div>

        {props.editorPane === "markdown" ? (
          <label className="bb-field">
            <span className="bb-field__label">Markdown</span>
            <textarea
              value={props.editorNote?.bodyMarkdown ?? ""}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder="Write in Markdown"
              disabled={!props.editorNote}
              className="bb-textarea bb-code min-h-[30rem] text-sm leading-7"
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

        {!props.folders.length ? (
          <div className="bb-panel-note text-sm">
            Create a notebook before this note can save.
          </div>
        ) : null}
      </div>
      )}
    </section>
  );
}

function CollapsedPaneRail(props: {
  label: string;
  detail: string;
  subdetail?: string | null;
  icon: ReactNode;
  onOpen(): void;
  ariaLabel?: string;
  titleText?: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={props.ariaLabel ?? `Open ${props.label} pane`}
      title={props.titleText ?? `${props.label}: ${props.detail}`}
      className="bb-collapsed-rail"
    >
      <span className="bb-collapsed-rail__icon">
        {props.icon}
      </span>
      <span className="bb-collapsed-rail__meta">
        <span className="bb-eyebrow text-[11px]">{props.label}</span>
        <strong>{props.detail}</strong>
        {props.subdetail ? (
          <span>{props.subdetail}</span>
        ) : null}
      </span>
      <span className="bb-collapsed-rail__action">
        <CaretRight size={15} />
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
  editorFolderPath: string | null;
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
    return `Saved ${new Date(props.editorNote.updatedAt).toLocaleString()}`;
  }

  return props.editorFolderPath ?? "Draft";
}
