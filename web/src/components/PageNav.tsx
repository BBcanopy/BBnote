import type { AuthSession } from "../api/types";
import type { UserTheme } from "../api/types";
import type { PageNavTitleControl } from "./AppShellContext";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";

export function PageNav(props: {
  user: AuthSession["user"];
  titleControl?: PageNavTitleControl | null;
  onLogout(): void;
  onThemeChange(theme: UserTheme): Promise<void>;
}) {
  const titleControl = props.titleControl;

  return (
    <header className={`bb-topbar ${titleControl ? "bb-topbar--with-title" : ""}`.trim()}>
      <div className={`bb-topbar__nav ${titleControl ? "" : "bb-topbar__nav--brand-only"}`.trim()}>
        <BrandMark />
      </div>
      {titleControl ? (
        <div className="bb-topbar__titlebar" data-testid="page-nav-title-input">
          <input
            aria-label={titleControl.label}
            value={titleControl.value}
            onChange={(event) => titleControl.onChange(event.target.value)}
            placeholder={titleControl.placeholder}
            disabled={titleControl.disabled}
            className="bb-input bb-topbar__titlebar-input text-base font-medium tracking-tight"
          />
        </div>
      ) : null}
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
