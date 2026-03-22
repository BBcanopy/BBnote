import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { getRuntimeConfig } from "../api/client";
import type { RuntimeConfig } from "../api/types";

type AuthStatus = "loading" | "ready";

interface AuthContextValue {
  status: AuthStatus;
  runtimeConfig: RuntimeConfig | null;
  user: User | null;
  accessToken: string | null;
  login(): Promise<void>;
  logout(): Promise<void>;
  completeLogin(): Promise<void>;
  reloadUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const managerRef = useRef<UserManager | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const config = await getRuntimeConfig();
      if (cancelled) {
        return;
      }
      const redirectUri = `${window.location.origin}/auth/callback`;
      const manager = new UserManager({
        authority: config.oidcIssuerUrl,
        client_id: config.oidcClientIdWeb,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.oidcScopes,
        userStore: new WebStorageStateStore({ store: window.localStorage }),
        automaticSilentRenew: false,
        monitorSession: false,
        loadUserInfo: false
      });
      managerRef.current = manager;
      const existingUser = await manager.getUser();
      if (cancelled) {
        return;
      }
      setRuntimeConfig(config);
      setUser(existingUser);
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
      runtimeConfig,
      user,
      accessToken: user?.access_token ?? null,
      async login() {
        if (!managerRef.current) {
          return;
        }
        await managerRef.current.signinRedirect();
      },
      async logout() {
        if (!managerRef.current) {
          return;
        }
        await managerRef.current.removeUser();
        startTransition(() => {
          setUser(null);
        });
      },
      async completeLogin() {
        if (!managerRef.current) {
          throw new Error("OIDC client is not ready.");
        }
        const signedInUser = await managerRef.current.signinRedirectCallback();
        startTransition(() => {
          setUser(signedInUser);
        });
      },
      async reloadUser() {
        if (!managerRef.current) {
          return;
        }
        const existingUser = await managerRef.current.getUser();
        startTransition(() => {
          setUser(existingUser);
        });
      }
    }),
    [runtimeConfig, status, user]
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
