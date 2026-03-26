export type NotebookTestIdKind = "node" | "drag" | "before" | "after";

export function buildNotebookTestId(kind: NotebookTestIdKind, name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}
