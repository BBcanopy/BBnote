import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteSummary } from "../api/types";
import { NoteReferencePicker } from "./NoteReferencePicker";

const { listNotes } = vi.hoisted(() => ({
  listNotes: vi.fn()
}));

vi.mock("../api/client", () => ({
  listNotes
}));

function buildNote(id: string, title: string, excerpt = ""): NoteSummary {
  return {
    id,
    folderId: "folder-1",
    title,
    excerpt,
    sortOrder: 0,
    updatedAt: "2026-11-06T00:00:00.000Z",
    attachmentCount: 0
  };
}

function renderPicker(overrides?: Partial<Parameters<typeof NoteReferencePicker>[0]>) {
  const onOpen = vi.fn();
  const onPick = vi.fn();
  const view = render(
    <NoteReferencePicker currentNoteId="current" disabled={false} disabledTitle="Switch to Markdown" onOpen={onOpen} onPick={onPick} {...overrides} />
  );
  return { ...view, onOpen, onPick };
}

describe("NoteReferencePicker", () => {
  beforeEach(() => {
    listNotes.mockReset();
    listNotes.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("stays closed and quiet until it is opened", () => {
    renderPicker();

    expect(screen.queryByRole("dialog", { name: "Link to note" })).not.toBeInTheDocument();
    expect(listNotes).not.toHaveBeenCalled();
  });

  it("captures the selection on open and lists recent notes without the current one", async () => {
    const user = userEvent.setup();
    listNotes.mockResolvedValue({
      items: [buildNote("current", "This note"), buildNote("note-1", "Project plan", "First steps"), buildNote("note-2", "  ")],
      nextCursor: null
    });
    const { onOpen } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Link to note" }));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(listNotes).toHaveBeenCalledWith({ q: undefined, limit: 20 });
    expect(await screen.findByRole("button", { name: /project plan/i })).toHaveTextContent("First steps");
    expect(screen.getByRole("button", { name: "Untitled note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /this note/i })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveFocus();
  });

  it("searches as the user types and explains an empty result", async () => {
    const user = userEvent.setup();
    listNotes.mockImplementation(async (params: { q?: string }) => ({
      items: params.q === "budget" ? [buildNote("note-3", "Budget")] : [],
      nextCursor: null
    }));
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Link to note" }));
    const search = screen.getByRole("searchbox", { name: "Search notes" });
    await user.type(search, "budget");

    expect(await screen.findByRole("button", { name: "Budget" })).toBeInTheDocument();
    expect(listNotes).toHaveBeenLastCalledWith({ q: "budget", limit: 20 });

    await user.type(search, "s");
    expect(await screen.findByRole("status")).toHaveTextContent("No notes match.");
  });

  it("ignores a slower response for an older search", async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: unknown) => void = () => undefined;
    listNotes.mockImplementation((params: { q?: string }) => {
      if (params.q === undefined) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({ items: [buildNote("note-3", "Budget")], nextCursor: null });
    });
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Link to note" }));
    await user.type(screen.getByRole("searchbox", { name: "Search notes" }), "budget");
    await screen.findByRole("button", { name: "Budget" });

    resolveFirst({ items: [buildNote("note-1", "Stale result")], nextCursor: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Budget" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Stale result" })).not.toBeInTheDocument();
  });

  it("reports the note and closes when one is picked", async () => {
    const user = userEvent.setup();
    const note = buildNote("note-1", "Project plan");
    listNotes.mockResolvedValue({ items: [note], nextCursor: null });
    const { onPick } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Link to note" }));
    await user.click(await screen.findByRole("button", { name: "Project plan" }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(note);
    expect(screen.queryByRole("dialog", { name: "Link to note" })).not.toBeInTheDocument();
  });

  it("closes on escape and on an outside press without picking", async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker();
    const toggle = screen.getByRole("button", { name: "Link to note" });

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Link to note" })).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(screen.getByRole("dialog", { name: "Link to note" })).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("dialog", { name: "Link to note" })).not.toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("starts each opening with a fresh search", async () => {
    const user = userEvent.setup();
    renderPicker();
    const toggle = screen.getByRole("button", { name: "Link to note" });

    await user.click(toggle);
    await user.type(screen.getByRole("searchbox", { name: "Search notes" }), "budget");
    await user.keyboard("{Escape}");
    await user.click(toggle);

    expect(screen.getByRole("searchbox", { name: "Search notes" })).toHaveValue("");
  });

  it("shows when notes can't be loaded", async () => {
    const user = userEvent.setup();
    listNotes.mockRejectedValue(new Error("offline"));
    renderPicker();

    await user.click(screen.getByRole("button", { name: "Link to note" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Notes couldn't be loaded."));
  });

  it("closes when it becomes disabled and explains why it can't be used", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <NoteReferencePicker currentNoteId="current" disabled={false} disabledTitle="Switch to Markdown" onOpen={vi.fn()} onPick={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Link to note" }));
    expect(screen.getByRole("dialog", { name: "Link to note" })).toBeInTheDocument();

    rerender(<NoteReferencePicker currentNoteId="current" disabled disabledTitle="Switch to Markdown" onOpen={vi.fn()} onPick={vi.fn()} />);

    expect(screen.queryByRole("dialog", { name: "Link to note" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link to note" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Link to note" })).toHaveAttribute("title", "Switch to Markdown");
  });
});
