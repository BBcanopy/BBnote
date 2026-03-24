import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, RETURN_TO_COOKIE_NAME, SESSION_COOKIE_NAME, authCookieOptions } from "./authConstants.js";
import type { AuthenticatedUser, AuthSessionView, UserTheme } from "./models.js";
import type { OidcIdentity, OidcService } from "./oidcService.js";
import type { UserDb } from "../db/userDb.js";

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UserDb,
    private readonly oidcService: OidcService
  ) {}

  async authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const identity = await this.identityFromBearerToken(token);
      return this.syncIdentity(identity);
    }

    const ownerId = request.session.get("userId");
    if (!ownerId) {
      throw new Error("Missing session.");
    }

    const user = this.users.getById(ownerId);
    if (!user) {
      await request.session.destroy();
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

    request.session.set("userId", authUser.ownerId);
    request.session.options({
      maxAge: sessionMaxAgeMs(tokens.token)
    });
    await request.session.regenerate(["userId"]);
    await request.session.save();
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

  async getSessionState(request: FastifyRequest): Promise<AuthSessionView> {
    try {
      const user = await this.authenticateRequest(request);
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

  async updateTheme(request: FastifyRequest, theme: UserTheme): Promise<AuthSessionView> {
    const user = await this.authenticateRequest(request);
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

function sessionMaxAgeMs(token: { expires_at?: Date; expires_in?: number }) {
  if (token.expires_at instanceof Date && !Number.isNaN(token.expires_at.valueOf())) {
    return Math.max(token.expires_at.valueOf() - Date.now(), 60_000);
  }

  return Math.max((token.expires_in ?? 3600) * 1000, 60_000);
}
