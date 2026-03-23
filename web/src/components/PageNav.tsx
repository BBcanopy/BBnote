import { House, UploadSimple, DownloadSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
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
      <div className="bb-topbar__nav">
        <div className="bb-brand-mark" aria-label="BBNote">
          <span className="bb-brand-mark__pill">bb</span>
          <span className="bb-brand-mark__copy">
            <span className="bb-brand-mark__title">BBNote</span>
            <span className="bb-brand-mark__subtitle">Markdown workspace</span>
          </span>
        </div>
        <nav className="bb-subnav" aria-label="Primary navigation">
          <NavItem to="/" label="Notes" icon={<House size={16} weight="bold" />} />
          <NavItem to="/imports" label="Imports" icon={<UploadSimple size={16} weight="bold" />} />
          <NavItem to="/exports" label="Exports" icon={<DownloadSimple size={16} weight="bold" />} />
        </nav>
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

function NavItem(props: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={props.to}
      end={props.to === "/"}
      className={({ isActive }) => `bb-nav-link${isActive ? " is-active" : ""}`}
    >
      {props.icon}
      <span>{props.label}</span>
    </NavLink>
  );
}
