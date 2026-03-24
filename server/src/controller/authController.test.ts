import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
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
