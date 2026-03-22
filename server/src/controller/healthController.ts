import type { FastifyInstance } from "fastify";

export function registerHealthController(app: FastifyInstance) {
  app.get("/healthz", async () => ({
    ok: true
  }));
}

