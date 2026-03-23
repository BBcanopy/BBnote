import type * as Fastify from "fastify";
import type { SessionDb } from "../db/sessionDb.js";

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

  set(sessionId: string, session: Fastify.Session, callback: (error?: unknown) => void) {
    try {
      const ownerId = typeof (session as { userId?: unknown }).userId === "string" ? (session as { userId: string }).userId : null;
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

      const existing = this.sessions.getById(sessionId);
      const now = new Date().toISOString();
      this.sessions.upsert({
        id: sessionId,
        owner_id: ownerId,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        expires_at: expiresAt.toISOString()
      });
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
}
