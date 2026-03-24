import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "./service/configService.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, SESSION_COOKIE_NAME } from "./service/authConstants.js";
import { createMutableMockOidcProvider, type TestOidcIdentity } from "./service/oidcTesting.js";

export function createTestConfig(tempRoot: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    appBaseUrl: "http://127.0.0.1:3000",
    oidcIssuerUrl: "https://issuer.example.com",
    oidcClientIdWeb: "bbnote-web",
    oidcClientIdAndroid: "bbnote-android",
    oidcClientSecret: "bbnote-dev-client-secret",
    oidcScopes: "openid profile email",
    sessionSecret: "bbnote-dev-session-secret-0123456789",
    sqlitePath: path.join(tempRoot, "db", "bbnote.sqlite"),
    notesRoot: path.join(tempRoot, "notes"),
    attachmentsRoot: path.join(tempRoot, "attachments"),
    exportsRoot: path.join(tempRoot, "exports"),
    ...overrides
  };
}

export function createTestAuthProvider(config: AppConfig, identity: TestOidcIdentity) {
  return createMutableMockOidcProvider(config, identity);
}

export function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}

export async function loginWithOidc(app: FastifyInstance, returnTo = "/") {
  const loginResponse = await app.inject({
    method: "GET",
    url: `/api/v1/auth/login?returnTo=${encodeURIComponent(returnTo)}`
  });

  const stateCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_STATE_COOKIE_NAME);
  const verifierCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_VERIFIER_COOKIE_NAME);
  if (!stateCookie || !verifierCookie) {
    throw new Error("OIDC login cookies missing.");
  }

  const redirectLocation = loginResponse.headers.location;
  if (!redirectLocation) {
    throw new Error("OIDC login redirect URL missing.");
  }

  const callbackResponse = await app.inject({
    method: "GET",
    url: redirectLocation,
    cookies: {
      [OIDC_STATE_COOKIE_NAME]: stateCookie.value,
      [OIDC_VERIFIER_COOKIE_NAME]: verifierCookie.value
    }
  });

  const sessionCookie = callbackResponse.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
  if (!sessionCookie) {
    throw new Error("Session cookie missing.");
  }

  return {
    callbackResponse,
    loginResponse,
    sessionCookie: sessionCookie.value
  };
}
