import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NoteSummary } from "../api/types";
import { LinkPicker } from "./LinkPicker";

const { listNotes } = vi.hoisted(() => ({
  listNotes: vi.fn()
}));

vi.mock("../api/client", () => ({
  listNotes
}));

const SEARCH_BOX = { name: "Search notes or paste a link" };
const TOGGLE = { name: "Insert link" };

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

function renderPicker() {
  const onOpen = vi.fn();
  const onPickNote = vi.fn();
  const onPickLink = vi.fn();
  const view = render(
    <LinkPicker
      currentNoteId="current"
      disabled={false}
      disabledTitle="Switch to Markdown"
      onOpen={onOpen}
      onPickNote={onPickNote}
      onPickLink={onPickLink}
    />
  );
  return { ...view, onOpen, onPickNote, onPickLink };
}

describe("LinkPicker", () => {
  beforeEach(() => {
    listNotes.mockReset();
    listNotes.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("stays closed and quiet until it is opened", () => {
    renderPicker();

    expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
    expect(listNotes).not.toHaveBeenCalled();
  });

  it("captures the selection on open and lists recent notes without the current one", async () => {
    const user = userEvent.setup();
    listNotes.mockResolvedValue({
      items: [buildNote("current", "This note"), buildNote("note-1", "Project plan", "First steps"), buildNote("note-2", "  ")],
      nextCursor: null
    });
    const { onOpen } = renderPicker();

    await user.click(screen.getByRole("button", TOGGLE));

    expect(onOpen).toHaveBeenCalledOnce();
    expect(listNotes).toHaveBeenCalledWith({ q: undefined, limit: 20 });
    expect(await screen.findByRole("button", { name: /project plan/i })).toHaveTextContent("First steps");
    expect(screen.getByRole("button", { name: "Untitled note" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /this note/i })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", SEARCH_BOX)).toHaveFocus();
  });

  it("searches as the user types and says when nothing matches", async () => {
    const user = userEvent.setup();
    listNotes.mockImplementation(async (params: { q?: string }) => ({
      items: params.q === "budget" ? [buildNote("note-3", "Budget")] : [],
      nextCursor: null
    }));
    renderPicker();

    await user.click(screen.getByRole("button", TOGGLE));
    const search = screen.getByRole("searchbox", SEARCH_BOX);
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

    await user.click(screen.getByRole("button", TOGGLE));
    await user.type(screen.getByRole("searchbox", SEARCH_BOX), "budget");
    await screen.findByRole("button", { name: "Budget" });

    resolveFirst({ items: [buildNote("note-1", "Stale result")], nextCursor: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Budget" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Stale result" })).not.toBeInTheDocument();
  });

  it("reports the note and closes when one is picked", async () => {
    const user = userEvent.setup();
    const note = buildNote("note-1", "Project plan");
    listNotes.mockResolvedValue({ items: [note], nextCursor: null });
    const { onPickNote, onPickLink } = renderPicker();

    await user.click(screen.getByRole("button", TOGGLE));
    await user.click(await screen.findByRole("button", { name: "Project plan" }));

    expect(onPickNote).toHaveBeenCalledExactlyOnceWith(note);
    expect(onPickLink).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
  });

  describe("web addresses", () => {
    it("offers a link for a typed address and reports it when clicked", async () => {
      const user = userEvent.setup();
      const { onPickLink, onPickNote } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "example.com/guide");
      await user.click(screen.getByRole("button", { name: "Link to https://example.com/guide" }));

      expect(onPickLink).toHaveBeenCalledExactlyOnceWith({ url: "https://example.com/guide", label: "example.com/guide" });
      expect(onPickNote).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
    });

    it("replaces the empty message rather than saying nothing matches", async () => {
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "https://example.com");

      await waitFor(() => expect(listNotes).toHaveBeenLastCalledWith({ q: "https://example.com", limit: 20 }));
      expect(screen.getByRole("button", { name: "Link to https://example.com/" })).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("lists matching notes under a text that could be either", async () => {
      const user = userEvent.setup();
      listNotes.mockImplementation(async (params: { q?: string }) => ({
        items: params.q === "plan.md" ? [buildNote("note-1", "plan.md")] : [],
        nextCursor: null
      }));
      renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "plan.md");

      expect(await screen.findByRole("button", { name: "plan.md" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Link to https://plan.md/" })).toBeInTheDocument();
    });

    it.each(["javascript:alert(1)", "project plan", "v1.2"])("offers no link for %s", async (text) => {
      const user = userEvent.setup();
      renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), text);

      await screen.findByRole("status");
      expect(screen.queryByRole("button", { name: /^Link to / })).not.toBeInTheDocument();
    });
  });

  describe("pressing Enter", () => {
    it("inserts a typed address", async () => {
      const user = userEvent.setup();
      const { onPickLink } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "https://example.com{Enter}");

      expect(onPickLink).toHaveBeenCalledExactlyOnceWith({ url: "https://example.com/", label: "https://example.com" });
    });

    it("picks the address over a note when the text could be either", async () => {
      const user = userEvent.setup();
      listNotes.mockResolvedValue({ items: [buildNote("note-1", "plan.md")], nextCursor: null });
      const { onPickLink, onPickNote } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "plan.md");
      await screen.findByRole("button", { name: "plan.md" });
      await user.keyboard("{Enter}");

      expect(onPickLink).toHaveBeenCalledOnce();
      expect(onPickNote).not.toHaveBeenCalled();
    });

    it("picks the top note once the search has caught up", async () => {
      const user = userEvent.setup();
      const first = buildNote("note-1", "Budget one");
      listNotes.mockImplementation(async (params: { q?: string }) => ({
        items: params.q === "budget" ? [first, buildNote("note-2", "Budget two")] : [],
        nextCursor: null
      }));
      const { onPickNote } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "budget");
      await screen.findByRole("button", { name: "Budget one" });
      await user.keyboard("{Enter}");

      expect(onPickNote).toHaveBeenCalledExactlyOnceWith(first);
    });

    it("does not pick an old result while the search is still running", async () => {
      const user = userEvent.setup();
      listNotes.mockImplementation((params: { q?: string }) =>
        params.q === undefined ? Promise.resolve({ items: [buildNote("note-1", "Recent note")], nextCursor: null }) : new Promise(() => undefined)
      );
      const { onPickNote } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await screen.findByRole("button", { name: "Recent note" });
      await user.type(screen.getByRole("searchbox", SEARCH_BOX), "budget{Enter}");

      expect(onPickNote).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", TOGGLE)).toBeInTheDocument();
    });

    it("does nothing in an empty box, even with recent notes listed", async () => {
      const user = userEvent.setup();
      listNotes.mockResolvedValue({ items: [buildNote("note-1", "Recent note")], nextCursor: null });
      const { onPickNote, onPickLink } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      await screen.findByRole("button", { name: "Recent note" });
      await user.keyboard("{Enter}");

      expect(onPickNote).not.toHaveBeenCalled();
      expect(onPickLink).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", TOGGLE)).toBeInTheDocument();
    });

    it("leaves Enter alone while an input method is composing", async () => {
      const user = userEvent.setup();
      const { onPickLink } = renderPicker();

      await user.click(screen.getByRole("button", TOGGLE));
      const search = screen.getByRole("searchbox", SEARCH_BOX);
      await user.type(search, "https://example.com");
      fireEvent.keyDown(search, { key: "Enter", isComposing: true });

      expect(onPickLink).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", TOGGLE)).toBeInTheDocument();
    });
  });

  it("closes on escape and on an outside press without picking", async () => {
    const user = userEvent.setup();
    const { onPickNote, onPickLink } = renderPicker();
    const toggle = screen.getByRole("button", TOGGLE);

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();

    await user.click(toggle);
    expect(screen.getByRole("dialog", TOGGLE)).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
    expect(onPickNote).not.toHaveBeenCalled();
    expect(onPickLink).not.toHaveBeenCalled();
  });

  it("starts each opening with a fresh search", async () => {
    const user = userEvent.setup();
    renderPicker();
    const toggle = screen.getByRole("button", TOGGLE);

    await user.click(toggle);
    await user.type(screen.getByRole("searchbox", SEARCH_BOX), "budget");
    await user.keyboard("{Escape}");
    await user.click(toggle);

    expect(screen.getByRole("searchbox", SEARCH_BOX)).toHaveValue("");
  });

  it("shows when notes can't be loaded, and still offers a typed address", async () => {
    const user = userEvent.setup();
    listNotes.mockRejectedValue(new Error("offline"));
    renderPicker();

    await user.click(screen.getByRole("button", TOGGLE));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Notes couldn't be loaded."));

    await user.type(screen.getByRole("searchbox", SEARCH_BOX), "example.com");
    expect(screen.getByRole("button", { name: "Link to https://example.com/" })).toBeInTheDocument();
  });

  it("closes when it becomes disabled and explains why it can't be used", async () => {
    const user = userEvent.setup();
    const props = { currentNoteId: "current", disabledTitle: "Switch to Markdown", onOpen: vi.fn(), onPickNote: vi.fn(), onPickLink: vi.fn() };
    const { rerender } = render(<LinkPicker {...props} disabled={false} />);

    await user.click(screen.getByRole("button", TOGGLE));
    expect(screen.getByRole("dialog", TOGGLE)).toBeInTheDocument();

    rerender(<LinkPicker {...props} disabled />);

    expect(screen.queryByRole("dialog", TOGGLE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", TOGGLE)).toBeDisabled();
    expect(screen.getByRole("button", TOGGLE)).toHaveAttribute("title", "Switch to Markdown");
  });
});
