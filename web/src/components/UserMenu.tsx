import { CaretDown, DownloadSimple, NotePencil, SignOut, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { UserTheme } from "../api/types";
import { themeOptions } from "../theme/theme";

export function UserMenu(props: {
  name: string | null;
  email: string | null;
  theme: UserTheme;
  onLogout(): void;
  onThemeChange(theme: UserTheme): Promise<void>;
}) {
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [themePending, setThemePending] = useState<UserTheme | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const initial = useMemo(() => {
    const source = props.name?.trim() || props.email?.trim() || "B";
    return source.charAt(0).toUpperCase();
  }, [props.email, props.name]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        className="bb-avatar-button"
      >
        <span className="bb-avatar-button__letter">
          {initial}
        </span>
        <span className="bb-avatar-button__meta">
          <span className="bb-avatar-button__name">{props.name || "BBNote user"}</span>
          <span className="bb-avatar-button__email">{props.email || "Signed in"}</span>
        </span>
        <CaretDown size={16} className={`bb-avatar-button__chevron${open ? " is-open" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="bb-avatar-dropdown"
        >
          <div className="bb-menu-section">
            <p className="bb-menu-section__label">Theme</p>
            <div className="bb-theme-grid" role="group" aria-label="Theme switcher">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={props.theme === option.id}
                  className={`bb-theme-option${props.theme === option.id ? " is-active" : ""}`}
                  disabled={themePending !== null}
                  onClick={() => {
                    setThemeError(null);
                    setThemePending(option.id);
                    void props.onThemeChange(option.id)
                      .catch((error) => {
                        setThemeError(String(error));
                      })
                      .finally(() => {
                        setThemePending(null);
                      });
                  }}
                >
                  <span className={`bb-theme-option__swatch bb-theme-option__swatch--${option.id}`} />
                  <span className="bb-theme-option__copy">
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </span>
                </button>
              ))}
            </div>
            {themeError ? <p className="bb-inline-error">{themeError}</p> : null}
          </div>
          <div className="bb-menu-section">
            <p className="bb-menu-section__label">Navigate</p>
            <MenuLink to="/" label="Notes" icon={<NotePencil size={18} />} />
            <MenuLink to="/imports" label="Imports" icon={<UploadSimple size={18} />} />
            <MenuLink to="/exports" label="Exports" icon={<DownloadSimple size={18} />} />
          </div>
          <div className="bb-menu-divider" />
          <button
            type="button"
            onClick={props.onLogout}
            className="bb-menu-link bb-menu-link--danger"
          >
            <SignOut size={18} />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink(props: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={props.to}
      end={props.to === "/"}
      className={({ isActive }) =>
        `bb-menu-link${isActive ? " is-active" : ""}`
      }
    >
      {props.icon}
      {props.label}
    </NavLink>
  );
}
