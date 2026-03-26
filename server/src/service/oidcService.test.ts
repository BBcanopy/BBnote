import { generateKeyPairSync, sign as signBuffer } from "node:crypto";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./configService.js";
import { OidcService } from "./oidcService.js";

describe("OidcService", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  let issuerUrl = "";
  let publicJwk: Record<string, unknown>;
  let privateKeyPem = "";

  beforeEach(async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048
    });
    privateKeyPem = privateKey.export({
      format: "pem",
      type: "pkcs8"
    }).toString();
    publicJwk = publicKey.export({
      format: "jwk"
    }) as Record<string, unknown>;

    const metadataApp = Fastify();
    apps.push(metadataApp);
    metadataApp.get("/.well-known/openid-configuration", async () => ({
      issuer: issuerUrl,
      jwks_uri: `${issuerUrl}/jwks`
    }));
    metadataApp.get("/jwks", async () => ({
      keys: [
        {
          ...publicJwk,
          alg: "RS256",
          kid: "test-key",
          use: "sig"
        }
      ]
    }));

    issuerUrl = await metadataApp.listen({
      host: "127.0.0.1",
      port: 0
    });
  });

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("verifies signed bearer tokens against jwks", async () => {
    const config = buildConfig(issuerUrl);
    const app = Fastify();
    apps.push(app);
    await app.register(jwt, {
      secret: "bbnote-dev-session-secret-0123456789"
    });

    const oidc = new OidcService(config, app);
    const token = signJwt(privateKeyPem, {
      email: "avery@example.com",
      iss: issuerUrl,
      name: "Avery Stone",
      sub: "avery-stone"
    });

    const claims = await oidc.verifyBearerJwt(token);

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
    attachmentMaxBytes: 50 * 1024 * 1024,
    exportsRoot: "/tmp/exports"
  };
}

function signJwt(privateKeyPem: string, payload: Record<string, unknown>) {
  const encodedHeader = Buffer.from(JSON.stringify({
    alg: "RS256",
    kid: "test-key",
    typ: "JWT"
  })).toString("base64url");
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signBuffer("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), privateKeyPem).toString("base64url");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
