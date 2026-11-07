import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAuthSession, logoutAuthSession, updateUserTheme } from "../api/client";
import type { AuthSession, UserTheme } from "../api/types";
import { connectNativeServer, currentServer, isNative, nativeBridge, setNativeServer } from "../platform/native";

interface AuthContextValue {
  status: "loading" | "ready";
  user: AuthSession["user"];
  server: string | null;
  debug: boolean;
  error: string | null;
  busy: boolean;
  login(): Promise<void>;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
  retry(): Promise<void>;
  connect(url: string): Promise<void>;
  changeServer(): Promise<void>;
  setTheme(theme: UserTheme): Promise<void>;
}
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [user, setUser] = useState<AuthSession["user"]>(null);
  const [server, setServer] = useState<string | null>(null);
  const [debug, setDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadUser = useCallback(async () => {
    const session = await getAuthSession();
    if (isNative() && !session.authenticated) {
      await nativeBridge().signOut(); setNativeServer(currentServer());
    }
    startTransition(() => setUser(session.user));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (isNative()) {
        const state = await nativeBridge().getState();
        if (cancelled) return;
        setDebug(state.debug); setNativeServer(state.server); setServer(state.server);
        if (!state.server || !state.authenticated) return;
      }
      const session = await getAuthSession();
      if (isNative() && !session.authenticated && !cancelled) await nativeBridge().signOut();
      if (!cancelled) setUser(session.user);
    }
    void bootstrap().catch((failure) => { if (!cancelled) setError(String(failure.message ?? failure)); })
      .finally(() => { if (!cancelled) setStatus("ready"); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const requireAuth = () => {
      if (isNative()) setNativeServer(currentServer());
      setError("Your session expired. Sign in again to continue."); setUser(null);
    };
    window.addEventListener("bbnote:auth-required", requireAuth);
    return () => window.removeEventListener("bbnote:auth-required", requireAuth);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = user?.theme ?? "sea"; }, [user]);

  const value = useMemo<AuthContextValue>(() => ({
    status, user, server, debug, error, busy, reloadUser,
    async login() {
      if (!isNative()) {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
        window.location.assign(`/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`); return;
      }
      setError(null); setBusy(true);
      try { await nativeBridge().signIn(); await reloadUser(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      finally { setBusy(false); }
    },
    async logout() {
      if (isNative()) { await nativeBridge().signOut(); setNativeServer(server); }
      else await logoutAuthSession();
      setUser(null); setError(null);
    },
    async connect(url) {
      setError(null); setBusy(true);
      try { setServer(await connectNativeServer(url, debug)); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      finally { setBusy(false); }
    },
    async changeServer() {
      await nativeBridge().disconnect();
      setNativeServer(null); setServer(null); setUser(null); setError(null);
    },
    async retry() {
      setBusy(true); setError(null);
      try { await reloadUser(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
      finally { setBusy(false); }
    },
    async setTheme(theme) {
      const session = await updateUserTheme(theme);
      startTransition(() => setUser(session.user));
    }
  }), [status, user, server, debug, error, busy, reloadUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
