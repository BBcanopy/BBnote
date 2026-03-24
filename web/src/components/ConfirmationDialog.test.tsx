import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmationDialog } from "./ConfirmationDialog";

describe("ConfirmationDialog", () => {
  it("confirms the action and closes on escape", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        title="Delete note?"
        description="This action cannot be undone."
        confirmLabel="Delete note"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByRole("dialog", { name: "Delete note?" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Delete note" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
