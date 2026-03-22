import cors from "@fastify/cors";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { registerHealthController } from "./controller/healthController.js";
import { buildConfig } from "./service/configService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildApp() {
  const config = buildConfig();
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true
  });

  registerHealthController(app);

  const webDist = path.resolve(__dirname, "../../web/dist");
  app.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    wildcard: false
  });

  app.get("/api/v1/runtime-config", async () => ({
    appBaseUrl: config.appBaseUrl,
    oidcIssuerUrl: config.oidcIssuerUrl,
    oidcClientIdWeb: config.oidcClientIdWeb,
    oidcScopes: config.oidcScopes,
    mockOidcEnabled: config.mockOidcEnabled
  }));

  return app;
}
