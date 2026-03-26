import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PageNav } from "./PageNav";

describe("PageNav", () => {
  it("renders the editable note title field when a title control is provided", () => {
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
            placeholder: "Note title",
            onChange: handleChange
          }}
          onLogout={() => undefined}
          onThemeChange={async () => undefined}
        />
      </MemoryRouter>
    );

    const input = screen.getByRole("textbox", { name: "Title" });

    expect(input).toHaveValue("Quarterly plan");
    fireEvent.change(input, { target: { value: "Updated plan" } });
    expect(handleChange).toHaveBeenCalledWith("Updated plan");
  });

  it("keeps the topbar brand-only when no title control is provided", () => {
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
});
