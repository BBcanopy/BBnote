import { CaretDown, DownloadSimple, NotePencil, SignOut, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";

export function UserMenu(props: {
  name: string | null;
  email: string | null;
  onLogout(): void;
}) {
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

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
        className="inline-flex h-12 items-center gap-3 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-left shadow-[0_16px_40px_-32px_rgba(15,23,42,0.65)] transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
          {initial}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-medium text-slate-900">{props.name || "BBNote user"}</span>
          <span className="block truncate text-xs text-slate-500">{props.email || "Signed in"}</span>
        </span>
        <CaretDown size={16} className={`text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-3 w-[15rem] rounded-[1.6rem] border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.38)]"
        >
          <MenuLink to="/" label="Notes" icon={<NotePencil size={18} />} />
          <MenuLink to="/imports" label="Imports" icon={<UploadSimple size={18} />} />
          <MenuLink to="/exports" label="Exports" icon={<DownloadSimple size={18} />} />
          <div className="my-2 border-t border-slate-100" />
          <button
            type="button"
            onClick={props.onLogout}
            className="flex w-full items-center gap-3 rounded-[1.1rem] px-3 py-3 text-sm text-slate-600 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-slate-50 hover:text-slate-950"
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
        `flex items-center gap-3 rounded-[1.1rem] px-3 py-3 text-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isActive ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        }`
      }
    >
      {props.icon}
      {props.label}
    </NavLink>
  );
}
