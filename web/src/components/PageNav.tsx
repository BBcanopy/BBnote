import { NotePencil } from "@phosphor-icons/react";
import type { AuthSession } from "../api/types";
import { UserMenu } from "./UserMenu";

export function PageNav(props: {
  user: AuthSession["user"];
  onLogout(): void;
}) {
  return (
    <header className="relative z-20 mb-4 flex items-center justify-between gap-4 rounded-[2rem] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_20px_50px_-34px_rgba(15,23,42,0.35)] backdrop-blur-sm sm:px-5">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-emerald-700/10 p-2.5 text-emerald-700">
          <NotePencil size={20} weight="bold" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">BBNote</p>
          <p className="text-sm font-medium tracking-tight text-slate-900">Notebook workspace</p>
        </div>
      </div>
      <UserMenu name={props.user?.name ?? null} email={props.user?.email ?? null} onLogout={props.onLogout} />
    </header>
  );
}
