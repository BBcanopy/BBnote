import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import type { AppConfig } from "./configService.js";
import { OidcService } from "./oidcService.js";

describe("OidcService", () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          })
      )
    );
  });

  it("uses jwks_uri from discovery for token verification", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = "test-key";

    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");

      if (url.pathname === "/.well-known/openid-configuration") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            issuer: issuerBaseUrl(server),
            authorization_endpoint: `${issuerBaseUrl(server)}/authorize`,
            token_endpoint: `${issuerBaseUrl(server)}/token`,
            jwks_uri: `${issuerBaseUrl(server)}/.well-known/jwks.json`
          })
        );
        return;
      }

      if (url.pathname === "/.well-known/jwks.json") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ keys: [publicJwk] }));
        return;
      }

      if (url.pathname === "/jwks") {
        response.writeHead(200, { "content-type": "text/html" });
        response.end("<html>not json</html>");
        return;
      }

      if (url.pathname === "/token") {
        const idToken = await new SignJWT({
          sub: "user-123",
          email: "avery@example.com",
          name: "Avery Stone",
          nonce: "nonce-123"
        })
          .setProtectedHeader({ alg: "RS256", kid: "test-key" })
          .setIssuer(issuerBaseUrl(server))
          .setAudience("bbnote-web")
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(privateKey);

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id_token: idToken, access_token: "unused", expires_in: 3600 }));
        return;
      }

      response.writeHead(404).end();
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    servers.push(server);

    const service = new OidcService(
      {
        port: 3000,
        appBaseUrl: "http://localhost:8082",
        oidcIssuerUrl: issuerBaseUrl(server),
        oidcClientIdWeb: "bbnote-web",
        oidcClientIdAndroid: "bbnote-android",
        oidcClientSecret: "secret",
        oidcScopes: "openid profile email",
        sessionSecret: "session-secret",
        sqlitePath: "/tmp/db.sqlite",
        notesRoot: "/tmp/notes",
        attachmentsRoot: "/tmp/attachments",
        exportsRoot: "/tmp/exports",
        mockOidcEnabled: false
      } satisfies AppConfig,
      null
    );

    const identity = await service.completeAuthorizationCode({
      code: "test-code",
      flow: {
        state: "state-123",
        nonce: "nonce-123",
        codeVerifier: "verifier-123",
        returnTo: "/",
        createdAt: new Date().toISOString()
      }
    });

    expect(identity.subject).toBe("user-123");
    expect(identity.email).toBe("avery@example.com");
  });
});

function issuerBaseUrl(server: http.Server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server is not listening on a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}
