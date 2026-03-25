import { DownloadSimple, FileText, ImageSquare, Link, MusicNotesSimple, VideoCamera } from "@phosphor-icons/react";
import type { ReactNode } from "react";
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
  return (
    <section className="bb-pane-card">
      <div className="bb-pane-card__header">
        <div className="bb-panel-header__copy">
          <p className="bb-eyebrow">Attachments</p>
          <p className="bb-panel-title">Linked files and embeds</p>
        </div>
      </div>
      <div className="space-y-3">
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
                <div className="flex flex-wrap gap-2">
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
                    className={`${buttonDanger} min-h-0 h-8 px-3 text-xs`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function InlineAction(props: { label: string; icon: ReactNode; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${buttonSecondary} min-h-0 h-8 px-3 text-xs`}
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
