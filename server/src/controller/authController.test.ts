import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, RETURN_TO_COOKIE_NAME, SESSION_COOKIE_NAME } from "../service/authConstants.js";
import { createTestAuthProvider, createTestConfig } from "../test-helpers.js";

describe("authController integration", () => {
  let app: FastifyInstance | undefined;
  let tempRoot = "";
  let baseUrl = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
    const port = await getAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    const config = createTestConfig(tempRoot, {
      appBaseUrl: baseUrl
    });
    const oidc = createTestAuthProvider(config, {
      email: "avery@example.com",
      name: "Avery Stone",
      subject: "avery-stone"
    });

    app = await buildApp({
      authTesting: oidc.authTesting,
      config
    });
    await app.listen({ host: "127.0.0.1", port });
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("signs in through server-managed oidc and authenticates protected routes via session cookie", async () => {
    const cookieJar = new Map<string, string>();

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login?returnTo=%2Fimports`, {
      redirect: "manual"
    });

    expect(loginResponse.status).toBe(302);
    mergeCookies(cookieJar, loginResponse.headers.getSetCookie());
    expect(cookieJar.has("bbnote_auth_return_to")).toBe(true);
    expect(cookieJar.has("bbnote_oidc_state")).toBe(true);
    expect(cookieJar.has("bbnote_oidc_verifier")).toBe(true);

    const callbackUrl = new URL(String(loginResponse.headers.get("location")), baseUrl);
    expect(callbackUrl.pathname).toBe("/auth/callback");

    const callbackResponse = await fetch(callbackUrl, {
      headers: {
        cookie: serializeCookies(cookieJar)
      },
      redirect: "manual"
    });

    expect(callbackResponse.status).toBe(302);
    mergeCookies(cookieJar, callbackResponse.headers.getSetCookie());
    expect(callbackResponse.headers.get("location")).toBe(`${baseUrl}/imports`);
    expect(cookieJar.has("bbnote_session")).toBe(true);
    expect(cookieJar.has("bbnote_auth_return_to")).toBe(false);

    const sessionResponse = await fetch(`${baseUrl}/api/v1/auth/session`, {
      headers: {
        cookie: serializeCookies(cookieJar)
      }
    });

    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toEqual({
      authenticated: true,
      user: {
        email: "avery@example.com",
        name: "Avery Stone",
        theme: "sea"
      }
    });

    const foldersResponse = await fetch(`${baseUrl}/api/v1/folders`, {
      headers: {
        cookie: serializeCookies(cookieJar)
      }
    });

    expect(foldersResponse.status).toBe(200);
    expect(await foldersResponse.json()).toEqual([]);
  });

  it("stores the selected theme as a user preference", async () => {
    const cookieJar = await signIn(baseUrl);

    const updateResponse = await fetch(`${baseUrl}/api/v1/auth/theme`, {
      method: "PATCH",
      headers: {
        cookie: serializeCookies(cookieJar),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        theme: "midnight"
      })
    });

    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toEqual({
      authenticated: true,
      user: {
        email: "avery@example.com",
        name: "Avery Stone",
        theme: "midnight"
      }
    });

    const sessionResponse = await fetch(`${baseUrl}/api/v1/auth/session`, {
      headers: {
        cookie: serializeCookies(cookieJar)
      }
    });

    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.json()).toEqual({
      authenticated: true,
      user: {
        email: "avery@example.com",
        name: "Avery Stone",
        theme: "midnight"
      }
    });
  });

  it("writes a secure session cookie when https is forwarded by a trusted proxy", async () => {
    const secureConfig = createTestConfig(tempRoot, {
      appBaseUrl: "https://note.example.test"
    });
    const oidc = createTestAuthProvider(secureConfig, {
      email: "proxy@example.com",
      name: "Proxy User",
      subject: "proxy-user"
    });
    const secureApp = await buildApp({
      authTesting: oidc.authTesting,
      config: secureConfig
    });

    try {
      const loginResponse = await secureApp.inject({
        method: "GET",
        url: "/api/v1/auth/login?returnTo=%2F",
        headers: {
          host: "note.example.test",
          "x-forwarded-proto": "https"
        }
      });

      expect(loginResponse.statusCode).toBe(302);
      const stateCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_STATE_COOKIE_NAME);
      const verifierCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_VERIFIER_COOKIE_NAME);
      expect(stateCookie?.secure).toBe(true);
      expect(verifierCookie?.secure).toBe(true);

      const callbackResponse = await secureApp.inject({
        method: "GET",
        url: String(loginResponse.headers.location),
        headers: {
          host: "note.example.test",
          "x-forwarded-proto": "https"
        },
        cookies: {
          [OIDC_STATE_COOKIE_NAME]: stateCookie?.value ?? "",
          [OIDC_VERIFIER_COOKIE_NAME]: verifierCookie?.value ?? ""
        }
      });

      expect(callbackResponse.statusCode).toBe(302);
      expect(callbackResponse.headers.location).toBe("https://note.example.test/");

      const sessionCookie = callbackResponse.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
      expect(sessionCookie?.secure).toBe(true);
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.sameSite).toBe("Lax");

      const sessionResponse = await secureApp.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: {
          host: "note.example.test",
          "x-forwarded-proto": "https"
        },
        cookies: {
          [SESSION_COOKIE_NAME]: sessionCookie?.value ?? ""
        }
      });

      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json()).toEqual({
        authenticated: true,
        user: {
          email: "proxy@example.com",
          name: "Proxy User",
          theme: "sea"
        }
      });
    } finally {
      await secureApp.close();
    }
  });

  it("writes a secure session cookie even when tls is terminated before the app", async () => {
    const secureConfig = createTestConfig(tempRoot, {
      appBaseUrl: "https://note.example.test"
    });
    const oidc = createTestAuthProvider(secureConfig, {
      email: "edge@example.com",
      name: "Edge Proxy",
      subject: "edge-proxy"
    });
    const secureApp = await buildApp({
      authTesting: oidc.authTesting,
      config: secureConfig
    });

    try {
      const loginResponse = await secureApp.inject({
        method: "GET",
        url: "/api/v1/auth/login?returnTo=%2F",
        headers: {
          host: "note.example.test"
        }
      });

      expect(loginResponse.statusCode).toBe(302);
      const stateCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_STATE_COOKIE_NAME);
      const verifierCookie = loginResponse.cookies.find((cookie) => cookie.name === OIDC_VERIFIER_COOKIE_NAME);
      const returnToCookie = loginResponse.cookies.find((cookie) => cookie.name === RETURN_TO_COOKIE_NAME);
      expect(stateCookie?.secure).toBe(true);
      expect(verifierCookie?.secure).toBe(true);
      expect(returnToCookie?.secure).toBe(true);

      const callbackResponse = await secureApp.inject({
        method: "GET",
        url: String(loginResponse.headers.location),
        headers: {
          host: "note.example.test"
        },
        cookies: {
          [OIDC_STATE_COOKIE_NAME]: stateCookie?.value ?? "",
          [OIDC_VERIFIER_COOKIE_NAME]: verifierCookie?.value ?? "",
          [RETURN_TO_COOKIE_NAME]: returnToCookie?.value ?? ""
        }
      });

      expect(callbackResponse.statusCode).toBe(302);
      expect(callbackResponse.headers.location).toBe("https://note.example.test/");
      expect(callbackResponse.headers["set-cookie"]).toEqual(
        expect.arrayContaining([
          expect.stringContaining(`${SESSION_COOKIE_NAME}=`)
        ])
      );

      const sessionCookie = callbackResponse.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
      expect(sessionCookie?.secure).toBe(true);
      expect(sessionCookie?.httpOnly).toBe(true);
      expect(sessionCookie?.sameSite).toBe("Lax");

      const sessionResponse = await secureApp.inject({
        method: "GET",
        url: "/api/v1/auth/session",
        headers: {
          host: "note.example.test"
        },
        cookies: {
          [SESSION_COOKIE_NAME]: sessionCookie?.value ?? ""
        }
      });

      expect(sessionResponse.statusCode).toBe(200);
      expect(sessionResponse.json()).toEqual({
        authenticated: true,
        user: {
          email: "edge@example.com",
          name: "Edge Proxy",
          theme: "sea"
        }
      });
    } finally {
      await secureApp.close();
    }
  });
});

async function signIn(baseUrl: string) {
  const cookieJar = new Map<string, string>();
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login?returnTo=%2F`, {
    redirect: "manual"
  });
  mergeCookies(cookieJar, loginResponse.headers.getSetCookie());

  const callbackUrl = new URL(String(loginResponse.headers.get("location")), baseUrl);
  const callbackResponse = await fetch(callbackUrl, {
    headers: {
      cookie: serializeCookies(cookieJar)
    },
    redirect: "manual"
  });

  mergeCookies(cookieJar, callbackResponse.headers.getSetCookie());
  return cookieJar;
}

function mergeCookies(cookieJar: Map<string, string>, setCookies: string[]) {
  for (const entry of setCookies) {
    const [cookiePair, ...attributes] = entry.split(";");
    const [name, value] = cookiePair.split("=", 2);
    const maxAge = attributes.find((attribute) => attribute.trimStart().startsWith("Max-Age="));
    if (maxAge?.trim() === "Max-Age=0") {
      cookieJar.delete(name);
      continue;
    }

    cookieJar.set(name, `${name}=${value}`);
  }
}

function serializeCookies(cookieJar: Map<string, string>) {
  return [...cookieJar.values()].join("; ");
}

async function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate a TCP port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve((address as AddressInfo).port);
      });
    });
  });
}
