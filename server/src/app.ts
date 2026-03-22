import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { registerAttachmentController } from "./controller/attachmentController.js";
import { registerAuthController } from "./controller/authController.js";
import { registerExportController } from "./controller/exportController.js";
import { registerFolderController } from "./controller/folderController.js";
import { registerHealthController } from "./controller/healthController.js";
import { registerImportController } from "./controller/importController.js";
import { registerMockOidcController } from "./controller/mockOidcController.js";
import { registerNoteController } from "./controller/noteController.js";
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
  app.register(multipart);

  registerHealthController(app);
  registerAuthController(app, services);
  registerFolderController(app, services);
  registerNoteController(app, services);
  registerAttachmentController(app, services);
  registerImportController(app, services);
  registerExportController(app, services);
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
