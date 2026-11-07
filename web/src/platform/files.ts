import { fetchAttachmentBlob, downloadExport } from "../api/client";
import { isNative, nativeDownload } from "./native";

export async function saveAttachment(url: string, name: string, open = false) {
  if (isNative()) return nativeDownload(url, name, open);
  return saveBlob(await fetchAttachmentBlob(url), name, open);
}
export async function saveExport(id: string) {
  if (isNative()) return nativeDownload(`/api/v1/exports/${id}/download`, `${id}.zip`);
  saveBlob(await downloadExport(id), `${id}.zip`);
}
function saveBlob(blob: Blob, name: string, open = false) {
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener,noreferrer");
  else {
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
