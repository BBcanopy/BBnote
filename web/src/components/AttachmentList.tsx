import { DownloadSimple, FileArrowUp, FileText, ImageSquare, Link } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import type { AttachmentRef } from "../api/types";

export function AttachmentList(props: {
  attachments: AttachmentRef[];
  uploading: boolean;
  onUpload(files: FileList | null): void;
  onInsertLink(attachment: AttachmentRef): void;
  onInsertImage(attachment: AttachmentRef): void;
  onDelete(attachmentId: string): void;
  onDownload(attachment: AttachmentRef): void;
}) {
  return (
    <section className="rounded-[1.6rem] border border-slate-200/70 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium tracking-tight text-slate-900">Attachments</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">Images and files</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:bg-emerald-600 active:translate-y-0 active:scale-[0.98]">
          <FileArrowUp size={18} />
          {props.uploading ? "Uploading" : "Upload"}
          <input type="file" className="hidden" onChange={(event) => props.onUpload(event.target.files)} />
        </label>
      </div>
      <div className="mt-4 space-y-3">
        {props.attachments.length === 0 ? (
          <div className="rounded-[1.2rem] border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
            Uploaded files will appear here.
          </div>
        ) : (
          props.attachments.map((attachment) => {
            const isImage = attachment.mimeType.startsWith("image/");
            return (
              <div key={attachment.id} className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                      {isImage ? <ImageSquare size={18} /> : <FileText size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{attachment.name}</p>
                      <p className="text-xs text-slate-500">{attachment.mimeType}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <InlineAction label="Link" icon={<Link size={16} />} onClick={() => props.onInsertLink(attachment)} />
                    {isImage ? (
                      <InlineAction
                        label="Image"
                        icon={<ImageSquare size={16} />}
                        onClick={() => props.onInsertImage(attachment)}
                      />
                    ) : null}
                    <InlineAction
                      label="Download"
                      icon={<DownloadSimple size={16} />}
                      onClick={() => props.onDownload(attachment)}
                    />
                    <button
                      type="button"
                      onClick={() => props.onDelete(attachment.id)}
                      className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-500 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-red-200 hover:text-red-600 active:translate-y-0 active:scale-[0.98]"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function InlineAction(props: { label: string; icon: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950 active:translate-y-0 active:scale-[0.98]"
    >
      {props.icon}
      {props.label}
    </button>
  );
}
