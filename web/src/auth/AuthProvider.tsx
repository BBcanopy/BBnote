import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { getAuthSession, logoutAuthSession } from "../api/client";
import type { AuthSession } from "../api/types";

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  user: AuthSession["user"];
  login(): void;
  logout(): Promise<void>;
  reloadUser(): Promise<void>;
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
