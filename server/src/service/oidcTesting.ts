import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, authCookieOptions } from "./authConstants.js";

export interface OidcTokenResponse {
  token: {
    access_token: string;
    expires_at?: Date;
    expires_in?: number;
    id_token?: string;
  };
}

export interface OidcOAuth2NamespaceLike {
  generateAuthorizationUri(request: FastifyRequest, reply: FastifyReply): Promise<string>;
  getAccessTokenFromAuthorizationCodeFlow(request: FastifyRequest, reply: FastifyReply): Promise<OidcTokenResponse>;
  userinfo(tokenSetOrToken: { access_token?: string } | string): Promise<Record<string, unknown>>;
}

export interface JwtVerifierLike {
  verify(token: string): unknown | Promise<unknown>;
}

export interface OidcAuthTestingOptions {
  jwtVerifier?: JwtVerifierLike;
  oauth2Namespace?: OidcOAuth2NamespaceLike;
}

export interface TestOidcIdentity {
  email: string | null;
  issuer?: string;
  name: string | null;
  subject: string;
}

interface MutableMockClaims extends Record<string, unknown> {
  aud: string | string[];
  email?: string;
  iss: string;
  name?: string;
  sub: string;
}

const TEST_ACCESS_TOKEN = "test-access-token";
const TEST_AUTH_CODE = "test-auth-code";
const TEST_ID_TOKEN = "test-id-token";
const TEST_STATE = "test-state";
const TEST_VERIFIER = "test-code-verifier";

export function createMutableMockOidcProvider(config: AppConfig, initialIdentity: TestOidcIdentity) {
  let currentIdentity = initialIdentity;
  let currentVerifierError: Error | null = null;
  let currentClaimsOverrides: Partial<MutableMockClaims> = {};
  let shouldOmitIdToken = false;

  const secureCookies = config.appBaseUrl.startsWith("https://");
  const cookieOptions = authCookieOptions(secureCookies);

  function buildClaims(): MutableMockClaims {
    const issuer = normalizeIssuer(currentIdentity.issuer ?? config.oidcIssuerUrl);
    const claims: MutableMockClaims = {
      aud: config.oidcClientIdWeb,
      iss: issuer,
      sub: currentIdentity.subject
    };

    if (currentIdentity.email) {
      claims.email = currentIdentity.email;
    }
    if (currentIdentity.name) {
      claims.name = currentIdentity.name;
    }

    return {
      ...claims,
      ...currentClaimsOverrides
    };
  }

  const oauth2Namespace: OidcOAuth2NamespaceLike = {
    async generateAuthorizationUri(_request, reply) {
      reply.setCookie(OIDC_STATE_COOKIE_NAME, TEST_STATE, cookieOptions);
      reply.setCookie(OIDC_VERIFIER_COOKIE_NAME, TEST_VERIFIER, cookieOptions);
      return `/auth/callback?code=${TEST_AUTH_CODE}&state=${TEST_STATE}`;
    },

    async getAccessTokenFromAuthorizationCodeFlow(request, reply) {
      const requestUrl = new URL(request.url, config.appBaseUrl);
      if (requestUrl.pathname !== "/auth/callback") {
        throw new Error(`Unexpected callback path: ${requestUrl.pathname}`);
      }
      if (requestUrl.searchParams.get("code") !== TEST_AUTH_CODE || requestUrl.searchParams.get("state") !== TEST_STATE) {
        throw new Error(`Unexpected callback query: ${requestUrl.search}`);
      }
      if (
        request.cookies[OIDC_STATE_COOKIE_NAME] !== TEST_STATE ||
        request.cookies[OIDC_VERIFIER_COOKIE_NAME] !== TEST_VERIFIER
      ) {
        throw new Error("Unexpected OIDC state or verifier cookies.");
      }

      reply.clearCookie(OIDC_STATE_COOKIE_NAME, cookieOptions);
      reply.clearCookie(OIDC_VERIFIER_COOKIE_NAME, cookieOptions);

      return {
        token: shouldOmitIdToken
          ? {
              access_token: TEST_ACCESS_TOKEN,
              expires_in: 3600
            }
          : {
              access_token: TEST_ACCESS_TOKEN,
              expires_in: 3600,
              id_token: TEST_ID_TOKEN
            }
      };
    },

    async userinfo(tokenSetOrToken) {
      if (extractAccessToken(tokenSetOrToken) !== TEST_ACCESS_TOKEN) {
        throw new Error("Unexpected access token.");
      }

      return buildClaims();
    }
  };

  const jwtVerifier: JwtVerifierLike = {
    async verify(token) {
      if (token !== TEST_ID_TOKEN && token !== TEST_ACCESS_TOKEN) {
        throw new Error(`Unexpected token: ${token}`);
      }
      if (currentVerifierError) {
        throw currentVerifierError;
      }

      return buildClaims();
    }
  };

  return {
    accessToken: TEST_ACCESS_TOKEN,
    authTesting: {
      jwtVerifier,
      oauth2Namespace
    } satisfies OidcAuthTestingOptions,
    setClaimsOverrides(overrides: Partial<MutableMockClaims>) {
      currentClaimsOverrides = overrides;
    },
    setIdentity(identity: TestOidcIdentity) {
      currentIdentity = identity;
      currentClaimsOverrides = {};
      currentVerifierError = null;
      shouldOmitIdToken = false;
    },
    setMissingIdToken(value: boolean) {
      shouldOmitIdToken = value;
    },
    setVerifierError(error: Error | null) {
      currentVerifierError = error;
    }
  };
}

export function createEnvTestAuth(config: AppConfig) {
  const provider = createMutableMockOidcProvider(config, {
    email: process.env.BBNOTE_TEST_AUTH_EMAIL?.trim() || "avery@example.com",
    issuer: process.env.BBNOTE_TEST_AUTH_ISSUER?.trim() || config.oidcIssuerUrl,
    name: process.env.BBNOTE_TEST_AUTH_NAME?.trim() || "Avery Stone",
    subject: process.env.BBNOTE_TEST_AUTH_SUBJECT?.trim() || "bbnote-test-user"
  });

  return provider.authTesting;
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
