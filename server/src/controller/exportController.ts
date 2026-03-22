import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

export function registerExportController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.post("/api/v1/exports", { preHandler: guard }, async (request, reply) => {
    const job = await services.exportService.createExportJob(request.auth!.ownerId);
    return reply.code(202).send(services.exportService.getExportJob(request.auth!.ownerId, job.id));
  });

  app.get("/api/v1/exports/:id", { preHandler: guard }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.exportService.getExportJob(request.auth!.ownerId, params.id);
  });

  app.get("/api/v1/exports/:id/download", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const download = await services.exportService.getExportDownload(request.auth!.ownerId, params.id);
    return reply
      .header("Content-Disposition", `attachment; filename=\"${download.fileName}\"`)
      .type("application/zip")
      .send(fs.createReadStream(download.filePath));
  });
}
