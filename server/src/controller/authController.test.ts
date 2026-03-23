import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("authController integration", () => {
  let app: FastifyInstance;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.OIDC_ISSUER_URL = "http://localhost:3000/mock-oidc";
    process.env.OIDC_CLIENT_ID_WEB = "bbnote-web";
    process.env.OIDC_CLIENT_ID_ANDROID = "bbnote-android";
    process.env.OIDC_CLIENT_SECRET = "bbnote-dev-client-secret";
    process.env.OIDC_SCOPES = "openid profile email";
    process.env.SESSION_SECRET = "session-secret";
    process.env.SQLITE_PATH = path.join(tempRoot, "db", "bbnote.sqlite");
    process.env.NOTES_ROOT = path.join(tempRoot, "notes");
    process.env.ATTACHMENTS_ROOT = path.join(tempRoot, "attachments");
    process.env.EXPORTS_ROOT = path.join(tempRoot, "exports");
    process.env.MOCK_OIDC_ENABLED = "true";

    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    delete process.env.APP_BASE_URL;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID_WEB;
    delete process.env.OIDC_CLIENT_ID_ANDROID;
    delete process.env.OIDC_CLIENT_SECRET;
    delete process.env.OIDC_SCOPES;
    delete process.env.SESSION_SECRET;
    delete process.env.SQLITE_PATH;
    delete process.env.NOTES_ROOT;
    delete process.env.ATTACHMENTS_ROOT;
    delete process.env.EXPORTS_ROOT;
    delete process.env.MOCK_OIDC_ENABLED;
  });

  it("signs in through server-managed oidc and authenticates protected routes via session cookie", async () => {
    const loginResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/login?returnTo=%2Fimports"
    });

    expect(loginResponse.statusCode).toBe(302);
    const authFlowCookie = getCookieValue(loginResponse.headers["set-cookie"], "bbnote_auth_flow");
    expect(authFlowCookie).toBeTruthy();

    const authorizeLocation = new URL(String(loginResponse.headers.location));
    const authorizePayload = new URLSearchParams(authorizeLocation.searchParams);
    authorizePayload.set("name", "Avery Stone");
    authorizePayload.set("email", "avery@example.com");

    const authorizeResponse = await app.inject({
      method: "POST",
      url: authorizeLocation.pathname,
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      payload: authorizePayload.toString()
    });

    expect(authorizeResponse.statusCode).toBe(302);
    const callbackUrl = new URL(String(authorizeResponse.headers.location));
    expect(callbackUrl.pathname).toBe("/auth/callback");

    const callbackResponse = await app.inject({
      method: "GET",
      url: `${callbackUrl.pathname}${callbackUrl.search}`,
      headers: {
        cookie: authFlowCookie!
      }
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe("http://localhost:3000/imports");

    const sessionCookie = getCookieValue(callbackResponse.headers["set-cookie"], "bbnote_session");
    expect(sessionCookie).toBeTruthy();

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/api/v1/auth/session",
      headers: {
        cookie: sessionCookie!
      }
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toEqual({
      authenticated: true,
      user: {
        email: "avery@example.com",
        name: "Avery Stone"
      }
    });

    const foldersResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: {
        cookie: sessionCookie!
      }
    });

    expect(foldersResponse.statusCode).toBe(200);
    expect(foldersResponse.json()).toEqual([]);
  });
});

function getCookieValue(setCookieHeader: string | string[] | undefined, cookieName: string) {
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];
  const match = cookies.find((entry) => entry.startsWith(`${cookieName}=`));
  return match ? match.split(";", 1)[0] : null;
}
