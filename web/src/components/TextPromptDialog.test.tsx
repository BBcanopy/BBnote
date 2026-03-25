import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextPromptDialog } from "./TextPromptDialog";

describe("TextPromptDialog", () => {
  it("preserves typed input across re-renders and closes on escape", async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    function Harness() {
      const [value, setValue] = useState("Roadmaps");

      return (
        <TextPromptDialog
          open
          title="Create notebook"
          description="Create a new notebook for the selected area."
          value={value}
          placeholder="Notebook name"
          confirmLabel="Create notebook"
          onChange={setValue}
          onClose={handleClose}
          onConfirm={() => handleConfirm(value)}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByRole("dialog", { name: "Create notebook" })).toBeInTheDocument();
    const input = screen.getByPlaceholderText("Notebook name");
    await user.type(input, " plans");
    expect(input).toHaveValue("Roadmaps plans");

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Create notebook" }));
    expect(handleConfirm).toHaveBeenCalledWith("Roadmaps plans");
  });
});
