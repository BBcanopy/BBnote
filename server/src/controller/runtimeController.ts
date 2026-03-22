import type { FastifyInstance } from "fastify";
import type { AppServices } from "../service/serviceFactory.js";

export function registerRuntimeController(app: FastifyInstance, services: AppServices) {
  app.get("/api/v1/runtime-config", async () => ({
    appBaseUrl: services.config.appBaseUrl,
    oidcIssuerUrl: services.config.oidcIssuerUrl,
    oidcClientIdWeb: services.config.oidcClientIdWeb,
    oidcScopes: services.config.oidcScopes,
    mockOidcEnabled: services.config.mockOidcEnabled
  }));
}

