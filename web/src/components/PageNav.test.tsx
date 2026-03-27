import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PageNav } from "./PageNav";

describe("PageNav", () => {
  it("renders the note title field in the topbar when title control metrics are provided", () => {
    const handleChange = vi.fn();

    render(
      <MemoryRouter>
        <PageNav
          user={{
            name: "Avery",
            email: "avery@example.com",
            theme: "sea"
          }}
          titleControl={{
            label: "Title",
            value: "Quarterly plan",
            placeholder: "Untitled note",
            onChange: handleChange
          }}
          titleLayout={{
            leftOffset: 640,
            width: 780
          }}
          onLogout={() => undefined}
          onThemeChange={async () => undefined}
        />
      </MemoryRouter>
    );

    const input = screen.getByRole("textbox", { name: "Title" });

    expect(screen.getByTestId("page-nav-title-icon")).toHaveAttribute("data-icon", "document");
    expect(screen.queryByText(/^title$/i)).not.toBeInTheDocument();
    expect(input).toHaveValue("Quarterly plan");
    fireEvent.change(input, { target: { value: "Updated plan" } });
    expect(handleChange).toHaveBeenCalledWith("Updated plan");
  });

  it("keeps the topbar brand-only without rendering a note title field", () => {
    render(
      <MemoryRouter>
        <PageNav
          user={{
            name: "Avery",
            email: "avery@example.com",
            theme: "sea"
          }}
          onLogout={() => undefined}
          onThemeChange={async () => undefined}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    expect(document.querySelector(".bb-topbar__nav")).toHaveClass("bb-topbar__nav--brand-only");
  });

  it("focuses the note title input when a focus request is provided", async () => {
    render(
      <MemoryRouter>
        <PageNav
          user={{
            name: "Avery",
            email: "avery@example.com",
            theme: "sea"
          }}
          titleControl={{
            label: "Title",
            value: "",
            placeholder: "Untitled note",
            focusRequestKey: 1,
            onChange: () => undefined
          }}
          titleLayout={{
            leftOffset: 640,
            width: 780
          }}
          onLogout={() => undefined}
          onThemeChange={async () => undefined}
        />
      </MemoryRouter>
    );

    const input = screen.getByRole("textbox", { name: "Title" });
    await waitFor(() => expect(input).toHaveFocus());
  });
});
