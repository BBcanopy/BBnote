import { CircleNotch } from "@phosphor-icons/react";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { AuthSplash } from "./AuthSplash";
import type { PageNavTitleControl, PageNavTitleLayout } from "./AppShellContext";
import { PageNav } from "./PageNav";
import { isNotesPathname } from "../utils/noteRoute";
import { isNative } from "../platform/native";
import { ServerConnection } from "./ServerConnection";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { useNativeIntegration } from "../platform/NativeIntegration";

export function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  useNativeIntegration();
  const useWorkspaceShell = isNotesPathname(location.pathname);
  const [pageNavTitleControl, setPageNavTitleControl] = useState<PageNavTitleControl | null>(null);
  const [pageNavTitleLayout, setPageNavTitleLayout] = useState<PageNavTitleLayout | null>(null);
  const [confirmServerChange, setConfirmServerChange] = useState(false);
  async function changeServer() { await auth.changeServer(); navigate("/", { replace: true }); }

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

  if (isNative() && !auth.server) return <ServerConnection />;

  if (!auth.user) {
    return (
      <main className="bb-page-shell">
        <div className="bb-shell bb-shell--auth">
          <AuthSplash onLogin={() => void auth.login()} busy={auth.busy} server={auth.server} error={auth.error}
            onChangeServer={isNative() ? () => void changeServer() : undefined} onRetry={isNative() ? () => void auth.retry() : undefined} />
        </div>
      </main>
    );
  }

  return (
    <main className={`bb-page-shell ${useWorkspaceShell ? "bb-page-shell--workspace" : ""}`}>
      <ConfirmationDialog open={confirmServerChange} title="Change server?"
        description="This signs you out and closes your notebooks. Any unsaved edits will be discarded."
        confirmLabel="Change server" onClose={() => setConfirmServerChange(false)}
        onConfirm={() => { void changeServer(); setConfirmServerChange(false); }} />
      <div className={`bb-shell bb-shell--app ${useWorkspaceShell ? "bb-shell--workspace" : ""}`}>
        <PageNav
          user={auth.user}
          titleControl={pageNavTitleControl}
          titleLayout={pageNavTitleLayout}
          onLogout={() => void auth.logout()}
          onThemeChange={(theme) => auth.setTheme(theme)}
          onChangeServer={isNative() ? () => setConfirmServerChange(true) : undefined}
        />
        <div className="bb-shell__content">
          <Outlet key={auth.server ?? "web"} context={{ setPageNavTitleControl, setPageNavTitleLayout }} />
        </div>
      </div>
    </main>
  );
}
