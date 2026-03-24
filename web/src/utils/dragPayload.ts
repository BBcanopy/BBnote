export type DragPayload =
  | {
      kind: "folder";
      id: string;
    }
  | {
      kind: "note";
      id: string;
      folderId: string;
    };

const DRAG_PAYLOAD_MIME = "application/x-bbnote-drag-payload";

export function setDragPayload(dataTransfer: DataTransfer, payload: DragPayload) {
  const encoded = JSON.stringify(payload);
  dataTransfer.setData(DRAG_PAYLOAD_MIME, encoded);
  dataTransfer.setData("text/plain", encoded);
}

export function getDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  const rawPayload = dataTransfer.getData(DRAG_PAYLOAD_MIME) || dataTransfer.getData("text/plain");
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as Partial<DragPayload> | null;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") {
      return null;
    }

    if (parsed.kind === "folder") {
      return {
        kind: "folder",
        id: parsed.id
      };
    }

    if (parsed.kind === "note" && typeof parsed.folderId === "string") {
      return {
        kind: "note",
        id: parsed.id,
        folderId: parsed.folderId
      };
    }
  } catch {
    return null;
  }

  return null;
}
