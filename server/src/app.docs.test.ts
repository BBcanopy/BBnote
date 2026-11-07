import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestAuthProvider, createTestConfig } from "./test-helpers.js";

describe("swagger docs", () => {
  let app: FastifyInstance;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-docs-"));
    const config = createTestConfig(tempRoot);
    const oidc = createTestAuthProvider(config, {
      email: "docs@example.com",
      name: "Docs User",
      subject: "docs-user"
    });
    app = await buildApp({
      authTesting: oidc.authTesting,
      config
    });
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("serves swagger ui and the generated spec", async () => {
    const docsResponse = await app.inject({
      method: "GET",
      url: "/docs/"
    });
    expect(docsResponse.statusCode).toBe(200);
    expect(docsResponse.body).toContain("Swagger UI");

    const specResponse = await app.inject({
      method: "GET",
      url: "/docs/json"
    });
    expect(specResponse.statusCode).toBe(200);
    expect(specResponse.json()).toMatchObject({
      info: {
        title: "BBNote API"
      }
    });
    expect(specResponse.json().paths["/api/v1/notes"]).toBeDefined();
    expect(specResponse.json().paths["/healthz"]).toBeDefined();
    expect(specResponse.json().components.securitySchemes.bearerAuth.scheme).toBe("bearer");
    expect(specResponse.json().paths["/api/v1/notes"].get.security).toContainEqual({ bearerAuth: [] });
  });

  it("publishes only public native OIDC settings", async () => {
    const response = await app.inject({ method: "GET", url: "/api/v1/auth/native-config" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ issuer: "https://issuer.example.com", clientId: "bbnote-android", scopes: ["openid", "profile", "email"] });
    expect(response.body).not.toContain("secret");
    expect(response.cookies).toHaveLength(0);
  });

  it("accepts native bearer requests without cookies and answers their preflight", async () => {
    const headers = { origin: "https://localhost", authorization: "Bearer test-access-token" };
    const session = await app.inject({ method: "GET", url: "/api/v1/auth/session", headers });
    expect(session.json().authenticated).toBe(true);
    const folders = await app.inject({ method: "GET", url: "/api/v1/folders", headers });
    expect(folders.statusCode).toBe(200);
    const preflight = await app.inject({ method: "OPTIONS", url: "/api/v1/folders", headers: {
      origin: "https://localhost", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type"
    } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://localhost");
    expect(preflight.headers["access-control-allow-headers"]).toContain("authorization");
  });
});
