import { Link } from "react-router-dom";
import type { AuthSession } from "../api/types";
import type { UserTheme } from "../api/types";
import { UserMenu } from "./UserMenu";

export function PageNav(props: {
  user: AuthSession["user"];
  onLogout(): void;
  onThemeChange(theme: UserTheme): Promise<void>;
}) {
  return (
    <header className="bb-topbar">
      <div className="bb-topbar__nav bb-topbar__nav--brand-only">
        <Link to="/" className="bb-brand-mark" aria-label="BBNote home">
          <span className="bb-brand-mark__pill">bb</span>
          <span className="bb-brand-mark__copy">
            <span className="bb-brand-mark__title">BBNote</span>
          </span>
        </Link>
      </div>
      <UserMenu
        name={props.user?.name ?? null}
        email={props.user?.email ?? null}
        theme={props.user?.theme ?? "sea"}
        onLogout={props.onLogout}
        onThemeChange={props.onThemeChange}
      />
    </header>
  );
}
