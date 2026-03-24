import "fastify";
import type { AppServices } from "./serviceFactory.js";
import type { AuthenticatedUser } from "./models.js";
import type { OidcOAuth2NamespaceLike } from "./oidcTesting.js";

declare module "fastify" {
  interface FastifyInstance {
    bbnote: AppServices;
    oidc: OidcOAuth2NamespaceLike;
  }

  interface FastifyRequest {
    auth: AuthenticatedUser | null;
  }

  interface Session {
    userId?: string;
  }
}
