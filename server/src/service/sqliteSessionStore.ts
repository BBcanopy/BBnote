import type * as Fastify from "fastify";
import type { SessionDb, SessionRow } from "../db/sessionDb.js";

type StoredSession = Fastify.Session & {
  __fastifySessionMetadata?: { generation: string };
};

export class SqliteSessionStore {
  constructor(
    private readonly sessions: SessionDb,
    private readonly cookieOptions: {
      path: string;
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
    }
  ) {}

  set(sessionId: string, session: StoredSession, callback: (error?: unknown) => void) {
    try {
      this.sessions.upsert(this.toRow(sessionId, session));
      callback();
    } catch (error) {
      callback(error);
    }
  }

  compareAndSet(
    sessionId: string,
    expectedGeneration: string,
    session: StoredSession,
    callback: (error?: unknown) => void
  ) {
    try {
      if (!this.sessions.compareAndSet(this.toRow(sessionId, session), expectedGeneration)) {
        throw Object.assign(new Error("The session does not exist or has changed"), { code: "ENOENT" });
      }
      callback();
    } catch (error) {
      callback(error);
    }
  }

  get(sessionId: string, callback: (error: unknown, session?: Fastify.Session | null) => void) {
    try {
      this.sessions.deleteExpired(new Date().toISOString());
      const row = this.sessions.getById(sessionId);
      if (!row) {
        callback(null, null);
        return;
      }

      const expires = new Date(row.expires_at);
      if (Number.isNaN(expires.valueOf()) || expires.valueOf() <= Date.now()) {
        this.sessions.deleteById(sessionId);
        callback(null, null);
        return;
      }

      callback(null, {
        userId: row.owner_id,
        __fastifySessionMetadata: { generation: row.generation ?? row.id },
        ...(row.refresh_token ? { refreshToken: row.refresh_token } : {}),
        ...(row.access_token_expires_at ? { accessTokenExpiresAt: row.access_token_expires_at } : {}),
        cookie: {
          ...this.cookieOptions,
          expires,
          originalMaxAge: Math.max(expires.valueOf() - Date.now(), 0),
          maxAge: Math.max(expires.valueOf() - Date.now(), 0)
        }
      } as Fastify.Session);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sessionId: string, callback: (error?: unknown) => void) {
    try {
      this.sessions.deleteById(sessionId);
      callback();
    } catch (error) {
      callback(error);
    }
  }

  private toRow(sessionId: string, session: StoredSession): SessionRow {
    const ownerId = session.userId ?? null;
    if (!ownerId) {
      throw new Error("Cannot persist a session without a userId.");
    }
    const expiresAt = session.cookie?.expires instanceof Date
      ? session.cookie.expires
      : typeof session.cookie?.originalMaxAge === "number"
        ? new Date(Date.now() + session.cookie.originalMaxAge)
        : null;
    if (!expiresAt) {
      throw new Error("Cannot persist a session without an expiry.");
    }

    const now = new Date().toISOString();
    return {
      id: sessionId,
      owner_id: ownerId,
      created_at: this.sessions.getById(sessionId)?.created_at ?? now,
      updated_at: now,
      refresh_token: session.refreshToken ?? null,
      access_token_expires_at: session.accessTokenExpiresAt ?? null,
      generation: session.__fastifySessionMetadata?.generation ?? sessionId,
      expires_at: expiresAt.toISOString()
    };
  }
}
