import { render, screen, waitFor } from "@testing-library/react";
import { MarkdownPreview } from "./MarkdownPreview";

const { fetchAttachmentBlob } = vi.hoisted(() => ({
  fetchAttachmentBlob: vi.fn()
}));

vi.mock("../api/client", () => ({
  fetchAttachmentBlob
}));

describe("MarkdownPreview", () => {
  beforeEach(() => {
    fetchAttachmentBlob.mockReset();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn((blob: Blob | MediaSource) => `blob:${(blob as Blob).type}`)
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders inline audio and video players for attachment links when metadata is available", async () => {
    fetchAttachmentBlob.mockImplementation(async (attachmentUrl: string) => {
      if (attachmentUrl.includes("audio-1")) {
        return new Blob(["audio"], { type: "audio/webm" });
      }

      return new Blob(["video"], { type: "video/webm" });
    });

    const { container } = render(
      <MarkdownPreview
        bodyMarkdown={"[Voice clip](/api/v1/attachments/audio-1)\n\n[Demo clip](/api/v1/attachments/video-1)"}
        attachments={[
          {
            id: "audio-1",
            name: "voice.webm",
            mimeType: "audio/webm",
            sizeBytes: 5,
            url: "/api/v1/attachments/audio-1",
            embedded: true
          },
          {
            id: "video-1",
            name: "demo.webm",
            mimeType: "video/webm",
            sizeBytes: 5,
            url: "/api/v1/attachments/video-1",
            embedded: true
          }
        ]}
      />
    );

    await waitFor(() => {
      expect(container.querySelector("audio")).toHaveAttribute("src", "blob:audio/webm");
      expect(container.querySelector("video")).toHaveAttribute("src", "blob:video/webm");
    });
    expect(screen.getByText("Voice clip")).toBeInTheDocument();
    expect(screen.getByText("Demo clip")).toBeInTheDocument();
  });

  it("keeps non-media attachments as secure buttons", () => {
    render(
      <MarkdownPreview
        bodyMarkdown="[Spec sheet](/api/v1/attachments/file-1)"
        attachments={[
          {
            id: "file-1",
            name: "spec.pdf",
            mimeType: "application/pdf",
            sizeBytes: 42,
            url: "/api/v1/attachments/file-1",
            embedded: true
          }
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Spec sheet" })).toBeInTheDocument();
    expect(screen.queryByRole("audio")).not.toBeInTheDocument();
    expect(screen.queryByRole("video")).not.toBeInTheDocument();
  });
});
