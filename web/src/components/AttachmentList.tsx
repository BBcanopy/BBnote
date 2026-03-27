import { CaretDown, CaretRight, DownloadSimple, FileText, ImageSquare, Link, MusicNotesSimple, VideoCamera } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { AttachmentRef } from "../api/types";
import { buttonDanger, buttonSecondary } from "./buttonStyles";

export function AttachmentList(props: {
  attachments: AttachmentRef[];
  disabled: boolean;
  onInsertLink(attachment: AttachmentRef): void;
  onInsertImage(attachment: AttachmentRef): void;
  onInsertAudio(attachment: AttachmentRef): void;
  onInsertVideo(attachment: AttachmentRef): void;
  onDelete(attachmentId: string): void;
  onDownload(attachment: AttachmentRef): void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="bb-pane-card bb-attachment-list" data-testid="attachment-list">
      <button
        type="button"
        className="bb-attachment-list__toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((currentValue) => !currentValue)}
      >
        <span className="bb-attachment-list__summary">
          <span className="bb-attachment-list__title">Attachments</span>
          <span className="bb-attachment-list__count">{props.attachments.length}</span>
        </span>
        <span className="bb-attachment-list__toggle-icon" aria-hidden="true">
          {collapsed ? <CaretRight size={16} /> : <CaretDown size={16} />}
        </span>
      </button>

      {!collapsed ? (
        <div className="bb-attachment-list__body">
          <div className="bb-attachment-list__items">
            {props.attachments.length === 0 ? (
              <div className="bb-empty-state text-sm">
                Uploaded files will appear here.
              </div>
            ) : (
              props.attachments.map((attachment) => {
                const kind = resolveAttachmentKind(attachment.mimeType);
                return (
                  <div key={attachment.id} className="bb-attachment-card">
                    <div className="bb-attachment-meta">
                      <div className="bb-note-icon">
                        {kind === "image" ? <ImageSquare size={18} /> : null}
                        {kind === "audio" ? <MusicNotesSimple size={18} /> : null}
                        {kind === "video" ? <VideoCamera size={18} /> : null}
                        {kind === "file" ? <FileText size={18} /> : null}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[color:var(--ink)]">{attachment.name}</p>
                        <p className="truncate text-xs text-[color:var(--ink-soft)]">{attachment.mimeType}</p>
                      </div>
                    </div>
                    <div className="bb-attachment-card__actions">
                      <InlineAction
                        label="Link"
                        icon={<Link size={16} />}
                        disabled={props.disabled}
                        onClick={() => props.onInsertLink(attachment)}
                      />
                      {kind === "image" ? (
                        <InlineAction
                          label="Image"
                          icon={<ImageSquare size={16} />}
                          disabled={props.disabled}
                          onClick={() => props.onInsertImage(attachment)}
                        />
                      ) : null}
                      {kind === "audio" ? (
                        <InlineAction
                          label="Audio"
                          icon={<MusicNotesSimple size={16} />}
                          disabled={props.disabled}
                          onClick={() => props.onInsertAudio(attachment)}
                        />
                      ) : null}
                      {kind === "video" ? (
                        <InlineAction
                          label="Video"
                          icon={<VideoCamera size={16} />}
                          disabled={props.disabled}
                          onClick={() => props.onInsertVideo(attachment)}
                        />
                      ) : null}
                      <InlineAction
                        label="Download"
                        icon={<DownloadSimple size={16} />}
                        disabled={props.disabled}
                        onClick={() => props.onDownload(attachment)}
                      />
                      <button
                        type="button"
                        onClick={() => props.onDelete(attachment.id)}
                        disabled={props.disabled}
                        className={`${buttonDanger} bb-attachment-card__button`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function InlineAction(props: { label: string; icon: ReactNode; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${buttonSecondary} bb-attachment-card__button`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

function resolveAttachmentKind(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "file";
}
