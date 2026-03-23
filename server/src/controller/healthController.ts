import type { FastifyInstance } from "fastify";

export function registerHealthController(app: FastifyInstance) {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["Public"],
        summary: "Health check",
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" }
            }
          }
        }
      }
    },
    async () => ({
      ok: true
    })
  );
}
