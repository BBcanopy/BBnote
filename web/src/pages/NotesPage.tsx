import { FloppyDiskBack, Eye, PencilSimple, Trash } from "@phosphor-icons/react";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { FolderTree } from "../components/FolderTree";
import { MarkdownPreview } from "../components/MarkdownPreview";
import { NoteListPane } from "../components/NoteListPane";

export function NotesPage() {
  const auth = useAuth();
  const token = auth.accessToken;
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [pendingFolderName, setPendingFolderName] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [currentNote, setCurrentNote] = useState<NoteDetail | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [search, setSearch] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void refreshFolders(token);
  }, [token]);

  useEffect(() => {
    if (folders.length > 0 && !selectedFolderId) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!token || !selectedFolderId) {
      return;
    }
    setLoadingNotes(true);
    listNotes(token, {
      folderId: selectedFolderId,
      q: deferredSearch || undefined
    })
      .then((payload) => {
        setNotes(payload.items);
        if (payload.items.length === 0) {
          setSelectedNoteId(null);
          setCurrentNote(null);
          setDraftTitle("");
          setDraftBody("");
          return;
        }
        setSelectedNoteId((current) =>
          current && payload.items.some((note) => note.id === current) ? current : payload.items[0].id
        );
      })
      .catch((notesError) => {
        setError(String(notesError));
      })
      .finally(() => {
        setLoadingNotes(false);
      });
  }, [deferredSearch, selectedFolderId, token]);

  useEffect(() => {
    if (!token || !selectedNoteId) {
      return;
    }
    getNote(token, selectedNoteId)
      .then((note) => {
        setCurrentNote(note);
        setDraftTitle(note.title);
        setDraftBody(note.bodyMarkdown);
      })
      .catch((noteError) => {
        setError(String(noteError));
      });
  }, [selectedNoteId, token]);

  async function refreshFolders(activeToken: string) {
    const nextFolders = await listFolders(activeToken);
    setFolders(nextFolders);
  }

  async function refreshSelectedNotes(activeToken: string, folderId: string) {
    const payload = await listNotes(activeToken, {
      folderId,
      q: deferredSearch || undefined
    });
    setNotes(payload.items);
  }

  async function handleCreateFolder() {
    if (!token || !pendingFolderName.trim()) {
      return;
    }
    setError(null);
    try {
      await createFolder(token, {
        name: pendingFolderName,
        parentId: selectedFolderId
      });
      setPendingFolderName("");
      await refreshFolders(token);
    } catch (folderError) {
      setError(String(folderError));
    }
  }

  async function handleCreateNote() {
    if (!token || !selectedFolderId) {
      return;
    }
    setError(null);
    try {
      const created = await createNote(token, {
        folderId: selectedFolderId,
        title: "Untitled note",
        bodyMarkdown: ""
      });
      await refreshSelectedNotes(token, selectedFolderId);
      startTransition(() => {
        setSelectedNoteId(created.id);
      });
    } catch (createError) {
      setError(String(createError));
    }
  }

  async function handleSaveNote() {
    if (!token || !selectedNoteId || !selectedFolderId) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateNote(token, selectedNoteId, {
        folderId: selectedFolderId,
        title: draftTitle || "Untitled note",
        bodyMarkdown: draftBody
      });
      setCurrentNote(updated);
      await refreshSelectedNotes(token, selectedFolderId);
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote() {
    if (!token || !selectedNoteId || !selectedFolderId) {
      return;
    }
    setError(null);
    try {
      await deleteNote(token, selectedNoteId);
      await refreshSelectedNotes(token, selectedFolderId);
      setSelectedNoteId((current) => (current === selectedNoteId ? null : current));
      setCurrentNote(null);
      setDraftTitle("");
      setDraftBody("");
    } catch (deleteError) {
      setError(String(deleteError));
    }
  }

  async function handleAttachmentUpload(files: FileList | null) {
    if (!token || !selectedNoteId || !files?.[0]) {
      return;
    }
    setUploadingAttachment(true);
    setError(null);
    try {
      await uploadAttachment(token, selectedNoteId, files[0]);
      const refreshed = await getNote(token, selectedNoteId);
      setCurrentNote(refreshed);
    } catch (uploadError) {
      setError(String(uploadError));
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!token || !selectedNoteId) {
      return;
    }
    await deleteAttachment(token, attachmentId);
    const refreshed = await getNote(token, selectedNoteId);
    setCurrentNote(refreshed);
  }

  async function handleDownloadAttachment(attachment: AttachmentRef) {
    if (!token) {
      return;
    }
    const blob = await fetchAttachmentBlob(token, attachment.url);
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = attachment.name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }

  function appendToBody(snippet: string) {
    setDraftBody((existing) => `${existing}${existing.endsWith("\n") || existing.length === 0 ? "" : "\n"}${snippet}`);
  }

  return (
    <section className="grid min-h-[calc(100dvh-8rem)] gap-6 md:grid-cols-[260px_320px_minmax(0,1fr)]">
      <FolderTree
        folders={folders}
        selectedFolderId={selectedFolderId}
        pendingName={pendingFolderName}
        onPendingNameChange={setPendingFolderName}
        onCreateFolder={() => void handleCreateFolder()}
        onSelectFolder={setSelectedFolderId}
      />
      <NoteListPane
        notes={notes}
        search={search}
        onSearchChange={setSearch}
        selectedNoteId={selectedNoteId}
        onSelectNote={(noteId) => startTransition(() => setSelectedNoteId(noteId))}
        onCreateNote={() => void handleCreateNote()}
        loading={loadingNotes}
      />
      <section className="rounded-[2rem] border border-slate-200/70 bg-white/80 p-5 shadow-[0_20px_50px_-32px_rgba(15,23,42,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{selectedFolder?.path ?? "Editor"}</p>
            <p className="mt-2 text-sm text-slate-600">
              {currentNote ? new Date(currentNote.updatedAt).toLocaleString() : "Choose or create a note to begin"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPreview((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950 active:translate-y-0 active:scale-[0.98]"
            >
              {showPreview ? <PencilSimple size={18} /> : <Eye size={18} />}
              {showPreview ? "Focus editor" : "Show preview"}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveNote()}
              disabled={!currentNote || saving}
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FloppyDiskBack size={18} />
              {saving ? "Saving" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteNote()}
              disabled={!currentNote}
              className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm text-red-600 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-red-50 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash size={18} />
              Delete
            </button>
          </div>
        </div>
        {error ? <p className="mt-4 rounded-[1.2rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 grid gap-5">
          <label className="grid gap-2 text-sm text-slate-700">
            Title
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              disabled={!currentNote}
              className="rounded-[1.1rem] border border-slate-200 bg-slate-50/80 px-4 py-3 text-lg font-medium tracking-tight outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <div className={`grid gap-4 ${showPreview ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"}`}>
            <label className="grid gap-2 text-sm text-slate-700">
              Markdown body
              <textarea
                value={draftBody}
                onChange={(event) => setDraftBody(event.target.value)}
                disabled={!currentNote}
                className="min-h-[28rem] rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 font-['Geist_Mono'] text-sm leading-7 outline-none transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            {showPreview ? (
              <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-5 py-4">
                {currentNote ? (
                  <MarkdownPreview bodyMarkdown={draftBody} token={token ?? ""} />
                ) : (
                  <p className="text-sm text-slate-500">Preview appears once a note is selected.</p>
                )}
              </div>
            ) : null}
          </div>
          <AttachmentList
            attachments={currentNote?.attachments ?? []}
            uploading={uploadingAttachment}
            onUpload={(files) => void handleAttachmentUpload(files)}
            onInsertLink={(attachment) => appendToBody(`[${attachment.name}](${attachment.url})`)}
            onInsertImage={(attachment) => appendToBody(`![${attachment.name}](${attachment.url})`)}
            onDelete={(attachmentId) => void handleDeleteAttachment(attachmentId)}
            onDownload={(attachment) => void handleDownloadAttachment(attachment)}
          />
        </div>
      </section>
    </section>
  );
}
