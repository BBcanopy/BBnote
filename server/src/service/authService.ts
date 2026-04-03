import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, RETURN_TO_COOKIE_NAME, SESSION_COOKIE_NAME, authCookieOptions } from "./authConstants.js";
import type { AuthenticatedUser, AuthSessionView, UserTheme } from "./models.js";
import type { OidcIdentity, OidcService, OidcToken } from "./oidcService.js";
import type { UserDb } from "../db/userDb.js";

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60_000;
const DEFAULT_REFRESH_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UserDb,
    private readonly oidcService: OidcService
  ) {}

  async authenticateRequest(request: FastifyRequest, reply?: FastifyReply): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const identity = await this.identityFromBearerToken(token);
      return this.syncIdentity(identity);
    }

    await this.refreshSessionIfNeeded(request, reply);

    const ownerId = request.session.get("userId");
    if (!ownerId) {
      await this.invalidateSession(request, reply);
      throw new Error("Missing session.");
    }

    const user = this.users.getById(ownerId);
    if (!user) {
      await this.invalidateSession(request, reply);
      throw new Error("Session user not found.");
    }

    return {
      ownerId: user.id,
      issuer: user.issuer,
      subject: user.subject,
      email: user.email,
      name: user.display_name,
      theme: user.theme
    };
  }

  async startLogin(request: FastifyRequest, reply: FastifyReply, returnTo: string | undefined) {
    const safeReturnTo = sanitizeReturnTo(returnTo);
    reply.setCookie(RETURN_TO_COOKIE_NAME, safeReturnTo, {
      ...authCookieOptions(this.secureCookies()),
      maxAge: 600
    });

    return this.oidcService.generateAuthorizationUri(request, reply);
  }

  async completeLogin(
    request: FastifyRequest,
    reply: FastifyReply,
    query: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    }
  ) {
    if (query.error) {
      throw new Error(query.error_description ? `${query.error}: ${query.error_description}` : query.error);
    }
    if (!query.code || !query.state) {
      throw new Error("OIDC callback is missing the authorization code.");
    }

    const tokens = await this.oidcService.exchangeAuthorizationCode(request, reply);
    const verifiedIdentity = tokens.token.id_token
      ? this.oidcService.normalizeIdentity(await this.oidcService.verifyIdToken(tokens.token.id_token))
      : null;
    const userinfoIdentity = this.oidcService.normalizeIdentity(
      (await this.oidcService.userinfo(tokens.token)) as Record<string, unknown>,
      verifiedIdentity?.issuer
    );

    if (verifiedIdentity && verifiedIdentity.subject !== userinfoIdentity.subject) {
      throw new Error("OIDC userinfo subject mismatch.");
    }

    const authUser = await this.syncIdentity(mergeIdentity(verifiedIdentity, userinfoIdentity));
    const returnTo = sanitizeReturnTo(request.cookies[RETURN_TO_COOKIE_NAME]);

    await this.persistSession(request, authUser.ownerId, tokens.token);
    reply.setCookie(SESSION_COOKIE_NAME, request.session.encryptedSessionId, {
      ...authCookieOptions(this.secureCookies()),
      expires: request.session.cookie.expires ?? undefined
    });

    this.clearFlowCookies(reply);

    return {
      redirectTo: absoluteAppUrl(this.config.appBaseUrl, returnTo)
    };
  }

  async failLogin(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.session.destroy();
    } catch {
      // Best-effort cleanup only.
    }

    this.clearFlowCookies(reply);
    reply.clearCookie(SESSION_COOKIE_NAME, authCookieOptions(this.secureCookies()));
  }

  async getSessionState(request: FastifyRequest, reply?: FastifyReply): Promise<AuthSessionView> {
    try {
      const user = await this.authenticateRequest(request, reply);
      return {
        authenticated: true,
        user: {
          email: user.email,
          name: user.name,
          theme: user.theme
        }
      };
    } catch {
      return {
        authenticated: false,
        user: null
      };
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.session.destroy();
    } catch {
      // Best-effort cleanup only.
    }

    reply.clearCookie(SESSION_COOKIE_NAME, authCookieOptions(this.secureCookies()));
  }

  async updateTheme(request: FastifyRequest, reply: FastifyReply, theme: UserTheme): Promise<AuthSessionView> {
    const user = await this.authenticateRequest(request, reply);
    const updatedUser = this.users.updateTheme(user.ownerId, theme);

    return {
      authenticated: true,
      user: {
        email: updatedUser?.email ?? user.email,
        name: updatedUser?.display_name ?? user.name,
        theme: updatedUser?.theme ?? theme
      }
    };
  }

  private async identityFromBearerToken(token: string) {
    if (this.oidcService.looksLikeJwt(token)) {
      return this.oidcService.normalizeIdentity(await this.oidcService.verifyBearerJwt(token));
    }

    return this.oidcService.normalizeIdentity((await this.oidcService.userinfo(token)) as Record<string, unknown>);
  }

  private async persistSession(request: FastifyRequest, ownerId: string, token: OidcToken) {
    const maxAge = sessionLifetimeMs(token);

    request.session.options({ maxAge });
    request.session.set("userId", ownerId);
    request.session.set(
      "refreshToken",
      typeof token.refresh_token === "string" && token.refresh_token ? token.refresh_token : undefined
    );
    request.session.set("accessTokenExpiresAt", accessTokenExpiresAt(token).toISOString());

    await request.session.regenerate(["userId", "refreshToken", "accessTokenExpiresAt"]);
    request.session.cookie.maxAge = maxAge;
    await request.session.save();
  }

  private async refreshSessionIfNeeded(request: FastifyRequest, reply?: FastifyReply) {
    const refreshToken = request.session.get("refreshToken");
    if (!refreshToken) {
      return;
    }

    const accessTokenExpiresAtIso = request.session.get("accessTokenExpiresAt");
    if (!shouldRefreshAccessToken(accessTokenExpiresAtIso)) {
      return;
    }

    try {
      const refreshed = await this.oidcService.refreshAccessToken(refreshToken);
      const nextRefreshToken =
        typeof refreshed.token.refresh_token === "string" && refreshed.token.refresh_token
          ? refreshed.token.refresh_token
          : refreshToken;

      request.session.set("refreshToken", nextRefreshToken);
      request.session.set("accessTokenExpiresAt", accessTokenExpiresAt(refreshed.token).toISOString());
      request.session.cookie.maxAge = sessionLifetimeMs({
        ...refreshed.token,
        refresh_token: nextRefreshToken
      });
      await request.session.save();
    } catch (error) {
      await this.invalidateSession(request, reply);
      throw error;
    }
  }

  private async syncIdentity(identity: OidcIdentity): Promise<AuthenticatedUser> {
    const ownerId = crypto.createHash("sha256").update(`${identity.issuer}\u0000${identity.subject}`).digest("base64url");
    const now = new Date().toISOString();

    this.users.upsert({
      id: ownerId,
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      display_name: identity.name,
      theme: "sea",
      created_at: now,
      updated_at: now
    });

    const persistedUser = this.users.getById(ownerId);

    return {
      ownerId,
      issuer: identity.issuer,
      subject: identity.subject,
      email: persistedUser?.email ?? identity.email,
      name: persistedUser?.display_name ?? identity.name,
      theme: persistedUser?.theme ?? "sea"
    };
  }

  private clearFlowCookies(reply: FastifyReply) {
    const options = authCookieOptions(this.secureCookies());
    reply.clearCookie(RETURN_TO_COOKIE_NAME, options);
    reply.clearCookie(OIDC_STATE_COOKIE_NAME, options);
    reply.clearCookie(OIDC_VERIFIER_COOKIE_NAME, options);
  }

  private async invalidateSession(request: FastifyRequest, reply?: FastifyReply) {
    try {
      await request.session.destroy();
    } catch {
      // Best-effort cleanup only.
    }

    if (reply) {
      reply.clearCookie(SESSION_COOKIE_NAME, authCookieOptions(this.secureCookies()));
    }
  }

  private secureCookies() {
    return this.config.appBaseUrl.startsWith("https://");
  }
}

function mergeIdentity(verifiedIdentity: OidcIdentity | null, userinfoIdentity: OidcIdentity): OidcIdentity {
  if (!verifiedIdentity) {
    return userinfoIdentity;
  }

  return {
    issuer: verifiedIdentity.issuer,
    subject: verifiedIdentity.subject,
    email: userinfoIdentity.email ?? verifiedIdentity.email,
    name: userinfoIdentity.name ?? verifiedIdentity.name
  };
}

function sanitizeReturnTo(returnTo: string | undefined) {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return "/";
  }

  return returnTo;
}

function absoluteAppUrl(appBaseUrl: string, returnTo: string) {
  return `${appBaseUrl.replace(/\/$/, "")}${returnTo}`;
}

function sessionLifetimeMs(token: OidcToken) {
  if (token.refresh_token) {
    return refreshTokenLifetimeMs(token) ?? DEFAULT_REFRESH_SESSION_MAX_AGE_MS;
  }

  return accessTokenLifetimeMs(token);
}

function accessTokenExpiresAt(token: OidcToken) {
  return resolveTokenExpiry(token.expires_at, token.expires_in) ?? new Date(Date.now() + 3600_000);
}

function shouldRefreshAccessToken(expiresAtIso: string | undefined) {
  if (!expiresAtIso) {
    return true;
  }

  const expiresAt = new Date(expiresAtIso);
  if (Number.isNaN(expiresAt.valueOf())) {
    return true;
  }

  return expiresAt.valueOf() - Date.now() <= ACCESS_TOKEN_REFRESH_WINDOW_MS;
}

function accessTokenLifetimeMs(token: OidcToken) {
  const expiresAt = accessTokenExpiresAt(token);
  return Math.max(expiresAt.valueOf() - Date.now(), 60_000);
}

function refreshTokenLifetimeMs(token: OidcToken) {
  const expiresAt = resolveTokenExpiry(token.refresh_expires_at, token.refresh_expires_in);
  if (!expiresAt) {
    return null;
  }

  return Math.max(expiresAt.valueOf() - Date.now(), 60_000);
}

function resolveTokenExpiry(expiresAtValue: unknown, expiresInValue: unknown) {
  const expiresAt = normalizeDate(expiresAtValue);
  if (expiresAt) {
    return expiresAt;
  }

  if (typeof expiresInValue === "number" && Number.isFinite(expiresInValue)) {
    return new Date(Date.now() + expiresInValue * 1000);
  }

  return null;
}

function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }

  return null;
}
