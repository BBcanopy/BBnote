import { MusicNotesSimple } from "@phosphor-icons/react";
import { isValidElement, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchAttachmentBlob } from "../api/client";
import type { AttachmentRef } from "../api/types";
import { buttonSecondary } from "./buttonStyles";
import { parseScratchDocument, SCRATCH_FENCE_LANGUAGE, type ScratchDocument, type ScratchEditTarget } from "../utils/scratch";

export function MarkdownPreview(props: {
  bodyMarkdown: string;
  attachments?: AttachmentRef[];
  onEditScratch?(target: ScratchEditTarget): void;
}) {
  const attachmentsByUrl = new Map<string, AttachmentRef>();
  const scratchSearchState = { nextStart: 0 };
  for (const attachment of props.attachments ?? []) {
    attachmentsByUrl.set(normalizeAttachmentUrl(attachment.url), attachment);
  }

  return (
    <div className="bb-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children, node: _node, ...preProps }) => {
            const scratchTarget = extractScratchTarget(children, props.bodyMarkdown, scratchSearchState);
            if (!scratchTarget) {
              return <pre {...preProps}>{children}</pre>;
            }

            return (
              <ScratchPreviewCard
                document={scratchTarget.document}
                onEdit={props.onEditScratch ? () => props.onEditScratch?.(scratchTarget) : undefined}
              />
            );
          },
          img: ({ src, alt }) => <SecureAttachmentImage src={src} alt={alt ?? ""} />,
          a: ({ href, children }) => {
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
            return <SecureAttachmentLink href={href}>{children}</SecureAttachmentLink>;
          }
        }}
      >
        {props.bodyMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function ScratchPreviewCard(props: { document: ScratchDocument; onEdit?(): void }) {
  return (
    <div className="bb-markdown__scratch-card" data-testid="markdown-scratch">
      <div className="bb-markdown__scratch-head">
        <div className="bb-markdown__scratch-copy">
          <span className="bb-markdown__scratch-label">Scratch</span>
          <span className="bb-markdown__scratch-meta">
            {props.document.strokes.length} stroke{props.document.strokes.length === 1 ? "" : "s"}
          </span>
        </div>
        {props.onEdit ? (
          <button type="button" onClick={props.onEdit} className={`${buttonSecondary} bb-inline-button`}>
            Edit sketch
          </button>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${props.document.width} ${props.document.height}`}
        className="bb-markdown__scratch-svg"
        role="img"
        aria-label="Scratch sketch preview"
      >
        <rect width={props.document.width} height={props.document.height} fill="#ffffff" rx="20" ry="20" />
        {props.document.strokes.map((stroke, index) =>
          stroke.points.length > 0 ? (
            <polyline
              key={`${props.document.id}-${index}`}
              points={stroke.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={stroke.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={stroke.width}
            />
          ) : null
        )}
      </svg>
    </div>
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

function SecureAttachmentLink(props: { href?: string; children: ReactNode }) {
  if (!isSecureAttachmentUrl(props.href)) {
    return (
      <a href={props.href} target="_blank" rel="noreferrer">
        {props.children}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={async () => {
        const blob = await fetchAttachmentBlob(props.href!);
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }}
      className="bb-link-button"
    >
      {props.children}
    </button>
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
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith("/api/v1/attachments/")) {
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

function extractScratchTarget(
  content: ReactNode,
  bodyMarkdown: string,
  searchState: { nextStart: number }
): ScratchEditTarget | null {
  const scratchNode = unwrapSingleReactChild(content);
  if (!scratchNode || !isValidElement<{ className?: string; children?: ReactNode }>(scratchNode)) {
    return null;
  }

  const className = String(scratchNode.props.className ?? "");
  if (!className.split(/\s+/).includes(`language-${SCRATCH_FENCE_LANGUAGE}`)) {
    return null;
  }

  const source = flattenReactText(scratchNode.props.children).replace(/\n$/, "");
  const document = parseScratchDocument(source);
  if (!document) {
    return null;
  }

  const blockSource = `\`\`\`${SCRATCH_FENCE_LANGUAGE}\n${source}\n\`\`\``;
  const startOffset = findScratchBlockOffset(bodyMarkdown, blockSource, searchState.nextStart);
  if (startOffset < 0) {
    return null;
  }

  const endOffset = startOffset + blockSource.length;
  searchState.nextStart = endOffset;

  return {
    document,
    endOffset,
    startOffset
  };
}

function findScratchBlockOffset(bodyMarkdown: string, blockSource: string, searchStart: number) {
  const nextOffset = bodyMarkdown.indexOf(blockSource, Math.max(0, searchStart));
  if (nextOffset >= 0) {
    return nextOffset;
  }

  return bodyMarkdown.indexOf(blockSource);
}

function unwrapSingleReactChild(content: ReactNode): ReactNode | null {
  if (Array.isArray(content)) {
    const meaningfulChildren = content.filter((child) => child !== null && child !== undefined && child !== false);
    if (meaningfulChildren.length !== 1) {
      return null;
    }

    return meaningfulChildren[0];
  }

  return content ?? null;
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
