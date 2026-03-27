import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PageNav } from "./PageNav";

describe("PageNav", () => {
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
});
