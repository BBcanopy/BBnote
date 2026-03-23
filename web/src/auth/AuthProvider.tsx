import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getAuthSession, logoutAuthSession, updateUserTheme } from "../api/client";
import type { AuthSession, UserTheme } from "../api/types";

type AuthStatus = "loading" | "ready";
const DEFAULT_THEME: UserTheme = "sea";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthSession["user"];
  login(): void;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
  setTheme(theme: UserTheme): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthSession["user"]>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const session = await getAuthSession();
      if (cancelled) {
        return;
      }
      setUser(session.user);
      setStatus("ready");
    }

    bootstrap().catch((error) => {
      console.error(error);
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = user?.theme ?? DEFAULT_THEME;
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login() {
        const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}` || "/";
        window.location.assign(`/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
      },
      async logout() {
        await logoutAuthSession();
        startTransition(() => {
          setUser(null);
        });
      },
      async reloadUser() {
        const session = await getAuthSession();
        startTransition(() => {
          setUser(session.user);
        });
      },
      async setTheme(theme) {
        const session = await updateUserTheme(theme);
        startTransition(() => {
          setUser(session.user);
        });
      }
    }),
    [status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
