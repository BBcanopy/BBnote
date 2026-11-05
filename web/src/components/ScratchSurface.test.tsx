import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { addScratchStroke, createScratchStroke, SCRATCH_MAX_POINTS, type ScratchDocument } from "../utils/scratch";
import { useScratchEditor, type ScratchEditor } from "./ScratchSurface";

const stroke = createScratchStroke("draw", { x: 10, y: 20 });

/** Drives the hook the way NotesPage does: changes come back in as the next `scratchpad`. */
function renderScratchEditor(initial: ScratchDocument | null = null) {
  const onChange = vi.fn();
  const view = renderHook(
    (props: { scratchpad: ScratchDocument | null; sessionKey: number; disabled: boolean }) =>
      useScratchEditor({
        ...props,
        onChange(next) {
          onChange(next);
          view.rerender({ ...props, scratchpad: next });
        }
      }),
    { initialProps: { scratchpad: initial, sessionKey: 1, disabled: false } }
  );

  return {
    onChange,
    editor: () => view.result.current as ScratchEditor,
    rerender: view.rerender
  };
}

function pressKey(key: string, init: KeyboardEventInit = {}, target: EventTarget = window) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });
}

describe("useScratchEditor", () => {
  it("starts on the draw tool whenever it is activated", () => {
    const { editor } = renderScratchEditor();

    act(() => editor().setActive(true));
    act(() => editor().setTool("erase"));
    expect(editor().tool).toBe("erase");

    act(() => editor().setActive(false));
    act(() => editor().setActive(true));
    expect(editor().tool).toBe("draw");
  });

  it("locks the layout width on the first stroke and reports the new document", () => {
    const { editor, onChange } = renderScratchEditor();

    act(() => editor().addStroke(stroke, 720));

    expect(onChange).toHaveBeenLastCalledWith({ version: 2, layoutWidth: 720, strokes: [stroke] });
    expect(editor().canUndo).toBe(true);
  });

  it("undoes back to no overlay and redoes forward again", () => {
    const { editor } = renderScratchEditor();

    act(() => editor().addStroke(stroke, 720));
    act(() => editor().addStroke(stroke, 720));
    expect(editor().scratchpad?.strokes).toHaveLength(2);

    act(() => editor().undo());
    expect(editor().scratchpad?.strokes).toHaveLength(1);
    act(() => editor().undo());
    expect(editor().scratchpad).toBeNull();
    expect(editor().canUndo).toBe(false);

    act(() => editor().redo());
    act(() => editor().redo());
    expect(editor().scratchpad?.strokes).toHaveLength(2);
    expect(editor().canRedo).toBe(false);
  });

  it("makes clearing undoable", () => {
    const existing = addScratchStroke(null, stroke, 720);
    const { editor } = renderScratchEditor(existing);

    act(() => editor().clear());
    expect(editor().scratchpad).toBeNull();

    act(() => editor().undo());
    expect(editor().scratchpad).toBe(existing);
  });

  it("drops the redo stack after a new stroke", () => {
    const { editor } = renderScratchEditor();

    act(() => editor().addStroke(stroke, 720));
    act(() => editor().undo());
    expect(editor().canRedo).toBe(true);

    act(() => editor().addStroke(stroke, 720));
    expect(editor().canRedo).toBe(false);
  });

  it("does not record history for erasing nothing", () => {
    const { editor, onChange } = renderScratchEditor();

    act(() => editor().addStroke(createScratchStroke("erase", { x: 1, y: 1 }), 720));

    expect(onChange).not.toHaveBeenCalled();
    expect(editor().canUndo).toBe(false);
  });

  it("resets when a different note opens but survives a draft being saved", () => {
    const { editor, rerender } = renderScratchEditor();

    act(() => editor().setActive(true));
    act(() => editor().addStroke(stroke, 720));

    // Saving a draft assigns it an id without starting a new session.
    rerender({ scratchpad: editor().scratchpad, sessionKey: 1, disabled: false });
    expect(editor().active).toBe(true);
    expect(editor().canUndo).toBe(true);

    rerender({ scratchpad: null, sessionKey: 2, disabled: false });
    expect(editor().active).toBe(false);
    expect(editor().canUndo).toBe(false);
  });

  it("reports when the overlay is full", () => {
    const points = Array.from({ length: SCRATCH_MAX_POINTS }, () => ({ x: 1, y: 1 }));
    const { editor } = renderScratchEditor({ version: 2, layoutWidth: 720, strokes: [{ ...stroke, points }] });

    expect(editor().full).toBe(true);
  });

  describe("keyboard shortcuts", () => {
    it("undoes and redoes while drawing", () => {
      const { editor } = renderScratchEditor();
      act(() => editor().setActive(true));
      act(() => editor().addStroke(stroke, 720));

      pressKey("z", { ctrlKey: true });
      expect(editor().scratchpad).toBeNull();

      pressKey("z", { ctrlKey: true, shiftKey: true });
      expect(editor().scratchpad?.strokes).toHaveLength(1);

      pressKey("z", { metaKey: true });
      pressKey("y", { ctrlKey: true });
      expect(editor().scratchpad?.strokes).toHaveLength(1);
    });

    it("leaves drawing mode on Escape", () => {
      const { editor } = renderScratchEditor();
      act(() => editor().setActive(true));

      pressKey("Escape");

      expect(editor().active).toBe(false);
    });

    it("leaves native text undo alone when focus is in a text field", () => {
      const { editor } = renderScratchEditor();
      act(() => editor().setActive(true));
      act(() => editor().addStroke(stroke, 720));
      const textarea = document.body.appendChild(document.createElement("textarea"));

      pressKey("z", { ctrlKey: true }, textarea);

      expect(editor().scratchpad?.strokes).toHaveLength(1);
      textarea.remove();
    });

    it("does nothing outside drawing mode", () => {
      const { editor } = renderScratchEditor();
      act(() => editor().addStroke(stroke, 720));

      pressKey("z", { ctrlKey: true });

      expect(editor().scratchpad?.strokes).toHaveLength(1);
    });
  });
});
