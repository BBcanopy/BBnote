import { fireEvent, render, screen } from "@testing-library/react";
import type { FolderNode } from "../api/types";
import { FolderTree } from "./FolderTree";

describe("FolderTree", () => {
  it("moves a notebook into another notebook from the drag handle", () => {
    const handleMoveNotebook = vi.fn();
    const dataTransfer = createDataTransfer();

    renderFolderTree({
      onMoveNotebook: handleMoveNotebook
    });

    fireEvent.dragStart(screen.getByTestId(buildNotebookHandleTestId("Archive")), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId(buildNotebookTestId("drag", "Projects")), { dataTransfer });
    fireEvent.drop(screen.getByTestId(buildNotebookTestId("drag", "Projects")), { dataTransfer });

    expect(handleMoveNotebook).toHaveBeenCalledWith({
      draggedId: "archive",
      targetId: "projects",
      position: "inside"
    });
  });

  it("reorders a notebook before a sibling from the drag handle", () => {
    const handleMoveNotebook = vi.fn();
    const dataTransfer = createDataTransfer();

    renderFolderTree({
      onMoveNotebook: handleMoveNotebook
    });

    fireEvent.dragStart(screen.getByTestId(buildNotebookHandleTestId("Archive")), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId(buildNotebookTestId("before", "Roadmaps")), { dataTransfer });
    fireEvent.drop(screen.getByTestId(buildNotebookTestId("before", "Roadmaps")), { dataTransfer });

    expect(handleMoveNotebook).toHaveBeenCalledWith({
      draggedId: "archive",
      targetId: "roadmaps",
      position: "before"
    });
  });
});

function renderFolderTree(overrides?: {
  onMoveNotebook?: ReturnType<typeof vi.fn>;
}) {
  render(
    <FolderTree
      folders={buildFolders()}
      selectedFolderId="projects"
      onCreateNotebook={vi.fn()}
      onMoveNotebook={overrides?.onMoveNotebook ?? vi.fn()}
      onMoveNote={vi.fn()}
      onRequestDeleteNotebook={vi.fn()}
      onSelectFolder={vi.fn()}
      onUpdateNotebookIcon={() => Promise.resolve()}
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
      noteCount: 0
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

function buildNotebookHandleTestId(name: string) {
  return `notebook-handle-${encodeURIComponent(name)}`;
}
