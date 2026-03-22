import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthSplash } from "./AuthSplash";

describe("AuthSplash", () => {
  it("renders the sign-in call to action", async () => {
    const user = userEvent.setup();
    const handleLogin = vi.fn();
    render(<AuthSplash onLogin={handleLogin} busy={false} />);
    expect(screen.getByRole("heading", { name: /notes that stay calm/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /sign in with oidc/i }));
    expect(handleLogin).toHaveBeenCalledTimes(1);
  });
});
