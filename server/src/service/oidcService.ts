import { createPublicKey } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import type { OidcAuthTestingOptions } from "./oidcTesting.js";

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

interface JwksDocument {
  keys: Array<Record<string, unknown>>;
}

type JsonWebKeyLike = Record<string, unknown>;

export interface OidcTokenResponse {
  token: {
    access_token: string;
    expires_at?: Date;
    expires_in?: number;
    id_token?: string;
  };
}

export interface OidcIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  name: string | null;
}

export class OidcService {
  private discoveryPromise: Promise<OidcDiscoveryDocument> | null = null;
  private jwksPromise: Promise<JwksDocument> | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly app: FastifyInstance | undefined,
    private readonly authTesting?: OidcAuthTestingOptions
  ) {}

  async generateAuthorizationUri(request: FastifyRequest, reply: FastifyReply) {
    return this.requireApp().oidc.generateAuthorizationUri(request, reply);
  }

  async exchangeAuthorizationCode(request: FastifyRequest, reply: FastifyReply): Promise<OidcTokenResponse> {
    return this.requireApp().oidc.getAccessTokenFromAuthorizationCodeFlow(request, reply) as Promise<OidcTokenResponse>;
  }

  async userinfo(tokenSetOrToken: { access_token?: string } | string) {
    return this.requireApp().oidc.userinfo(tokenSetOrToken as any);
  }

  async verifyIdToken(idToken: string) {
    return this.verifyJwt(idToken, this.config.oidcClientIdWeb);
  }

  async verifyBearerJwt(token: string) {
    return this.verifyJwt(token);
  }

  normalizeIdentity(
    payload: {
      iss?: unknown;
      sub?: unknown;
      email?: unknown;
      name?: unknown;
    },
    fallbackIssuer = normalizeIssuer(this.config.oidcIssuerUrl)
  ): OidcIdentity {
    return {
      issuer: typeof payload.iss === "string" ? normalizeIssuer(payload.iss) : fallbackIssuer,
      subject: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null
    };
  }

  looksLikeJwt(token: string) {
    return token.split(".").length === 3;
  }

  private async verifyJwt(token: string, audience?: string | string[]) {
    if (this.authTesting?.jwtVerifier) {
      return this.authTesting.jwtVerifier.verify(token) as Promise<Record<string, unknown>>;
    }

    const header = decodeJwtHeader(token);
    if (header.alg === "none" || header.alg.startsWith("HS")) {
      throw new Error("OIDC token uses an unsupported signing algorithm.");
    }

    const key = await this.resolveVerificationKey(header.kid);
    return this.requireApp().jwt.verify<Record<string, unknown>>(token, {
      key,
      allowedIss: normalizeIssuer(this.config.oidcIssuerUrl),
      ...(audience ? { allowedAud: audience } : {})
    });
  }

  private async resolveVerificationKey(kid: string | null) {
    const jwks = await this.getJwks();
    const match =
      (kid ? jwks.keys.find((key) => key.kid === kid) : undefined) ??
      (jwks.keys.length === 1 ? jwks.keys[0] : undefined);

    if (!match) {
      throw new Error("Unable to resolve the OIDC verification key.");
    }

    return createPublicKey({
      key: match as JsonWebKeyLike,
      format: "jwk"
    }).export({
      format: "pem",
      type: "spki"
    }).toString();
  }

  private async getDiscovery() {
    if (!this.discoveryPromise) {
      this.discoveryPromise = fetch(`${normalizeIssuer(this.config.oidcIssuerUrl)}/.well-known/openid-configuration`).then(
        async (response) => {
          if (!response.ok) {
            throw new Error("Failed to load the OIDC discovery document.");
          }

          return (await response.json()) as OidcDiscoveryDocument;
        }
      );
    }

    return this.discoveryPromise;
  }

  private async getJwks() {
    if (!this.jwksPromise) {
      this.jwksPromise = this.getDiscovery().then(async (discovery) => {
        const response = await fetch(discovery.jwks_uri);
        if (!response.ok) {
          throw new Error("Failed to load the OIDC JWKS.");
        }
        return (await response.json()) as JwksDocument;
      });
    }

    return this.jwksPromise;
  }

  private requireApp() {
    if (!this.app) {
      throw new Error("OIDC service requires a Fastify app instance.");
    }

    return this.app;
  }
}

function decodeJwtHeader(token: string) {
  const [encodedHeader] = token.split(".", 1);
  if (!encodedHeader) {
    throw new Error("OIDC token is not a JWT.");
  }

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8")) as {
    alg?: unknown;
    kid?: unknown;
  };
  if (typeof header.alg !== "string" || !header.alg) {
    throw new Error("OIDC token is missing its signing algorithm.");
  }

  return {
    alg: header.alg,
    kid: typeof header.kid === "string" ? header.kid : null
  };
}

function extractAccessToken(tokenSetOrToken: { access_token?: string } | string) {
  if (typeof tokenSetOrToken === "string") {
    return tokenSetOrToken;
  }
  if (typeof tokenSetOrToken.access_token === "string" && tokenSetOrToken.access_token) {
    return tokenSetOrToken.access_token;
  }
  throw new Error("OIDC token response did not include an access_token.");
}

function normalizeIssuer(issuer: string) {
  return issuer.replace(/\/$/, "");
}
