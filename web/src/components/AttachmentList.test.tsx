import { fireEvent, render, screen } from "@testing-library/react";
import { AttachmentList } from "./AttachmentList";

describe("AttachmentList", () => {
  it("toggles the attachment cards when the section is collapsed and expanded", () => {
    render(
      <AttachmentList
        attachments={[
          {
            id: "attachment-1",
            name: "budget.txt",
            mimeType: "text/plain",
            sizeBytes: 128,
            url: "/api/v1/attachments/attachment-1",
            embedded: false
          }
        ]}
        disabled={false}
        onInsertLink={vi.fn()}
        onInsertImage={vi.fn()}
        onInsertAudio={vi.fn()}
        onInsertVideo={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /attachments/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("budget.txt")).toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("budget.txt")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("budget.txt")).toBeVisible();
  });

  it("keeps the attachment section inert when disabled", () => {
    render(
      <AttachmentList
        attachments={[
          {
            id: "attachment-1",
            name: "budget.txt",
            mimeType: "text/plain",
            sizeBytes: 128,
            url: "/api/v1/attachments/attachment-1",
            embedded: false
          }
        ]}
        disabled
        onInsertLink={vi.fn()}
        onInsertImage={vi.fn()}
        onInsertAudio={vi.fn()}
        onInsertVideo={vi.fn()}
        onDelete={vi.fn()}
        onDownload={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: /attachments/i });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("budget.txt")).toBeVisible();
  });
});
