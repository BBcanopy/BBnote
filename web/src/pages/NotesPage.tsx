import {
  CaretLeft,
  CircleNotch,
  Eye,
  FolderSimple,
  ListBullets,
  PencilSimple,
  Plus,
  Rows,
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

  async function handleCreateNotebook(parentId: string | null) {
    if (!auth.user || !pendingFolderName.trim()) {
      return;
    }

    setError(null);

    try {
      const created = await createFolder({
        name: pendingFolderName.trim(),
        parentId
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
        {folderPaneCollapsed ? (
          <CollapsedPaneRail
            label="Notebooks"
            detail={selectedFolder?.name ?? "All notes"}
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
              onCollapse={() => setFolderPaneCollapsed(true)}
              onCreateNotebook={(parentId) => void handleCreateNotebook(parentId)}
              onSelectFolder={(folderId) => handleSelectFolder(folderId)}
              onClearSelection={() => handleSelectFolder(null)}
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
          onCreateNotebook={(parentId) => void handleCreateNotebook(parentId)}
          onSelectFolder={(folderId) => handleSelectFolder(folderId)}
          onClearSelection={() => handleSelectFolder(null)}
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
    <section className="min-w-0 rounded-[2rem] border border-slate-200/70 bg-white/90 p-5 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.3)] backdrop-blur-sm lg:flex-1">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{props.editorFolderPath ?? "Draft"}</p>
          <p className="mt-2 text-sm text-slate-600">{props.statusText}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
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
        <p className="mt-4 rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{props.error}</p>
      ) : null}

      {props.loading ? (
        <div className="mt-5 grid min-h-[22rem] place-items-center rounded-[1.5rem] border border-slate-200 bg-slate-50/70 text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <CircleNotch size={18} className="animate-spin text-emerald-700" />
            Loading note
          </span>
        </div>
      ) : !props.editorNote ? (
        <div className="mt-5 grid min-h-[22rem] place-items-center rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-8 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium tracking-tight text-slate-900">No note selected</p>
            <p className="text-sm text-slate-500">Choose a note or start a new draft.</p>
          </div>
        </div>
      ) : (
      <div className="mt-5 grid gap-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_14rem]">
          <label className="grid gap-2 text-sm text-slate-700">
            Title
            <input
              value={props.editorNote?.title ?? ""}
              onChange={(event) => props.onTitleChange(event.target.value)}
              placeholder="Note title"
              disabled={!props.editorNote}
              className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-lg font-medium tracking-tight outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-700">
            Notebook
            <select
              value={props.editorNote?.folderId ?? ""}
              onChange={(event) => props.onFolderChange(event.target.value || null)}
              disabled={!props.editorNote}
              className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
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
          <label className="grid gap-2 text-sm text-slate-700">
            Markdown
            <textarea
              value={props.editorNote?.bodyMarkdown ?? ""}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder="Write in Markdown"
              disabled={!props.editorNote}
              className="min-h-[30rem] rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 font-['Geist_Mono'] text-sm leading-7 outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400"
            />
          </label>
        ) : (
          <div className="min-h-[30rem] rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
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
          <div className="rounded-[1.3rem] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-4 text-sm text-slate-500">
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
  icon: ReactNode;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      onClick={props.onOpen}
      aria-label={`Open ${props.label} pane`}
      className="flex w-[6.75rem] shrink-0 flex-col items-center gap-3 rounded-[1.75rem] border border-slate-200/70 bg-white/90 px-3 py-4 text-slate-700 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.18)] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300"
    >
      <span className="rounded-full bg-emerald-50 p-3 text-emerald-700">{props.icon}</span>
      <span className="space-y-2 text-center">
        <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-400">{props.label}</span>
        <span className="block overflow-hidden text-xs font-medium leading-4 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {props.detail}
        </span>
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
        <Rows size={14} />
        Open
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
    <div className="fixed inset-0 z-30 bg-slate-950/30 px-3 py-4 lg:hidden">
      <div className="flex h-full max-h-[100dvh] flex-col rounded-[2rem] bg-canvas p-1 shadow-[0_32px_80px_-40px_rgba(15,23,42,0.65)]">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{props.title}</p>
          <button type="button" onClick={props.onClose} className={buttonGhost}>
            <CaretLeft size={18} />
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{props.children}</div>
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
      className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        props.active ? "bg-slate-950 text-white shadow-[0_10px_24px_-18px_rgba(15,23,42,0.9)]" : "text-slate-600 hover:text-slate-950"
      }`}
    >
      {props.icon}
      {props.label}
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
