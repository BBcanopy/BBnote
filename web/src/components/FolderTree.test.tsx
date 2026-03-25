import { fireEvent, render, screen } from "@testing-library/react";
import type { FolderNode } from "../api/types";
import { FolderTree } from "./FolderTree";

describe("FolderTree", () => {
  it("moves a notebook into another notebook from the notebook row", () => {
    const handleMoveNotebook = vi.fn();
    const dataTransfer = createDataTransfer();

    renderFolderTree({
      onMoveNotebook: handleMoveNotebook
    });

    fireEvent.dragStart(screen.getByRole("button", { name: /archive 0/i }), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId(buildNotebookTestId("drag", "Projects")), { dataTransfer });
    fireEvent.drop(screen.getByTestId(buildNotebookTestId("drag", "Projects")), { dataTransfer });

    expect(handleMoveNotebook).toHaveBeenCalledWith({
      draggedId: "archive",
      targetId: "projects",
      position: "inside"
    });
  });

  it("reorders a notebook before a sibling from the notebook row", () => {
    const handleMoveNotebook = vi.fn();
    const dataTransfer = createDataTransfer();

    renderFolderTree({
      onMoveNotebook: handleMoveNotebook
    });

    fireEvent.dragStart(screen.getByRole("button", { name: /archive 0/i }), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId(buildNotebookTestId("before", "Roadmaps")), { dataTransfer });
    fireEvent.drop(screen.getByTestId(buildNotebookTestId("before", "Roadmaps")), { dataTransfer });

    expect(handleMoveNotebook).toHaveBeenCalledWith({
      draggedId: "archive",
      targetId: "roadmaps",
      position: "before"
    });
  });

  it("requests notebook rename on double click", () => {
    const handleRenameNotebook = vi.fn();

    renderFolderTree({
      onRenameNotebook: handleRenameNotebook
    });

    fireEvent.doubleClick(screen.getByRole("button", { name: /projects 1/i }));

    expect(handleRenameNotebook).toHaveBeenCalledWith(expect.objectContaining({
      id: "projects",
      name: "Projects"
    }));
  });

  it("shows a temporary note delete target in the notebooks header and requests confirmation on drop", () => {
    const handleRequestDeleteNote = vi.fn();
    const dataTransfer = createDataTransfer();
    const encodedPayload = JSON.stringify({
      kind: "note",
      id: "note-1",
      folderId: "projects"
    });

    dataTransfer.setData("application/x-bbnote-drag-payload", encodedPayload);
    dataTransfer.setData("text/plain", encodedPayload);

    renderFolderTree({
      draggedNote: {
        id: "note-1",
        title: "Quarterly review"
      },
      onRequestDeleteNote: handleRequestDeleteNote
    });

    const deleteTarget = screen.getByTestId("notebooks-delete-target");
    expect(deleteTarget).toHaveAttribute("aria-label", "Delete note");

    fireEvent.dragOver(deleteTarget, { dataTransfer });
    fireEvent.drop(deleteTarget, { dataTransfer });

    expect(handleRequestDeleteNote).toHaveBeenCalledWith({
      id: "note-1",
      title: "Quarterly review"
    });
  });
  it("hides notebook action buttons while the centered delete target is shown", () => {
    renderFolderTree({
      draggedNote: {
        id: "note-1",
        title: "Quarterly review"
      }
    });

    expect(screen.queryByTestId("notebooks-actions")).not.toBeInTheDocument();
    expect(screen.getByTestId("notebooks-delete-target")).toHaveClass("bb-pane-card__header-center-action");
  });
});

function renderFolderTree(overrides?: {
  draggedNote?: {
    id: string;
    title: string;
  } | null;
  onMoveNotebook?: ReturnType<typeof vi.fn>;
  onRenameNotebook?: ReturnType<typeof vi.fn>;
  onRequestDeleteNote?: ReturnType<typeof vi.fn>;
}) {
  render(
    <FolderTree
      folders={buildFolders()}
      selectedFolderId="projects"
      draggedNote={overrides?.draggedNote ?? null}
      onCreateNotebook={vi.fn()}
      onMoveNotebook={overrides?.onMoveNotebook ?? vi.fn()}
      onMoveNote={vi.fn()}
      onRenameNotebook={overrides?.onRenameNotebook ?? vi.fn()}
      onRequestDeleteNote={overrides?.onRequestDeleteNote ?? vi.fn()}
      onRequestDeleteNotebook={vi.fn()}
      onSelectFolder={vi.fn()}
      onUpdateNotebookIcon={vi.fn().mockResolvedValue(undefined)}
      acceptDraggedNotes
      enableFolderDragAndDrop
    />
  );
}

function buildFolders(): FolderNode[] {
  return [
    {
      id: "projects",
      name: "Projects",
      parentId: null,
      path: "Projects",
      icon: "folder",
      childCount: 1,
      noteCount: 1
    },
    {
      id: "roadmaps",
      name: "Roadmaps",
      parentId: "projects",
      path: "Projects / Roadmaps",
      icon: "folder",
      childCount: 0,
      noteCount: 0
    },
    {
      id: "archive",
      name: "Archive",
      parentId: null,
      path: "Archive",
      icon: "folder",
      childCount: 0,
      noteCount: 0
    }
  ];
}

function createDataTransfer(): DataTransfer {
  const data = new Map<string, string>();

  return {
    dropEffect: "move",
    effectAllowed: "all",
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData(format?: string) {
      if (format) {
        data.delete(format);
        return;
      }

      data.clear();
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    setData(format: string, value: string) {
      data.set(format, value);
    },
    setDragImage: vi.fn()
  } as DataTransfer;
}

function buildNotebookTestId(kind: "drag" | "before" | "after", name: string) {
  return `notebook-${kind}-${encodeURIComponent(name)}`;
}
