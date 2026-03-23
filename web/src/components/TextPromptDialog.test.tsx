import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TextPromptDialog } from "./TextPromptDialog";

describe("TextPromptDialog", () => {
  it("submits the entered value and closes on escape", async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    render(
      <TextPromptDialog
        open
        title="Create notebook"
        description="Create a new notebook for the selected area."
        value="Roadmaps"
        placeholder="Notebook name"
        confirmLabel="Create notebook"
        onChange={handleChange}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByRole("dialog", { name: "Create notebook" })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Notebook name"), " plans");
    expect(handleChange).toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Create notebook" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });
});
