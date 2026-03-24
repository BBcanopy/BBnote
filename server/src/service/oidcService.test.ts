import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./configService.js";
import { MockOidcService } from "./mockOidcService.js";
import { OidcService } from "./oidcService.js";

describe("OidcService", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("verifies signed bearer tokens against jwks", async () => {
    const config = buildConfig("http://127.0.0.1:3000/mock-oidc");
    const app = Fastify();
    apps.push(app);
    await app.register(jwt, {
      secret: "bbnote-dev-session-secret-0123456789"
    });

    const mockOidc = new MockOidcService(config);
    const oidc = new OidcService(config, app, mockOidc);
    const issued = await mockOidc.issueTestToken({
      clientId: config.oidcClientIdAndroid,
      email: "avery@example.com",
      name: "Avery Stone"
    });

    const claims = await oidc.verifyBearerJwt(issued.access_token);

    expect(claims.sub).toBeTruthy();
    expect(claims.email).toBe("avery@example.com");
    expect(claims.name).toBe("Avery Stone");
  });
});

function buildConfig(issuer: string): AppConfig {
  return {
    port: 3000,
    appBaseUrl: "http://127.0.0.1:3000",
    oidcIssuerUrl: issuer,
    oidcClientIdWeb: "bbnote-web",
    oidcClientIdAndroid: "bbnote-android",
    oidcClientSecret: "bbnote-dev-client-secret",
    oidcScopes: "openid profile email",
    sessionSecret: "bbnote-dev-session-secret-0123456789",
    sqlitePath: "/tmp/db.sqlite",
    notesRoot: "/tmp/notes",
    attachmentsRoot: "/tmp/attachments",
    exportsRoot: "/tmp/exports",
    mockOidcEnabled: true
  };
}
