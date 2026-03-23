import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AuthSplash } from "./AuthSplash";

describe("AuthSplash", () => {
  it("renders the sign-in call to action", async () => {
    const user = userEvent.setup();
    const handleLogin = vi.fn();
    render(
      <MemoryRouter>
        <AuthSplash onLogin={handleLogin} busy={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole("heading", { name: "BBNote" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /read api docs/i })).toHaveAttribute("href", "/docs");
    await user.click(screen.getByRole("button", { name: /sign in with oidc/i }));
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });
});
