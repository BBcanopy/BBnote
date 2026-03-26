import { useEffect, useId } from "react";

export function ConfirmationDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onClose(): void;
  onConfirm(): void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!props.open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.open, props.onClose]);

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
        <div className="bb-dialog__content">
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

          <div className="bb-dialog__actions">
            <button type="button" onClick={props.onClose} className="bb-button bb-button--ghost">
              {props.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              onClick={props.onConfirm}
              className={`bb-button ${props.tone === "primary" ? "bb-button--primary" : "bb-button--danger"}`}
            >
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
