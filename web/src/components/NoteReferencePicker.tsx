import { LinkSimple } from "@phosphor-icons/react";
import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { listNotes } from "../api/client";
import type { NoteSummary } from "../api/types";

const RESULT_LIMIT = 20;

type LoadStatus = "loading" | "ready" | "error";

export function NoteReferencePicker(props: {
  currentNoteId: string | null;
  disabled: boolean;
  disabledTitle: string;
  onOpen(): void;
  onPick(note: NoteSummary): void;
}) {
  const dialogId = useId();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const deferredSearch = useDeferredValue(search);
  const query = deferredSearch.trim();
  const results = notes.filter((note) => note.id !== props.currentNoteId);

  useEffect(() => {
    if (!open) {
      return;
    }

    let active = true;
    setStatus("loading");
    listNotes({ q: query || undefined, limit: RESULT_LIMIT })
      .then((payload) => {
        if (active) {
          setNotes(payload.items);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (active) {
          setNotes([]);
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!shellRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (props.disabled) {
      setOpen(false);
    }
  }, [props.disabled]);

  function handleToggle() {
    if (open) {
      setOpen(false);
      return;
    }

    props.onOpen();
    setSearch("");
    setNotes([]);
    setStatus("loading");
    setOpen(true);
  }

  function handlePick(note: NoteSummary) {
    setOpen(false);
    props.onPick(note);
  }

  return (
    <div className="bb-toolbar-popover-shell bb-note-picker-shell" ref={shellRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Link to note"
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={props.disabled ? props.disabledTitle : "Link to note"}
        disabled={props.disabled}
        onPointerDown={(event) => {
          if (!props.disabled) {
            event.preventDefault();
          }
        }}
        onClick={handleToggle}
        className={`bb-icon-button bb-icon-button--toolbar bb-icon-button--accent ${open ? "bb-icon-button--is-active" : ""}`}
      >
        <LinkSimple size={17} />
      </button>
      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label="Link to note"
          data-testid="note-reference-picker"
          className="bb-note-picker"
        >
          <label className="bb-field">
            <span className="bb-field__label">Search notes</span>
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by word"
              className="bb-input"
            />
          </label>

          {results.length > 0 ? (
            <ul className="bb-note-picker__results">
              {results.map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => handlePick(note)} className="bb-note-picker__result">
                    <span className="bb-note-picker__result-title">{note.title.trim() || "Untitled note"}</span>
                    {note.excerpt ? <span className="bb-note-picker__result-excerpt">{note.excerpt}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="bb-note-picker__message">
              {getEmptyMessage(status, query)}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function getEmptyMessage(status: LoadStatus, query: string) {
  if (status === "loading") {
    return "Loading notes";
  }

  if (status === "error") {
    return "Notes couldn't be loaded.";
  }

  return query ? "No notes match. Search looks for whole words." : "No other notes yet.";
}
