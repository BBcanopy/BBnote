import { CircleNotch } from "@phosphor-icons/react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AuthSplash } from "./AuthSplash";
import { PageNav } from "./PageNav";

export function AppShell() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas px-4">
        <div className="inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/85 px-5 py-3 text-sm text-slate-600 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.35)]">
          <CircleNotch size={18} className="animate-spin text-emerald-700" />
          Loading session
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <main className="min-h-[100dvh] bg-canvas text-slate-950">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1400px] flex-col px-4 py-6 md:px-8">
          <AuthSplash onLogin={() => void auth.login()} busy={false} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-canvas text-slate-950">
      <div className="flex min-h-[100dvh] w-full flex-col px-3 py-4 sm:px-4 lg:px-6">
        <PageNav user={auth.user} onLogout={() => void auth.logout()} />
        <Outlet />
      </div>
    </main>
  );
}
