import "fastify";
import type { OAuth2Namespace } from "@fastify/oauth2";
import type { AppServices } from "./serviceFactory.js";
import type { AuthenticatedUser } from "./models.js";

declare module "fastify" {
  interface FastifyInstance {
    bbnote: AppServices;
    oidc: OAuth2Namespace;
  }

  interface FastifyRequest {
    auth: AuthenticatedUser | null;
  }

  interface Session {
    userId?: string;
  }
}
