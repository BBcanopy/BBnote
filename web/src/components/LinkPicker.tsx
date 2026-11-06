import { LinkSimple } from "@phosphor-icons/react";
import { useDeferredValue, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { listNotes } from "../api/client";
import type { NoteSummary } from "../api/types";
import { normalizeLinkUrl, type MarkdownLink } from "../utils/markdownFormat";

const RESULT_LIMIT = 20;

type LoadStatus = "loading" | "ready" | "error";

export function LinkPicker(props: {
  currentNoteId: string | null;
  disabled: boolean;
  disabledTitle: string;
  onOpen(): void;
  onPickNote(note: NoteSummary): void;
  onPickLink(link: MarkdownLink): void;
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
  const typedText = search.trim();
  const linkUrl = normalizeLinkUrl(typedText);
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

    function handleKeyDown(event: globalThis.KeyboardEvent) {
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

  function handlePickNote(note: NoteSummary) {
    setOpen(false);
    props.onPickNote(note);
  }

  function handlePickLink(url: string) {
    setOpen(false);
    props.onPickLink({ url, label: typedText });
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter also confirms text in an input method, which must not pick anything.
    if (event.key !== "Enter" || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (linkUrl) {
      handlePickLink(linkUrl);
      return;
    }

    // Results lag behind the box while a search runs, so only take the top one once they have caught up.
    if (typedText && query === typedText && status === "ready" && results[0]) {
      handlePickNote(results[0]);
    }
  }

  return (
    <div className="bb-toolbar-popover-shell bb-link-picker-shell" ref={shellRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Insert link"
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={props.disabled ? props.disabledTitle : "Insert link"}
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
        <div id={dialogId} role="dialog" aria-label="Insert link" data-testid="link-picker" className="bb-link-picker">
          <label className="bb-field">
            <span className="bb-field__label">Search notes or paste a link</span>
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Note title, text, or web address"
              className="bb-input"
            />
          </label>

          {linkUrl || results.length > 0 ? (
            <ul className="bb-link-picker__results">
              {linkUrl ? (
                <li>
                  <button type="button" onClick={() => handlePickLink(linkUrl)} className="bb-link-picker__result">
                    <span className="bb-link-picker__result-title">Link to {linkUrl}</span>
                  </button>
                </li>
              ) : null}
              {results.map((note) => (
                <li key={note.id}>
                  <button type="button" onClick={() => handlePickNote(note)} className="bb-link-picker__result">
                    <span className="bb-link-picker__result-title">{note.title.trim() || "Untitled note"}</span>
                    {note.excerpt ? <span className="bb-link-picker__result-excerpt">{note.excerpt}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="bb-link-picker__message">
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

  return query ? "No notes match." : "No other notes yet.";
}
