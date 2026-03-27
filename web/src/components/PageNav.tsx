import type { CSSProperties } from "react";
import type { AuthSession } from "../api/types";
import type { UserTheme } from "../api/types";
import type { PageNavTitleControl, PageNavTitleLayout } from "./AppShellContext";
import { BrandMark } from "./BrandMark";
import { UserMenu } from "./UserMenu";

export function PageNav(props: {
  user: AuthSession["user"];
  titleControl?: PageNavTitleControl | null;
  titleLayout?: PageNavTitleLayout | null;
  onLogout(): void;
  onThemeChange(theme: UserTheme): Promise<void>;
}) {
  const titleControl = props.titleControl;
  const rawTitleLayout = titleControl ? props.titleLayout : null;
  const titleLayout = rawTitleLayout
    ? (() => {
        const brandReservePx = 112;
        const menuReservePx = 52;
        const leftOffset = Math.max(rawTitleLayout.leftOffset, brandReservePx);
        const width = Math.max(0, rawTitleLayout.width - menuReservePx - (leftOffset - rawTitleLayout.leftOffset));
        return {
          leftOffset,
          width
        };
      })()
    : null;
  const titlebarStyle = titleLayout
    ? ({
        "--bb-topbar-title-left": `${titleLayout.leftOffset}px`,
        "--bb-topbar-title-width": `${titleLayout.width}px`
      } as CSSProperties)
    : undefined;

  return (
    <header className={`bb-topbar ${titleLayout ? "bb-topbar--with-title" : ""}`.trim()}>
      <div className="bb-topbar__nav bb-topbar__nav--brand-only">
        <BrandMark />
      </div>
      {titleControl && titleLayout ? (
        <div className="bb-topbar__titlebar" data-testid="page-nav-title-input" style={titlebarStyle}>
          <label className="bb-field bb-topbar__titlebar-field">
            <span className="bb-field__label">{titleControl.label}</span>
            <input
              aria-label={titleControl.label}
              value={titleControl.value}
              onChange={(event) => titleControl.onChange(event.target.value)}
              placeholder={titleControl.placeholder}
              disabled={titleControl.disabled}
              className="bb-input bb-topbar__titlebar-input"
            />
          </label>
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
