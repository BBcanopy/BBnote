import type { ComponentProps } from "react";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NoteSummary } from "../api/types";
import { NoteListPane } from "./NoteListPane";

type NoteListPaneProps = ComponentProps<typeof NoteListPane>;

describe("NoteListPane", () => {
  it("renders borderless header icon buttons", () => {
    renderNoteListPane();

    expect(screen.getByRole("button", { name: "New note" })).toHaveClass("bb-icon-button--bare");
    expect(screen.getByRole("button", { name: "Collapse notes pane" })).toHaveClass("bb-icon-button--bare");
  });

  it("does not render the extra note icon inside note cards", () => {
    renderNoteListPane();

    expect(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")).querySelector(".bb-note-icon")).toBeNull();
  });

  it("shows a temporary delete target during note drag and requests confirmation on drop", () => {
    const handleRequestDeleteNote = vi.fn<NoteListPaneProps["onRequestDeleteNote"]>();
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

  it("stretches the delete target across the lane header and hides the other note actions during drag", () => {
    const dataTransfer = createDataTransfer();

    renderNoteListPane();

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });

    expect(screen.queryByTestId("notes-actions")).not.toBeInTheDocument();
    expect(screen.getByTestId("notes-delete-target")).toHaveClass("bb-pane-card__header-center-action");
    expect(screen.getByTestId("notes-delete-target")).toHaveClass("bb-pane-card__header-center-action--lane");
  });

  it("reorders a note before another card when dropped near the top of the target", () => {
    const handleMoveNote = vi.fn<NoteListPaneProps["onMoveNote"]>();
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
        }),
        buildNote({
          id: "note-3",
          title: "Budget wrap-up",
          sortOrder: 2
        })
      ],
      onMoveNote: handleMoveNote
    });

    const targetCard = screen.getByTestId(buildNoteTestId("drag", "Quarterly review"));
    mockElementRect(targetCard, {
      top: 100,
      height: 100
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Budget wrap-up")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(targetCard, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 110
    });
    fireEvent(targetCard, dragOverEvent);
    fireEvent.drop(targetCard, { dataTransfer });

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-3",
      targetId: "note-1",
      position: "before"
    });
  });

  it("reorders a note after another card when dropped near the bottom of the target", () => {
    const handleMoveNote = vi.fn<NoteListPaneProps["onMoveNote"]>();
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
        }),
        buildNote({
          id: "note-3",
          title: "Budget wrap-up",
          sortOrder: 2
        })
      ],
      onMoveNote: handleMoveNote
    });

    const targetCard = screen.getByTestId(buildNoteTestId("drag", "Budget wrap-up"));
    mockElementRect(targetCard, {
      top: 100,
      height: 100
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(targetCard, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 190
    });
    fireEvent(targetCard, dragOverEvent);
    fireEvent.drop(targetCard, { dataTransfer });

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-1",
      targetId: "note-3",
      position: "after"
    });
  });

  it("reorders an adjacent note when the drop lands on the note slot around another card", () => {
    const handleMoveNote = vi.fn<NoteListPaneProps["onMoveNote"]>();
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

    const targetSlot = screen.getByTestId(buildNoteTestId("slot", "Quarterly review"));
    const targetCard = screen.getByTestId(buildNoteTestId("drag", "Quarterly review"));
    mockElementRect(targetCard, {
      top: 100,
      height: 100
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Roadmap follow-up")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(targetSlot, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 188
    });
    fireEvent(targetSlot, dragOverEvent);
    expect(targetSlot).toHaveClass("is-drop-before");
    fireEvent.drop(targetSlot, { dataTransfer });

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-2",
      targetId: "note-1",
      position: "before"
    });
  });

  it("normalizes an adjacent card drop so it still changes the order", () => {
    const handleMoveNote = vi.fn<NoteListPaneProps["onMoveNote"]>();
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

    const targetCard = screen.getByTestId(buildNoteTestId("drag", "Roadmap follow-up"));
    const targetSlot = screen.getByTestId(buildNoteTestId("slot", "Roadmap follow-up"));
    mockElementRect(targetCard, {
      top: 100,
      height: 100
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(targetCard, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 108
    });
    fireEvent(targetCard, dragOverEvent);

    expect(targetSlot).toHaveClass("is-drop-after");

    fireEvent.drop(targetCard, { dataTransfer });

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-1",
      targetId: "note-2",
      position: "after"
    });
  });

  it("reorders a note when the drop lands on the note-list gap instead of a card", () => {
    const handleMoveNote = vi.fn<NoteListPaneProps["onMoveNote"]>();
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
        }),
        buildNote({
          id: "note-3",
          title: "Budget wrap-up",
          sortOrder: 2
        })
      ],
      onMoveNote: handleMoveNote
    });

    const noteList = document.querySelector(".bb-note-list");
    if (!(noteList instanceof HTMLElement)) {
      throw new Error("Expected the note list to render.");
    }

    mockElementRect(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), {
      top: 100,
      height: 60
    });
    mockElementRect(screen.getByTestId(buildNoteTestId("drag", "Roadmap follow-up")), {
      top: 180,
      height: 60
    });
    mockElementRect(screen.getByTestId(buildNoteTestId("drag", "Budget wrap-up")), {
      top: 260,
      height: 60
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Quarterly review")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(noteList, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 248
    });
    fireEvent(noteList, dragOverEvent);
    expect(screen.getByTestId(buildNoteTestId("slot", "Roadmap follow-up"))).toHaveClass("is-drop-after");

    const dropEvent = createEvent.drop(noteList, { dataTransfer });
    Object.defineProperty(dropEvent, "clientY", {
      configurable: true,
      value: 248
    });
    fireEvent(noteList, dropEvent);

    expect(handleMoveNote).toHaveBeenCalledWith({
      draggedId: "note-1",
      targetId: "note-2",
      position: "after"
    });
  });

  it("marks note slots as move destinations during reorder", () => {
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
      ]
    });

    const targetSlot = screen.getByTestId(buildNoteTestId("slot", "Quarterly review"));
    const targetCard = screen.getByTestId(buildNoteTestId("drag", "Quarterly review"));
    mockElementRect(targetCard, {
      top: 100,
      height: 100
    });

    fireEvent.dragStart(screen.getByTestId(buildNoteTestId("drag", "Roadmap follow-up")), { dataTransfer });
    const dragOverEvent = createEvent.dragOver(targetSlot, { dataTransfer });
    Object.defineProperty(dragOverEvent, "clientY", {
      configurable: true,
      value: 102
    });
    fireEvent(targetSlot, dragOverEvent);

    expect(dataTransfer.dropEffect).toBe("move");
    expect(targetSlot).toHaveClass("is-drop-before");
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
  onRequestDeleteNote?: ReturnType<typeof vi.fn<NoteListPaneProps["onRequestDeleteNote"]>>;
  notes?: NoteSummary[];
  onMoveNote?: ReturnType<typeof vi.fn<NoteListPaneProps["onMoveNote"]>>;
}) {
  render(
    <NoteListPane
      notes={overrides?.notes ?? buildNotes()}
      search=""
      onSearchChange={vi.fn<NoteListPaneProps["onSearchChange"]>()}
      selectedNoteId="note-1"
      onSelectNote={vi.fn<NoteListPaneProps["onSelectNote"]>()}
      onCreateNote={vi.fn<NoteListPaneProps["onCreateNote"]>()}
      onDraggedNoteChange={vi.fn<NoteListPaneProps["onDraggedNoteChange"]>()}
      onRequestDeleteNote={overrides?.onRequestDeleteNote ?? vi.fn<NoteListPaneProps["onRequestDeleteNote"]>()}
      onCollapse={vi.fn<NonNullable<NoteListPaneProps["onCollapse"]>>()}
      loading={false}
      notebookName="Projects"
      canCreateNote
      canReorder
      enableCrossNotebookMove
      onMoveNote={overrides?.onMoveNote ?? vi.fn<NoteListPaneProps["onMoveNote"]>()}
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

function mockElementRect(element: HTMLElement, rect: { top: number; height: number }) {
  const mockRect = {
    x: 0,
    y: rect.top,
    top: rect.top,
    left: 0,
    width: 240,
    height: rect.height,
    right: 240,
    bottom: rect.top + rect.height,
    toJSON: () => ({})
  } as DOMRect;
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => mockRect)
  });
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

function buildNoteTestId(kind: "drag" | "slot" | "before" | "after", title: string) {
  return `note-${kind}-${encodeURIComponent(title)}`;
}
