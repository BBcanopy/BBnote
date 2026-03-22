import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./configService.js";
import type { AuthenticatedUser } from "./models.js";
import type { MockOidcService } from "./mockOidcService.js";
import type { UserDb } from "../db/userDb.js";
import type { FolderService } from "./folderService.js";

export class AuthService {
  private readonly remoteJwks;

  constructor(
    private readonly config: AppConfig,
    private readonly users: UserDb,
    private readonly folderService: FolderService,
    private readonly mockOidc: MockOidcService | null
  ) {
    this.remoteJwks = createRemoteJWKSet(new URL(`${this.config.oidcIssuerUrl}/jwks`));
  }

  async authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser> {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error("Missing bearer token.");
    }

    const token = authorization.slice("Bearer ".length);
    const payload = await this.verifyToken(token);
    const issuer = String(payload.iss);
    const subject = String(payload.sub);
    const ownerId = crypto.createHash("sha256").update(`${issuer}\u0000${subject}`).digest("base64url");
    const now = new Date().toISOString();
    this.users.upsert({
      id: ownerId,
      issuer,
      subject,
      email: typeof payload.email === "string" ? payload.email : null,
      display_name: typeof payload.name === "string" ? payload.name : null,
      created_at: now,
      updated_at: now
    });
    await this.folderService.ensureInbox(ownerId);
    return {
      ownerId,
      issuer,
      subject,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null
    };
  }

  private async verifyToken(token: string) {
    if (this.mockOidc && this.mockOidc.matchesIssuer(this.config.oidcIssuerUrl)) {
      return this.mockOidc.verifyAccessToken(token);
    }

    const result = await jwtVerify(token, this.remoteJwks, {
      issuer: this.config.oidcIssuerUrl,
      audience: [this.config.oidcClientIdWeb, this.config.oidcClientIdAndroid]
    });
    return result.payload;
  }
}
