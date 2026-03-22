import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

export function registerImportController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.post("/api/v1/imports", { preHandler: guard }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "Import archive is required." });
    }
    const sourceField = Array.isArray(file.fields.source) ? file.fields.source[0] : file.fields.source;
    const sourceValue =
      sourceField && typeof sourceField === "object" && "value" in sourceField ? sourceField.value : undefined;
    const source = z.enum(["onenote", "synology_note_station"]).parse(sourceValue);
    const job = await services.importService.createImportJob({
      ownerId: request.auth!.ownerId,
      source,
      fileName: file.filename,
      buffer: await file.toBuffer()
    });
    return reply.code(202).send(services.importService.getImportJob(request.auth!.ownerId, job.id));
  });

  app.get("/api/v1/imports/:id", { preHandler: guard }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.importService.getImportJob(request.auth!.ownerId, params.id);
  });
}
