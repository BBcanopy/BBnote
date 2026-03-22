import "fastify";
import type { AppServices } from "./serviceFactory.js";
import type { AuthenticatedUser } from "./models.js";

declare module "fastify" {
  interface FastifyInstance {
    bbnote: AppServices;
  }

  interface FastifyRequest {
    auth: AuthenticatedUser | null;
  }
}

