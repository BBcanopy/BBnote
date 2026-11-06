import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type SyntheticEvent
} from "react";
import { ArrowUUpLeft, ArrowUUpRight, Eraser, PencilSimple } from "@phosphor-icons/react";
import {
  addScratchStroke,
  appendScratchPoint,
  createScratchStroke,
  getRemainingScratchPoints,
  getScratchMinStageHeight,
  resolveScratchCanvasDensity,
  resolveScratchPoint,
  resolveScratchStageScale,
  type ScratchDocument,
  type ScratchPoint,
  type ScratchStroke,
  type ScratchTool
} from "../utils/scratch";
import { buttonPrimary, buttonSecondary } from "./buttonStyles";

const MAX_UNDO_STEPS = 100;

export interface ScratchEditor {
  active: boolean;
  tool: ScratchTool;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  full: boolean;
  scratchpad: ScratchDocument | null;
  setActive(active: boolean): void;
  setTool(tool: ScratchTool): void;
  addStroke(stroke: ScratchStroke, layoutWidth: number): void;
  undo(): void;
  redo(): void;
  clear(): void;
}

/**
 * Owns drawing state above the editor panels. The desktop and mobile panels are both mounted, and browser
 * zoom can cross the breakpoint between them, so this state must survive switching which one is visible.
 */
export function useScratchEditor(options: {
  /** Changes when a different note opens, but not when a draft is saved and receives its id. */
  sessionKey: number;
  scratchpad: ScratchDocument | null;
  disabled: boolean;
  onChange(scratchpad: ScratchDocument | null): void;
}): ScratchEditor {
  const { disabled, onChange, scratchpad, sessionKey } = options;
  const [active, setActive] = useState(false);
  const [tool, setTool] = useState<ScratchTool>("draw");
  const [history, setHistory] = useState<{ past: Array<ScratchDocument | null>; future: Array<ScratchDocument | null> }>({
    past: [],
    future: []
  });

  useEffect(() => {
    setActive(false);
    setTool("draw");
    setHistory({ past: [], future: [] });
  }, [sessionKey]);

  function commit(next: ScratchDocument | null) {
    if (next === scratchpad) {
      return;
    }

    setHistory((current) => ({ past: [...current.past, scratchpad].slice(-MAX_UNDO_STEPS), future: [] }));
    onChange(next);
  }

  function undo() {
    if (history.past.length === 0) {
      return;
    }

    setHistory({ past: history.past.slice(0, -1), future: [scratchpad, ...history.future] });
    onChange(history.past[history.past.length - 1]);
  }

  function redo() {
    if (history.future.length === 0) {
      return;
    }

    setHistory({ past: [...history.past, scratchpad], future: history.future.slice(1) });
    onChange(history.future[0]);
  }

  const shortcutsRef = useRef({ undo, redo, setActive });
  shortcutsRef.current = { undo, redo, setActive };

  useEffect(() => {
    if (!active || disabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      // Typing keeps its native undo; the shortcuts apply when focus is outside any text field.
      const { target } = event;
      const inTextField = target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']");
      if (event.defaultPrevented || inTextField) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        shortcutsRef.current.setActive(false);
        return;
      }

      const key = event.key.toLowerCase();
      if (!(event.ctrlKey || event.metaKey) || (key !== "z" && key !== "y")) {
        return;
      }

      event.preventDefault();
      if (key === "y" || event.shiftKey) {
        shortcutsRef.current.redo();
      } else {
        shortcutsRef.current.undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, disabled]);

  return {
    active,
    tool,
    disabled,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    full: getRemainingScratchPoints(scratchpad) === 0,
    scratchpad,
    setActive(next) {
      if (next) {
        setTool("draw");
      }
      setActive(next);
    },
    setTool,
    addStroke: (stroke, layoutWidth) => commit(addScratchStroke(scratchpad, stroke, layoutWidth)),
    undo,
    redo,
    clear: () => commit(null)
  };
}

export function ScratchToolbar(props: { editor: ScratchEditor }) {
  const { editor } = props;

  return (
    <div className="bb-scratch-toolbar" role="toolbar" aria-label="Scratch tools" data-testid="scratch-toolbar">
      <div className="bb-scratch-toolbar__group" role="group" aria-label="Scratch tool">
        <ScratchToolButton editor={editor} tool="draw" label="Draw" icon={<PencilSimple size={16} />} />
        <ScratchToolButton editor={editor} tool="erase" label="Eraser" icon={<Eraser size={16} />} />
      </div>
      <div className="bb-scratch-toolbar__group" role="group" aria-label="Scratch history">
        <button
          type="button"
          onClick={editor.undo}
          disabled={editor.disabled || !editor.canUndo}
          aria-label="Undo stroke"
          title="Undo stroke"
          className={`${buttonSecondary} bb-scratch-toolbar__button`}
        >
          <ArrowUUpLeft size={16} />
        </button>
        <button
          type="button"
          onClick={editor.redo}
          disabled={editor.disabled || !editor.canRedo}
          aria-label="Redo stroke"
          title="Redo stroke"
          className={`${buttonSecondary} bb-scratch-toolbar__button`}
        >
          <ArrowUUpRight size={16} />
        </button>
      </div>
      {editor.full ? (
        <p role="status" className="bb-scratch-toolbar__status text-sm">
          This overlay is full. Undo or clear to keep drawing.
        </p>
      ) : null}
      <div className="bb-scratch-toolbar__group bb-scratch-toolbar__group--end">
        <button
          type="button"
          onClick={editor.clear}
          disabled={editor.disabled || !editor.scratchpad}
          className={`${buttonSecondary} bb-scratch-toolbar__button`}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => editor.setActive(false)}
          disabled={editor.disabled}
          className={`${buttonPrimary} bb-scratch-toolbar__button`}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function ScratchToolButton(props: { editor: ScratchEditor; tool: ScratchTool; label: string; icon: ReactNode }) {
  const selected = props.editor.tool === props.tool;

  return (
    <button
      type="button"
      onClick={() => props.editor.setTool(props.tool)}
      disabled={props.editor.disabled}
      aria-pressed={selected}
      className={`${buttonSecondary} bb-scratch-toolbar__button${selected ? " is-selected" : ""}`}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

/**
 * Wraps the editor surface. The wrappers stay mounted so turning scratch on never remounts the textarea
 * and costs it focus, selection, or undo history. Without scratch they render no boxes (`display: contents`)
 * and the surface lays out exactly as it does in a plain note.
 */
export function ScratchStage(props: {
  editor: ScratchEditor;
  /** Only present in the markdown pane; a textarea cannot grow to fit its text without help. */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Changes whenever the surface's content does. */
  contentKey: string;
  children: ReactNode;
}) {
  const { contentKey, editor, textareaRef } = props;
  const { active, scratchpad } = editor;
  const enabled = active || Boolean(scratchpad);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const scrollOffsetRef = useRef(0);
  const pendingScrollRestoreRef = useRef(false);
  const pendingCaretRevealRef = useRef(false);
  const wasEnabledRef = useRef(enabled);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [stageHeight, setStageHeight] = useState(0);

  // Until the first stroke locks a width the stage follows the viewport, so that stroke moves nothing.
  const layoutWidth = scratchpad?.layoutWidth ?? viewport.width;
  const scale = resolveScratchStageScale(viewport.width, layoutWidth);
  const inkMinHeight = useMemo(() => getScratchMinStageHeight(scratchpad), [scratchpad]);
  const minStageHeight = Math.max(viewport.height / scale, inkMinHeight);
  const frameHeight = Math.max(stageHeight, minStageHeight) * scale;

  // Runs before the measuring effect below so the first measurement sees the textarea at its full height.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!enabled || !textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
    // Grow the scrollable area in this same frame rather than waiting for the resize observer.
    setStageHeight(stageRef.current?.offsetHeight ?? 0);
    return () => {
      textarea.style.height = "";
    };
  }, [active, contentKey, enabled, layoutWidth, textareaRef, viewport.width]);

  // The browser reveals the caret before the textarea has grown, so after typing or pasting past the
  // visible area nothing would scroll the stage to follow it.
  useLayoutEffect(() => {
    if (enabled && document.activeElement === textareaRef.current) {
      pendingCaretRevealRef.current = true;
    }
  }, [contentKey, enabled, textareaRef]);

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;
    const stageElement = stageRef.current;
    if (!enabled || !viewportElement || !stageElement) {
      return;
    }

    // A hidden panel measures zero, which also makes the textarea fit itself again when the panel returns.
    const measure = () => {
      setViewport({ width: viewportElement.clientWidth, height: viewportElement.clientHeight });
      setStageHeight(stageElement.offsetHeight);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewportElement);
    observer.observe(stageElement);
    return () => {
      observer.disconnect();
      setStageHeight(0);
    };
  }, [enabled]);

  // Hand the scroll position across when the scroller changes between the surface and the stage.
  useLayoutEffect(() => {
    if (wasEnabledRef.current !== enabled) {
      wasEnabledRef.current = enabled;
      if (enabled) {
        pendingScrollRestoreRef.current = true;
      } else if (textareaRef.current) {
        textareaRef.current.scrollTop = scrollOffsetRef.current;
      }
    }

    // Scroll offsets only hold once the frame has grown to the stage's measured height.
    const viewportElement = viewportRef.current;
    if (!enabled || !viewportElement || stageHeight === 0 || stageHeight !== stageRef.current?.offsetHeight) {
      return;
    }

    if (pendingScrollRestoreRef.current) {
      pendingScrollRestoreRef.current = false;
      viewportElement.scrollTop = scrollOffsetRef.current * scale;
    }

    if (pendingCaretRevealRef.current) {
      pendingCaretRevealRef.current = false;
      if (textareaRef.current && document.activeElement === textareaRef.current) {
        revealTextareaCaret(textareaRef.current, viewportElement, scale);
      }
    }
  });

  function handleScrollCapture(event: SyntheticEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (enabled && target === viewportRef.current) {
      scrollOffsetRef.current = target.scrollTop / scale;
    } else if (!enabled && target.matches(".bb-editor-surface, .bb-editor-preview")) {
      scrollOffsetRef.current = target.scrollTop;
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`bb-scratch-viewport${enabled ? " is-enabled" : ""}${active ? " is-drawing" : ""}`}
      data-testid="scratch-viewport"
      onScrollCapture={handleScrollCapture}
    >
      <div
        className="bb-scratch-frame"
        style={enabled ? { width: `${layoutWidth * scale}px`, height: `${frameHeight}px` } : undefined}
      >
        <div
          ref={stageRef}
          className="bb-scratch-stage"
          data-testid="scratch-stage"
          style={
            enabled
              ? { width: `${layoutWidth}px`, minHeight: `${minStageHeight}px`, transform: `scale(${scale})` }
              : undefined
          }
        >
          {props.children}
          {enabled ? <ScratchCanvas editor={editor} layoutWidth={layoutWidth} scale={scale} stageRef={stageRef} /> : null}
        </div>
      </div>
    </div>
  );
}

function ScratchCanvas(props: {
  editor: ScratchEditor;
  layoutWidth: number;
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const { editor, layoutWidth, scale, stageRef } = props;
  const { active, disabled, scratchpad, tool } = editor;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveStrokeRef = useRef<{ pointerId: number; stroke: ScratchStroke; maxPoints: number } | null>(null);

  function paint() {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !stage || !context || stage.offsetWidth === 0 || stage.offsetHeight === 0) {
      return;
    }

    const density = resolveScratchCanvasDensity(stage.offsetWidth, stage.offsetHeight, window.devicePixelRatio, scale);
    const width = Math.round(stage.offsetWidth * density);
    const height = Math.round(stage.offsetHeight * density);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.setTransform(density, 0, 0, density, 0, 0);
    // The live stroke is repainted too, so a resize or save response mid-stroke cannot wipe it.
    const strokes = liveStrokeRef.current ? [...(scratchpad?.strokes ?? []), liveStrokeRef.current.stroke] : (scratchpad?.strokes ?? []);
    const color = getComputedStyle(canvas).color;
    for (const stroke of strokes) {
      paintStroke(context, stroke, stroke.points, color);
    }
  }

  const paintRef = useRef(paint);
  paintRef.current = paint;

  useLayoutEffect(() => paintRef.current(), [layoutWidth, scale, scratchpad]);

  useEffect(() => {
    const repaint = () => paintRef.current();
    const stage = stageRef.current;
    const resizeObserver = new ResizeObserver(repaint);
    if (stage) {
      resizeObserver.observe(stage);
    }
    // Ink takes its color from the active theme.
    const themeObserver = new MutationObserver(repaint);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const stopWatchingDensity = watchDevicePixelRatio(repaint);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      stopWatchingDensity();
    };
  }, [stageRef]);

  function readPoint(canvas: HTMLCanvasElement, event: { clientX: number; clientY: number }) {
    const stage = stageRef.current as HTMLDivElement;
    return resolveScratchPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), {
      width: stage.offsetWidth,
      height: stage.offsetHeight
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const maxPoints = getRemainingScratchPoints(scratchpad);
    if (!active || disabled || maxPoints === 0 || !event.isPrimary || event.button !== 0 || liveStrokeRef.current) {
      return;
    }

    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const stroke = createScratchStroke(tool, readPoint(canvas, event));
    liveStrokeRef.current = { pointerId: event.pointerId, stroke, maxPoints };
    const context = canvas.getContext("2d");
    if (context) {
      paintStroke(context, stroke, stroke.points, getComputedStyle(canvas).color);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const live = liveStrokeRef.current;
    if (!live || live.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    const color = getComputedStyle(canvas).color;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length > 0 ? samples : [event.nativeEvent]) {
      const { points } = live.stroke;
      const previous = points[points.length - 1];
      if (points.length < live.maxPoints && appendScratchPoint(points, readPoint(canvas, sample)) && context) {
        paintStroke(context, live.stroke, [previous, points[points.length - 1]], color);
      }
    }
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLCanvasElement>) {
    const live = liveStrokeRef.current;
    if (!live || live.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    liveStrokeRef.current = null;
    editor.addStroke(live.stroke, layoutWidth);
  }

  return (
    <canvas
      ref={canvasRef}
      className={`bb-scratch-canvas${tool === "erase" ? " is-erasing" : ""}`}
      data-testid="scratch-canvas"
      role="img"
      aria-label="Scratch overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    />
  );
}

/** Keeps ink sharp through browser zoom and moves between monitors, neither of which resizes the stage. */
function watchDevicePixelRatio(onChange: () => void) {
  let stop = () => {};
  const watch = () => {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const handleChange = () => {
      onChange();
      watch();
    };
    query.addEventListener("change", handleChange, { once: true });
    stop = () => query.removeEventListener("change", handleChange);
  };

  watch();
  return () => stop();
}

/** Scrolls the stage just far enough to show the caret. Textareas expose no caret position, so measure a hidden copy. */
function revealTextareaCaret(textarea: HTMLTextAreaElement, viewport: HTMLElement, scale: number) {
  const mirror = textarea.cloneNode(false) as HTMLTextAreaElement;
  mirror.placeholder = "";
  mirror.value = textarea.value.slice(0, textarea.selectionEnd);
  mirror.style.cssText = `position:absolute;visibility:hidden;flex:none;height:0;width:${textarea.offsetWidth}px;padding-bottom:0`;
  textarea.after(mirror);
  const caretBottom = mirror.scrollHeight * scale;
  mirror.remove();

  const caretTop = caretBottom - parseFloat(getComputedStyle(textarea).lineHeight) * scale;
  if (caretBottom > viewport.scrollTop + viewport.clientHeight) {
    viewport.scrollTop = caretBottom - viewport.clientHeight;
  } else if (caretTop < viewport.scrollTop) {
    viewport.scrollTop = caretTop;
  }
}

function paintStroke(context: CanvasRenderingContext2D, stroke: ScratchStroke, points: ScratchPoint[], color: string) {
  context.save();
  context.globalCompositeOperation = stroke.tool === "erase" ? "destination-out" : "source-over";
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, stroke.width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    context.stroke();
  }
  context.restore();
}
