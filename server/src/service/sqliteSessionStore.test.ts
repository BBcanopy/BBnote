import cookie from "@fastify/cookie";
import session from "@fastify/session";
import Database from "better-sqlite3";
import Fastify, { type FastifyInstance, type FastifyRequest, type Session } from "fastify";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrate.js";
import { SessionDb } from "../db/sessionDb.js";
import { SqliteSessionStore } from "./sqliteSessionStore.js";

describe("SqliteSessionStore", () => {
  let connection: Database.Database;
  let sessions: SessionDb;
  let store: SqliteSessionStore;
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    connection = new Database(":memory:");
    connection.pragma("foreign_keys = ON");
    runMigrations(connection);
    connection.prepare(`
      insert into users (id, issuer, subject, created_at, updated_at)
      values ('user-1', 'issuer', 'subject', '2026-01-01', '2026-01-01')
    `).run();
    sessions = new SessionDb(connection);
    store = new SqliteSessionStore(sessions, {
      path: "/", httpOnly: true, sameSite: "lax", secure: false
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    connection.close();
  });

  function storedSession(generation = "generation-1") {
    return {
      userId: "user-1",
      refreshToken: "refresh-1",
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      __fastifySessionMetadata: { generation },
      cookie: { expires: new Date(Date.now() + 3600_000) }
    } as unknown as Session;
  }

  it("round-trips generation metadata and updates tokens for the current generation", async () => {
    const value = storedSession();
    await promisify(store.set.bind(store))("store-id", value);
    const loaded = await promisify(store.get.bind(store))("store-id");
    expect(loaded).toMatchObject({
      userId: "user-1", refreshToken: "refresh-1",
      __fastifySessionMetadata: { generation: "generation-1" }
    });
    const createdAt = sessions.getById("store-id")!.created_at;
    value.refreshToken = "refresh-2";
    await promisify(store.compareAndSet.bind(store))("store-id", "generation-1", value);
    expect(sessions.getById("store-id")).toMatchObject({
      refresh_token: "refresh-2", generation: "generation-1", created_at: createdAt
    });
  });

  it("rejects stale writes after another store regenerates the session", async () => {
    await promisify(store.set.bind(store))("store-id", storedSession());
    const otherStore = new SqliteSessionStore(sessions, {
      path: "/", httpOnly: true, sameSite: "lax", secure: false
    });
    await promisify(otherStore.compareAndSet.bind(otherStore))(
      "store-id", "generation-1", storedSession("generation-2")
    );
    await expect(promisify(store.compareAndSet.bind(store))(
      "store-id", "generation-1", storedSession()
    )).rejects.toMatchObject({ code: "ENOENT" });
    expect(sessions.getById("store-id")?.generation).toBe("generation-2");
  });

  it.each(["missing", "destroyed", "expired"])("does not recreate a %s session", async (state) => {
    if (state !== "missing") {
      await promisify(store.set.bind(store))("store-id", storedSession());
      if (state === "destroyed") {
        await promisify(store.destroy.bind(store))("store-id");
      } else {
        connection.prepare("update sessions set expires_at = '2020-01-01'").run();
      }
    }
    await expect(promisify(store.compareAndSet.bind(store))(
      "store-id", "generation-1", storedSession()
    )).rejects.toMatchObject({ code: "ENOENT" });
    expect(await promisify(store.get.bind(store))("store-id")).toBeNull();
  });

  it("restores legacy sessions using their store ID and allows generation rotation", async () => {
    await promisify(store.set.bind(store))("legacy-id", storedSession());
    connection.prepare("update sessions set generation = null").run();
    expect(await promisify(store.get.bind(store))("legacy-id")).toMatchObject({
      userId: "user-1", __fastifySessionMetadata: { generation: "legacy-id" }
    });
    await promisify(store.compareAndSet.bind(store))(
      "legacy-id", "legacy-id", storedSession("rotated-id")
    );
    expect(sessions.getById("legacy-id")?.generation).toBe("rotated-id");
  });

  it("prevents captured requests from saving after cookie rotation or logout", async () => {
    app = Fastify();
    app.register(cookie);
    app.register(session, {
      secret: "bbnote-test-session-secret-0123456789",
      cookie: { secure: false, maxAge: 3600_000 },
      store, saveUninitialized: false, rolling: false
    });
    let captured: FastifyRequest["session"];
    app.post("/login", async (request) => {
      request.session.userId = "user-1";
      await request.session.regenerate(["userId"]);
      return {};
    });
    app.get("/capture", async (request) => {
      captured = request.session;
      return { userId: request.session.userId ?? null };
    });
    app.post("/rotate", async (request) => {
      await request.session.regenerate(["userId"]);
      return {};
    });
    app.post("/logout", async (request) => {
      await request.session.destroy();
      return {};
    });

    const login = await app.inject({ method: "POST", url: "/login" });
    expect(login.statusCode).toBe(200);
    const oldCookie = login.cookies[0].value;
    await app.inject({ url: "/capture", cookies: { sessionId: oldCookie } });
    const stale = captured!;
    const rotation = await app.inject({ method: "POST", url: "/rotate", cookies: { sessionId: oldCookie } });
    expect(rotation.statusCode).toBe(200);
    const newCookie = rotation.cookies[0].value;
    expect(newCookie).not.toBe(oldCookie);
    stale.refreshToken = "stale-token";
    await expect(stale.save()).rejects.toMatchObject({ code: "ENOENT" });
    expect((await app.inject({ url: "/capture", cookies: { sessionId: oldCookie } })).json()).toEqual({ userId: null });
    expect((await app.inject({ url: "/capture", cookies: { sessionId: newCookie } })).json()).toEqual({ userId: "user-1" });
    const beforeLogout = captured!;
    const logout = await app.inject({ method: "POST", url: "/logout", cookies: { sessionId: newCookie } });
    expect(logout.statusCode).toBe(200);
    await expect(beforeLogout.save()).rejects.toMatchObject({ code: "ENOENT" });
    expect(connection.prepare("select * from sessions").all()).toEqual([]);
    expect((await app.inject({ url: "/capture", cookies: { sessionId: newCookie } })).json()).toEqual({ userId: null });
  });
});
