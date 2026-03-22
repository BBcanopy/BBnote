import cors from "@fastify/cors";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { registerFolderController } from "./controller/folderController.js";
import { registerHealthController } from "./controller/healthController.js";
import { registerMockOidcController } from "./controller/mockOidcController.js";
import { registerNoteController } from "./controller/noteController.js";
import { registerRuntimeController } from "./controller/runtimeController.js";
import { buildConfig } from "./service/configService.js";
import { createServices } from "./service/serviceFactory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const config = buildConfig();
  const app = Fastify({ logger: true });
  const services = await createServices(config, app);
  app.decorate("bbnote", services);
  app.decorateRequest("auth", null);

  app.register(cors, {
    origin: true
  });

  registerHealthController(app);
  registerRuntimeController(app, services);
  registerFolderController(app, services);
  registerNoteController(app, services);
  await registerMockOidcController(app, services);

  const webDist = path.resolve(__dirname, "../../web/dist");
  app.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
    wildcard: false
  });

  app.get("/*", async (_request, reply) => {
    return reply.sendFile("index.html");
  });

  return app;
}
