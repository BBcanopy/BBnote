import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("centers the delete target and hides the other note actions during drag", () => {
    const dataTransfer = createDataTransfer();

    renderNoteListPane();

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });

    expect(screen.queryByTestId("notes-actions")).not.toBeInTheDocument();
    expect(screen.getByTestId("notes-delete-target")).toHaveClass("bb-pane-card__header-center-action");
  });

  it("reorders a note when dropped directly onto another note card", () => {
    const handleMoveNote = vi.fn();
    const dataTransfer = createDataTransfer();

    renderNoteListPane({
      notes: [
        buildNote({
          id: "note-1",
          title: "Quarterly review",
          sortOrder: 0
        }),
        buildNote({
          id: "note-2",
          title: "Roadmap follow-up",
          sortOrder: 1
        })
      ],
      onMoveNote: handleMoveNote
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Roadmap follow-up")), { dataTransfer });
    fireEvent.dragOver(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    fireEvent.drop(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-2",
      targetId: "note-1",
      position: "before"
    });
  });

  it("shows untitled note placeholder text for blank titles", () => {
    renderNoteListPane({
      notes: [
        {
          id: "note-1",
          folderId: "folder-1",
          title: "   ",
          excerpt: "",
          sortOrder: 0,
          updatedAt: "2026-03-25T00:00:00.000Z",
          attachmentCount: 0
        }
      ]
    });

    expect(screen.getByText("Untitled note")).toBeInTheDocument();
    expect(screen.getByText("Empty note")).toBeInTheDocument();
  });

  it("clears the temporary delete target when a dragged note leaves the current list", async () => {
    const onDraggedNoteChange = vi.fn();
    const dataTransfer = createDataTransfer();
    const { rerender } = render(
      <NoteListPane
        notes={buildNotes()}
        search=""
        onSearchChange={vi.fn()}
        selectedNoteId="note-1"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
        onDraggedNoteChange={onDraggedNoteChange}
        onRequestDeleteNote={vi.fn()}
        onCollapse={vi.fn()}
        loading={false}
        notebookName="Projects"
        canCreateNote
        canReorder
        enableCrossNotebookMove
        onMoveNote={vi.fn()}
      />
    );

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    expect(screen.getByTestId("notes-delete-target")).toBeInTheDocument();

    rerender(
      <NoteListPane
        notes={[]}
        search=""
        onSearchChange={vi.fn()}
        selectedNoteId={null}
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
        onDraggedNoteChange={onDraggedNoteChange}
        onRequestDeleteNote={vi.fn()}
        onCollapse={vi.fn()}
        loading={false}
        notebookName="Projects"
        canCreateNote
        canReorder
        enableCrossNotebookMove
        onMoveNote={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId("notes-delete-target")).not.toBeInTheDocument();
    });
    expect(onDraggedNoteChange).toHaveBeenLastCalledWith(null);
  });

  it("clears the temporary delete target when a dragged note moves into a different notebook", async () => {
    const onDraggedNoteChange = vi.fn();
    const dataTransfer = createDataTransfer();
    const { rerender } = render(
      <NoteListPane
        notes={buildNotes()}
        search=""
        onSearchChange={vi.fn()}
        selectedNoteId="note-1"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
        onDraggedNoteChange={onDraggedNoteChange}
        onRequestDeleteNote={vi.fn()}
        onCollapse={vi.fn()}
        loading={false}
        notebookName="Projects"
        canCreateNote
        canReorder
        enableCrossNotebookMove
        onMoveNote={vi.fn()}
      />
    );

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    expect(screen.getByTestId("notes-delete-target")).toBeInTheDocument();

    rerender(
      <NoteListPane
        notes={[
          {
            ...buildNotes()[0],
            folderId: "folder-2"
          }
        ]}
        search=""
        onSearchChange={vi.fn()}
        selectedNoteId="note-1"
        onSelectNote={vi.fn()}
        onCreateNote={vi.fn()}
        onDraggedNoteChange={onDraggedNoteChange}
        onRequestDeleteNote={vi.fn()}
        onCollapse={vi.fn()}
        loading={false}
        notebookName="Archive"
        canCreateNote
        canReorder
        enableCrossNotebookMove
        onMoveNote={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByTestId("notes-delete-target")).not.toBeInTheDocument();
    });
    expect(onDraggedNoteChange).toHaveBeenLastCalledWith(null);
  });
});

function renderNoteListPane(overrides?: {
  onRequestDeleteNote?: ReturnType<typeof vi.fn>;
  notes?: NoteSummary[];
  onMoveNote?: ReturnType<typeof vi.fn>;
}) {
  render(
    <NoteListPane
      notes={overrides?.notes ?? buildNotes()}
      search=""
      onSearchChange={vi.fn()}
      selectedNoteId="note-1"
      onSelectNote={vi.fn()}
      onCreateNote={vi.fn()}
      onDraggedNoteChange={vi.fn()}
      onRequestDeleteNote={overrides?.onRequestDeleteNote ?? vi.fn()}
      onCollapse={vi.fn()}
      loading={false}
      notebookName="Projects"
      canCreateNote
      canReorder
      enableCrossNotebookMove
      onMoveNote={overrides?.onMoveNote ?? vi.fn()}
    />
  );
}

function buildNotes(): NoteSummary[] {
  return [buildNote()];
}

function buildNote(overrides?: Partial<NoteSummary>): NoteSummary {
  return {
    id: "note-1",
    folderId: "folder-1",
    title: "Quarterly review",
    excerpt: "Discuss roadmap and blockers.",
    sortOrder: 0,
    updatedAt: "2026-03-25T00:00:00.000Z",
    attachmentCount: 0,
    ...overrides
  };
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
