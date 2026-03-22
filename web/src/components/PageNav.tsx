import { DownloadSimple, FolderSimple, NotePencil, SignOut, UploadSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function PageNav(props: { onLogout(): void }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-white/60 bg-white/85 px-5 py-4 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-700/10 p-2 text-emerald-700">
          <NotePencil size={20} weight="bold" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">BBNote</p>
          <p className="text-sm text-slate-600">Markdown notes with calm storage rules</p>
        </div>
      </div>
      <nav className="flex flex-wrap items-center gap-2">
        <NavItem to="/" label="Notes" icon={<FolderSimple size={18} />} />
        <NavItem to="/imports" label="Imports" icon={<UploadSimple size={18} />} />
        <NavItem to="/exports" label="Exports" icon={<DownloadSimple size={18} />} />
        <button
          type="button"
          onClick={props.onLogout}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950 active:translate-y-0 active:scale-[0.98]"
        >
          <SignOut size={18} />
          Sign out
        </button>
      </nav>
    </header>
  );
}

function NavItem(props: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={props.to}
      end={props.to === "/"}
      className={({ isActive }) =>
        `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isActive ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-600 hover:-translate-y-[1px] hover:border-slate-300 hover:text-slate-950"
        }`
      }
    >
      {props.icon}
      {props.label}
    </NavLink>
  );
}
