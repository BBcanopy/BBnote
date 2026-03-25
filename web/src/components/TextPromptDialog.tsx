import { useEffect, useId, useRef } from "react";

export function TextPromptDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  value: string;
  placeholder?: string;
  confirmLabel: string;
  onChange(value: string): void;
  onClose(): void;
  onConfirm(): void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(props.onClose);
  const canConfirm = props.value.trim().length > 0;

  useEffect(() => {
    onCloseRef.current = props.onClose;
  }, [props.onClose]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="bb-dialog-backdrop" role="presentation" onClick={props.onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={props.description ? descriptionId : undefined}
        className="bb-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          className="bb-dialog__content"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canConfirm) {
              return;
            }
            props.onConfirm();
          }}
        >
          <div className="bb-dialog__copy">
            <h2 id={titleId} className="bb-dialog__title">
              {props.title}
            </h2>
            {props.description ? (
              <p id={descriptionId} className="bb-dialog__description">
                {props.description}
              </p>
            ) : null}
          </div>

          <input
            ref={inputRef}
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            placeholder={props.placeholder}
            className="bb-input"
          />

          <div className="bb-dialog__actions">
            <button type="button" onClick={props.onClose} className="bb-button bb-button--ghost">
              Cancel
            </button>
            <button type="submit" disabled={!canConfirm} className="bb-button bb-button--primary">
              {props.confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
