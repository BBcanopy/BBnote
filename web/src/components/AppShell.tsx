import { CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AuthSplash } from "./AuthSplash";
import type { PageNavTitleControl } from "./AppShellContext";
import { PageNav } from "./PageNav";
import { isNotesPathname } from "../utils/noteRoute";

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const useWorkspaceShell = isNotesPathname(location.pathname);
  const [pageNavTitleControl, setPageNavTitleControl] = useState<PageNavTitleControl | null>(null);

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
    <main className={`bb-page-shell ${useWorkspaceShell ? "bb-page-shell--workspace" : ""}`}>
      <div className={`bb-shell bb-shell--app ${useWorkspaceShell ? "bb-shell--workspace" : ""}`}>
        <PageNav
          user={auth.user}
          titleControl={pageNavTitleControl}
          onLogout={() => void auth.logout()}
          onThemeChange={(theme) => auth.setTheme(theme)}
        />
        <div className="bb-shell__content">
          <Outlet context={{ setPageNavTitleControl }} />
        </div>
      </div>
    </main>
  );
}
