import { MusicNotesSimple } from "@phosphor-icons/react";
import { isValidElement, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchAttachmentBlob } from "../api/client";
import { saveAttachment } from "../platform/files";
import { currentServer } from "../platform/native";
import type { AttachmentRef } from "../api/types";
import { parseNoteIdFromHref } from "../utils/noteRoute";

export function MarkdownPreview(props: { bodyMarkdown: string; attachments?: AttachmentRef[]; onOpenNote?(noteId: string): void }) {
  const attachmentsByUrl = new Map<string, AttachmentRef>();
  for (const attachment of props.attachments ?? []) {
    attachmentsByUrl.set(normalizeAttachmentUrl(attachment.url), attachment);
  }

  return (
    <div className="bb-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          img: ({ src, alt }) => <SecureAttachmentImage src={src} alt={alt ?? ""} />,
          a: ({ href, children }) => {
            const noteId = parseNoteIdFromHref(href, currentServer());
            if (noteId && props.onOpenNote) {
              return (
                <NoteReferenceLink href={href} noteId={noteId} onOpenNote={props.onOpenNote}>
                  {children}
                </NoteReferenceLink>
              );
            }

            const attachment = href ? attachmentsByUrl.get(normalizeAttachmentUrl(href)) : undefined;
            if (attachment?.mimeType.startsWith("audio/")) {
              return (
                <SecureAttachmentAudio
                  src={href}
                  title={extractMarkdownMediaLabel(children, attachment.name)}
                />
              );
            }
            if (attachment?.mimeType.startsWith("video/")) {
              return <SecureAttachmentVideo src={href}>{children}</SecureAttachmentVideo>;
            }
            return <SecureAttachmentLink href={href} name={attachment?.name}>{children}</SecureAttachmentLink>;
          }
        }}
      >
        {props.bodyMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function NoteReferenceLink(props: { href?: string; noteId: string; onOpenNote(noteId: string): void; children: ReactNode }) {
  return (
    <a
      href={props.href}
      className="bb-link-button"
      onClick={(event) => {
        // Modified clicks keep the browser's behaviour, so a reference can still open in a new tab.
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
          return;
        }

        event.preventDefault();
        props.onOpenNote(props.noteId);
      }}
    >
      {props.children}
    </a>
  );
}

function SecureAttachmentImage(props: { src?: string; alt: string }) {
  const objectUrl = useSecureAttachmentObjectUrl(props.src);

  if (!objectUrl) {
    return <span className="bb-markdown__empty">Attachment preview unavailable.</span>;
  }

  return <img src={objectUrl} alt={props.alt} />;
}

function SecureAttachmentAudio(props: { src?: string; title: string }) {
  const objectUrl = useSecureAttachmentObjectUrl(props.src);

  if (!objectUrl) {
    return <span className="bb-markdown__empty">Attachment preview unavailable.</span>;
  }

  return (
    <span className="bb-markdown__audio-card">
      <span className="bb-markdown__audio-head">
        <span className="bb-markdown__audio-icon" aria-hidden="true">
          <MusicNotesSimple size={18} />
        </span>
        <span className="bb-markdown__audio-copy">
          <span className="bb-markdown__audio-label">Voice note</span>
          <span className="bb-markdown__audio-title">{props.title}</span>
        </span>
      </span>
      <audio controls preload="metadata" src={objectUrl} className="bb-markdown__audio-player" />
    </span>
  );
}

function SecureAttachmentVideo(props: { src?: string; children: ReactNode }) {
  const objectUrl = useSecureAttachmentObjectUrl(props.src);

  if (!objectUrl) {
    return <span className="bb-markdown__empty">Attachment preview unavailable.</span>;
  }

  return (
    <span className="bb-markdown__media">
      <video controls playsInline preload="metadata" src={objectUrl} className="bb-markdown__media-player" />
      <span className="bb-markdown__media-caption">{props.children}</span>
    </span>
  );
}

function SecureAttachmentLink(props: { href?: string; name?: string; children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  if (!isSecureAttachmentUrl(props.href)) {
    return (
      <a href={props.href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    );
  }

  return (
    <span>
      <button
        type="button"
        onClick={async () => {
          setError(null);
          try { await saveAttachment(props.href!, props.name ?? String(props.children ?? "attachment"), true); }
          catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
        }}
        className="bb-link-button"
      >
        {props.children}
      </button>
      {error ? <span role="alert" className="bb-inline-error">{error}</span> : null}
    </span>
  );
}

function useSecureAttachmentObjectUrl(source?: string) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentObjectUrl: string | null = null;

    if (!source) {
      setObjectUrl(null);
      return () => undefined;
    }

    if (!isSecureAttachmentUrl(source)) {
      setObjectUrl(source);
      return () => undefined;
    }

    fetchAttachmentBlob(source)
      .then((blob) => {
        if (!active) {
          return;
        }
        currentObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(currentObjectUrl);
      })
      .catch(() => {
        setObjectUrl(null);
      });

    return () => {
      active = false;
      if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl);
      }
    };
  }, [source]);

  return objectUrl;
}

function isSecureAttachmentUrl(value?: string) {
  return normalizeAttachmentUrl(value).startsWith("/api/v1/attachments/");
}

function normalizeAttachmentUrl(value?: string) {
  if (!value) {
    return "";
  }

  if (value.startsWith("/api/v1/attachments/")) {
    return value;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if ((parsed.origin === window.location.origin || parsed.origin === currentServer()) && parsed.pathname.startsWith("/api/v1/attachments/")) {
      return parsed.pathname;
    }
  } catch {
    return value;
  }

  return value;
}

function extractMarkdownMediaLabel(content: ReactNode, fallbackLabel: string) {
  const flattenedText = flattenReactText(content).trim();
  return flattenedText || fallbackLabel;
}

function flattenReactText(content: ReactNode): string {
  if (typeof content === "string" || typeof content === "number") {
    return String(content);
  }

  if (Array.isArray(content)) {
    return content.map((child) => flattenReactText(child)).join("");
  }

  if (isValidElement<{ children?: ReactNode }>(content)) {
    return flattenReactText(content.props.children);
  }

  return "";
}
