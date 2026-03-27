import { ArrowsClockwise, NotePencil, SignOut } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { UserTheme } from "../api/types";
import { themeOptions } from "../theme/theme";
import { createGravatarUrl } from "../utils/gravatar";
import { isNotesPathname } from "../utils/noteRoute";

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
  const [gravatarUrl, setGravatarUrl] = useState<string | null>(null);
  const [gravatarLoaded, setGravatarLoaded] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
    const email = props.email?.trim() ?? "";

    setGravatarLoaded(false);
    setGravatarUrl(null);

    if (!email) {
      return;
    }

    void createGravatarUrl(email).then((nextUrl) => {
      if (!cancelled) {
        setGravatarUrl(nextUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [props.email]);

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
          <span className="bb-avatar-button__glyph">{initial}</span>
          {gravatarUrl ? (
            <img
              key={gravatarUrl}
              src={gravatarUrl}
              alt=""
              data-testid="user-avatar-image"
              className={`bb-avatar-button__image${gravatarLoaded ? " is-visible" : ""}`}
              referrerPolicy="no-referrer"
              onLoad={() => setGravatarLoaded(true)}
              onError={() => {
                setGravatarLoaded(false);
                setGravatarUrl(null);
              }}
            />
          ) : null}
        </span>
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
                  </span>
                </button>
              ))}
            </div>
            {themeError ? <p className="bb-inline-error">{themeError}</p> : null}
          </div>
          <div className="bb-menu-section">
            <p className="bb-menu-section__label">Navigate</p>
            <MenuLink to="/" label="Notes" icon={<NotePencil size={18} />} />
            <MenuLink to="/migration" label="Migration" icon={<ArrowsClockwise size={18} />} />
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
  const location = useLocation();
  const active = props.to === "/" ? isNotesPathname(location.pathname) : location.pathname === props.to;

  return (
    <Link
      to={props.to}
      aria-current={active ? "page" : undefined}
      className={`bb-menu-link${active ? " is-active" : ""}`}
    >
      {props.icon}
      {props.label}
    </Link>
  );
}
