import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, authCookieOptions } from "./authConstants.js";
import type { OidcToken, OidcTokenResponse } from "./oidcService.js";

export interface OidcOAuth2NamespaceLike {
  generateAuthorizationUri(request: FastifyRequest, reply: FastifyReply): Promise<string>;
  getAccessTokenFromAuthorizationCodeFlow(request: FastifyRequest, reply: FastifyReply): Promise<OidcTokenResponse>;
  getNewAccessTokenUsingRefreshToken(refreshToken: OidcToken, params: Record<string, never>): Promise<OidcTokenResponse>;
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
const TEST_REFRESH_TOKEN = "test-refresh-token";
const TEST_STATE = "test-state";
const TEST_VERIFIER = "test-code-verifier";

export interface MockOidcOptions {
  accessTokenExpiresInSeconds?: number;
  accessTokenExpiresAt?: Date | string | number;
  includeRefreshToken?: boolean;
  refreshTokenExpiresAt?: Date | string | number;
  refreshTokenExpiresInSeconds?: number;
}

export function createMutableMockOidcProvider(
  config: AppConfig,
  initialIdentity: TestOidcIdentity,
  options: MockOidcOptions = {}
) {
  let currentIdentity = initialIdentity;
  let currentVerifierError: Error | null = null;
  let currentClaimsOverrides: Partial<MutableMockClaims> = {};
  let shouldOmitIdToken = false;
  let currentAccessTokenExpiresInSeconds = options.accessTokenExpiresInSeconds ?? 3600;
  let currentIncludeRefreshToken = options.includeRefreshToken ?? true;
  let currentRefreshTokenExpiresInSeconds = options.refreshTokenExpiresInSeconds;
  let currentRefreshError: Error | null = null;
  let currentRefreshGate: Promise<void> | null = null;
  let releaseCurrentRefreshGate: (() => void) | null = null;
  let refreshAttemptCount = 0;
  const refreshAttemptWaiters: Array<{
    target: number;
    resolve: () => void;
  }> = [];
  let refreshCallCount = 0;
  let tokenVersion = 0;

  const secureCookies = config.appBaseUrl.startsWith("https://");
  const cookieOptions = authCookieOptions(secureCookies);

  function buildTokenSet(version = tokenVersion): OidcToken {
    const token: OidcToken = {
      access_token: version === 0 ? TEST_ACCESS_TOKEN : `${TEST_ACCESS_TOKEN}-${version}`
    };

    if (options.accessTokenExpiresAt !== undefined) {
      token.expires_at = options.accessTokenExpiresAt;
    } else {
      token.expires_in = currentAccessTokenExpiresInSeconds;
    }

    if (!shouldOmitIdToken) {
      token.id_token = version === 0 ? TEST_ID_TOKEN : `${TEST_ID_TOKEN}-${version}`;
    }

    if (currentIncludeRefreshToken) {
      token.refresh_token = version === 0 ? TEST_REFRESH_TOKEN : `${TEST_REFRESH_TOKEN}-${version}`;
      if (options.refreshTokenExpiresAt !== undefined) {
        token.refresh_expires_at = options.refreshTokenExpiresAt;
      } else if (typeof currentRefreshTokenExpiresInSeconds === "number") {
        token.refresh_expires_in = currentRefreshTokenExpiresInSeconds;
      }
    }

    return token;
  }

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
        token: buildTokenSet()
      };
    },

    async getNewAccessTokenUsingRefreshToken(refreshToken) {
      if (!currentIncludeRefreshToken) {
        throw new Error("Unexpected refresh token request.");
      }
      refreshAttemptCount += 1;
      flushRefreshAttemptWaiters();
      if (currentRefreshGate) {
        await currentRefreshGate;
      }
      if (currentRefreshError) {
        throw currentRefreshError;
      }

      const expectedRefreshToken = tokenVersion === 0 ? TEST_REFRESH_TOKEN : `${TEST_REFRESH_TOKEN}-${tokenVersion}`;
      if (refreshToken.refresh_token !== expectedRefreshToken) {
        throw new Error("Unexpected refresh token.");
      }

      refreshCallCount += 1;
      tokenVersion += 1;

      return {
        token: buildTokenSet(tokenVersion)
      };
    },

    async userinfo(tokenSetOrToken) {
      const accessToken = extractAccessToken(tokenSetOrToken);
      const validAccessTokens = new Set<string>([TEST_ACCESS_TOKEN]);
      for (let version = 1; version <= tokenVersion; version += 1) {
        validAccessTokens.add(`${TEST_ACCESS_TOKEN}-${version}`);
      }

      if (!validAccessTokens.has(accessToken)) {
        throw new Error("Unexpected access token.");
      }

      return buildClaims();
    }
  };

  const jwtVerifier: JwtVerifierLike = {
    async verify(token) {
      const validTokens = new Set<string>([TEST_ACCESS_TOKEN, TEST_ID_TOKEN]);
      for (let version = 1; version <= tokenVersion; version += 1) {
        validTokens.add(`${TEST_ACCESS_TOKEN}-${version}`);
        validTokens.add(`${TEST_ID_TOKEN}-${version}`);
      }

      if (!validTokens.has(token)) {
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
      currentRefreshError = null;
      shouldOmitIdToken = false;
      currentAccessTokenExpiresInSeconds = options.accessTokenExpiresInSeconds ?? 3600;
      currentIncludeRefreshToken = options.includeRefreshToken ?? true;
      currentRefreshTokenExpiresInSeconds = options.refreshTokenExpiresInSeconds;
      refreshCallCount = 0;
      refreshAttemptCount = 0;
      currentRefreshGate = null;
      releaseCurrentRefreshGate = null;
      refreshAttemptWaiters.splice(0, refreshAttemptWaiters.length);
      tokenVersion = 0;
    },
    pauseRefresh() {
      if (currentRefreshGate) {
        return;
      }

      currentRefreshGate = new Promise<void>((resolve) => {
        releaseCurrentRefreshGate = () => {
          currentRefreshGate = null;
          releaseCurrentRefreshGate = null;
          resolve();
        };
      });
    },
    releaseRefresh() {
      releaseCurrentRefreshGate?.();
    },
    setAccessTokenExpiresInSeconds(value: number) {
      currentAccessTokenExpiresInSeconds = value;
    },
    setIncludeRefreshToken(value: boolean) {
      currentIncludeRefreshToken = value;
    },
    setRefreshError(error: Error | null) {
      currentRefreshError = error;
    },
    setRefreshTokenExpiresInSeconds(value: number | undefined) {
      currentRefreshTokenExpiresInSeconds = value;
    },
    setMissingIdToken(value: boolean) {
      shouldOmitIdToken = value;
    },
    setVerifierError(error: Error | null) {
      currentVerifierError = error;
    },
    getRefreshCallCount() {
      return refreshCallCount;
    },
    waitForRefreshAttemptCount(target: number) {
      if (refreshAttemptCount >= target) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        refreshAttemptWaiters.push({
          target,
          resolve
        });
      });
    }
  };

  function flushRefreshAttemptWaiters() {
    for (let index = refreshAttemptWaiters.length - 1; index >= 0; index -= 1) {
      if (refreshAttemptCount >= refreshAttemptWaiters[index]!.target) {
        refreshAttemptWaiters[index]!.resolve();
        refreshAttemptWaiters.splice(index, 1);
      }
    }
  }
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
