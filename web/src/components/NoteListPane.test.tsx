import { fireEvent, render, screen } from "@testing-library/react";
import type { NoteSummary } from "../api/types";
import { NoteListPane } from "./NoteListPane";

describe("NoteListPane", () => {
  it("renders borderless header icon buttons", () => {
    renderNoteListPane();

    expect(screen.getByRole("button", { name: "New note" })).toHaveClass("bb-icon-button--bare");
    expect(screen.getByRole("button", { name: "Collapse notes pane" })).toHaveClass("bb-icon-button--bare");
  });

  it("shows a temporary delete target during note drag and requests confirmation on drop", () => {
    const handleRequestDeleteNote = vi.fn();
    const dataTransfer = createDataTransfer();

    renderNoteListPane({
      onRequestDeleteNote: handleRequestDeleteNote
    });

    expect(screen.queryByTestId("notes-delete-target")).not.toBeInTheDocument();

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });

    const deleteTarget = screen.getByTestId("notes-delete-target");
    expect(deleteTarget).toBeInTheDocument();

    fireEvent.dragOver(deleteTarget, { dataTransfer });
    fireEvent.drop(deleteTarget, { dataTransfer });

    expect(handleRequestDeleteNote).toHaveBeenCalledWith({
      id: "note-1",
      title: "Quarterly review"
    });
  });
});

function renderNoteListPane(overrides?: {
  onRequestDeleteNote?: ReturnType<typeof vi.fn>;
}) {
  render(
    <NoteListPane
      notes={buildNotes()}
      search=""
      onSearchChange={vi.fn()}
      selectedNoteId="note-1"
      onSelectNote={vi.fn()}
      onCreateNote={vi.fn()}
      onRequestDeleteNote={overrides?.onRequestDeleteNote ?? vi.fn()}
      onCollapse={vi.fn()}
      loading={false}
      notebookName="Projects"
      canCreateNote
      canReorder
      enableCrossNotebookMove
      onMoveNote={vi.fn()}
    />
  );
}

function buildNotes(): NoteSummary[] {
  return [
    {
      id: "note-1",
      folderId: "folder-1",
      title: "Quarterly review",
      excerpt: "Discuss roadmap and blockers.",
      sortOrder: 0,
      updatedAt: "2026-03-25T00:00:00.000Z",
      attachmentCount: 0
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

function buildNoteTestId(kind: "drag" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}
