import type { AuthSession } from "../api/types";
import type { UserTheme } from "../api/types";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";

export function PageNav(props: {
  user: AuthSession["user"];
  onLogout(): void;
  onThemeChange(theme: UserTheme): Promise<void>;
}) {
  return (
    <header className="bb-topbar">
      <div className="bb-topbar__nav bb-topbar__nav--brand-only">
        <BrandMark />
      </div>
      <div className="bb-topbar__menu">
        <UserMenu
          name={props.user?.name ?? null}
          email={props.user?.email ?? null}
          theme={props.user?.theme ?? "sea"}
          onLogout={props.onLogout}
          onThemeChange={props.onThemeChange}
        />
      </div>
    </header>
  );
}
