import { CircleNotch } from "@phosphor-icons/react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AuthSplash } from "./AuthSplash";
import { PageNav } from "./PageNav";

export function AppShell() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return (
      <main className="bb-page-shell">
        <div className="bb-loading-pill">
          <CircleNotch size={18} className="animate-spin text-[color:var(--accent-strong)]" />
          Loading session
        </div>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <main className="bb-page-shell">
        <div className="bb-shell bb-shell--auth">
          <AuthSplash onLogin={() => void auth.login()} busy={false} />
        </div>
      </main>
    );
  }

  return (
    <main className="bb-page-shell">
      <div className="bb-shell">
        <PageNav
          user={auth.user}
          onLogout={() => void auth.logout()}
          onThemeChange={(theme) => auth.setTheme(theme)}
        />
        <div className="bb-shell__content">
          <Outlet />
        </div>
      </div>
    </main>
  );
}
