import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import { AUTH_FLOW_COOKIE_NAME, SESSION_COOKIE_NAME, type CookieService } from "./cookieService.js";
import type { AuthenticatedUser, AuthSessionView } from "./models.js";
import type { OidcService } from "./oidcService.js";
import type { SessionDb } from "../db/sessionDb.js";
import type { UserDb } from "../db/userDb.js";

export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly users: UserDb,
    private readonly sessions: SessionDb,
    private readonly oidcService: OidcService,
    readonly cookieService: CookieService
  ) {}

  async authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    if (authorization?.startsWith("Bearer ")) {
      const token = authorization.slice("Bearer ".length);
      const payload = await this.oidcService.verifyBearerToken(token);
      return this.syncUserFromClaims(payload);
    }

    const sessionId = this.cookieService.readSignedCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (!sessionId) {
      throw new Error("Missing session.");
    }

    this.sessions.deleteExpired(new Date().toISOString());
    const session = this.sessions.getById(sessionId);
    if (!session || session.expires_at <= new Date().toISOString()) {
      throw new Error("Session expired.");
    }

    const user = this.users.getById(session.owner_id);
    if (!user) {
      this.sessions.deleteById(sessionId);
      throw new Error("Session user not found.");
    }

    return {
      ownerId: user.id,
      issuer: user.issuer,
      subject: user.subject,
      email: user.email,
      name: user.display_name
    };
  }

  async startLogin(returnTo: string | undefined) {
    const safeReturnTo = sanitizeReturnTo(returnTo);
    const { authorizationUrl, flow } = await this.oidcService.buildLoginRequest(safeReturnTo);

    return {
      redirectUrl: authorizationUrl,
      flowCookie: this.cookieService.serializeJsonCookie(AUTH_FLOW_COOKIE_NAME, flow, 600)
    };
  }

  async completeLogin(
    request: FastifyRequest,
    query: {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    }
  ) {
    const flow = this.cookieService.readJsonCookie(request.headers.cookie, AUTH_FLOW_COOKIE_NAME);
    if (!flow) {
      throw new Error("Login flow state is missing.");
    }

    if (query.error) {
      throw new Error(query.error_description ? `${query.error}: ${query.error_description}` : query.error);
    }
    if (!query.code || !query.state) {
      throw new Error("OIDC callback is missing the authorization code.");
    }
    if (query.state !== flow.state) {
      throw new Error("OIDC state mismatch.");
    }

    const identity = await this.oidcService.completeAuthorizationCode({
      code: query.code,
      flow
    });
    const authUser = await this.syncIdentity(identity);
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    this.sessions.insert({
      id: sessionId,
      owner_id: authUser.ownerId,
      created_at: now,
      updated_at: now,
      expires_at: identity.expiresAt
    });

    return {
      redirectTo: absoluteAppUrl(this.config.appBaseUrl, flow.returnTo),
      flowCookie: this.cookieService.clearCookie(AUTH_FLOW_COOKIE_NAME),
      sessionCookie: this.cookieService.serializeSignedCookie(
        SESSION_COOKIE_NAME,
        sessionId,
        Math.max(Math.floor((Date.parse(identity.expiresAt) - Date.now()) / 1000), 60)
      )
    };
  }

  async getSessionState(request: FastifyRequest): Promise<AuthSessionView> {
    try {
      const user = await this.authenticateRequest(request);
      return {
        authenticated: true,
        user: {
          email: user.email,
          name: user.name
        }
      };
    } catch {
      return {
        authenticated: false,
        user: null
      };
    }
  }

  async logout(request: FastifyRequest) {
    const sessionId = this.cookieService.readSignedCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    if (sessionId) {
      this.sessions.deleteById(sessionId);
    }
    return this.cookieService.clearCookie(SESSION_COOKIE_NAME);
  }

  private async syncUserFromClaims(payload: {
    iss?: unknown;
    sub?: unknown;
    email?: unknown;
    name?: unknown;
  }): Promise<AuthenticatedUser> {
    const identity = {
      issuer: String(payload.iss),
      subject: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      expiresAt: new Date(Date.now() + 3600_000).toISOString()
    };

    return this.syncIdentity(identity);
  }

  private async syncIdentity(identity: {
    issuer: string;
    subject: string;
    email: string | null;
    name: string | null;
  }): Promise<AuthenticatedUser> {
    const ownerId = crypto.createHash("sha256").update(`${identity.issuer}\u0000${identity.subject}`).digest("base64url");
    const now = new Date().toISOString();

    this.users.upsert({
      id: ownerId,
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      display_name: identity.name,
      created_at: now,
      updated_at: now
    });

    return {
      ownerId,
      issuer: identity.issuer,
      subject: identity.subject,
      email: identity.email,
      name: identity.name
    };
  }
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
