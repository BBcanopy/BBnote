import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import type { JWTPayload } from "jose";
import type { AppConfig } from "./configService.js";
import type { MockOidcService } from "./mockOidcService.js";
import type { AuthFlowCookieValue } from "./cookieService.js";

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  issuer: string;
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  name: string | null;
  expiresAt: string;
}

function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export class OidcService {
  private discoveryPromise: Promise<OidcDiscoveryDocument> | null = null;
  private readonly redirectUri: string;
  private readonly remoteJwks;

  constructor(private readonly config: AppConfig, private readonly mockOidc: MockOidcService | null) {
    this.redirectUri = `${this.config.appBaseUrl.replace(/\/$/, "")}/api/v1/auth/callback`;
    this.remoteJwks = createRemoteJWKSet(new URL(`${this.config.oidcIssuerUrl}/jwks`));
  }

  async buildLoginRequest(returnTo: string) {
    const discovery = await this.getDiscovery();
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const authorizationUrl = new URL(discovery.authorization_endpoint);

    authorizationUrl.searchParams.set("client_id", this.config.oidcClientIdWeb);
    authorizationUrl.searchParams.set("redirect_uri", this.redirectUri);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("scope", this.config.oidcScopes);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");

    return {
      authorizationUrl: authorizationUrl.toString(),
      flow: {
        state,
        nonce,
        codeVerifier,
        returnTo,
        createdAt: new Date().toISOString()
      } satisfies AuthFlowCookieValue
    };
  }

  async completeAuthorizationCode(input: { code: string; flow: AuthFlowCookieValue }) {
    const tokens = await this.exchangeAuthorizationCode(input);

    if (!tokens.id_token) {
      throw new Error("OIDC provider did not return an id_token.");
    }

    const claims = await this.verifyIdToken(tokens.id_token);
    if (claims.nonce !== input.flow.nonce) {
      throw new Error("OIDC nonce mismatch.");
    }

    const expiryDate =
      typeof claims.exp === "number"
        ? new Date(claims.exp * 1000)
        : new Date(Date.now() + Math.max(tokens.expires_in ?? 3600, 300) * 1000);

    return {
      issuer: String(claims.iss),
      subject: String(claims.sub),
      email: typeof claims.email === "string" ? claims.email : null,
      name: typeof claims.name === "string" ? claims.name : null,
      expiresAt: expiryDate.toISOString()
    } satisfies OidcIdentity;
  }

  async verifyBearerToken(token: string): Promise<JWTPayload> {
    if (this.mockOidc && this.mockOidc.matchesIssuer(this.config.oidcIssuerUrl)) {
      return this.mockOidc.verifyAccessToken(token);
    }

    const result = await jwtVerify(token, this.remoteJwks, {
      issuer: this.config.oidcIssuerUrl,
      audience: [this.config.oidcClientIdWeb, this.config.oidcClientIdAndroid]
    });

    return result.payload;
  }

  private async getDiscovery() {
    if (this.mockOidc && this.mockOidc.matchesIssuer(this.config.oidcIssuerUrl)) {
      return this.mockOidc.discoveryDocument() as Promise<OidcDiscoveryDocument>;
    }

    if (!this.discoveryPromise) {
      this.discoveryPromise = fetch(`${this.config.oidcIssuerUrl}/.well-known/openid-configuration`).then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load OIDC discovery document.");
        }
        return (await response.json()) as OidcDiscoveryDocument;
      });
    }

    return this.discoveryPromise;
  }

  private async verifyIdToken(idToken: string) {
    if (this.mockOidc && this.mockOidc.matchesIssuer(this.config.oidcIssuerUrl)) {
      return this.mockOidc.verifyAccessToken(idToken);
    }

    const result = await jwtVerify(idToken, this.remoteJwks, {
      issuer: this.config.oidcIssuerUrl,
      audience: this.config.oidcClientIdWeb
    });
    return result.payload;
  }

  private async exchangeAuthorizationCode(input: { code: string; flow: AuthFlowCookieValue }) {
    if (this.mockOidc && this.mockOidc.matchesIssuer(this.config.oidcIssuerUrl)) {
      return this.mockOidc.exchangeAuthorizationCode({
        code: input.code,
        clientId: this.config.oidcClientIdWeb,
        redirectUri: this.redirectUri,
        codeVerifier: input.flow.codeVerifier
      });
    }

    const discovery = await this.getDiscovery();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: this.redirectUri,
      client_id: this.config.oidcClientIdWeb,
      code_verifier: input.flow.codeVerifier
    });

    if (this.config.oidcClientSecret) {
      body.set("client_secret", this.config.oidcClientSecret);
    }

    const response = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error("OIDC token exchange failed.");
    }

    return (await response.json()) as {
      id_token?: string;
      access_token?: string;
      expires_in?: number;
    };
  }
}
