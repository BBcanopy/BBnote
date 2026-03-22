import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

const folderBodySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().uuid().nullable().optional()
});

export function registerFolderController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.get("/api/v1/folders", { preHandler: guard }, async (request) => {
    return services.folderService.list(request.auth!.ownerId);
  });

  app.post("/api/v1/folders", { preHandler: guard }, async (request, reply) => {
    const body = folderBodySchema.parse(request.body);
    const folder = await services.folderService.createFolder(request.auth!.ownerId, {
      name: body.name,
      parentId: body.parentId ?? null
    });
    return reply.code(201).send(folder);
  });

  app.patch("/api/v1/folders/:id", { preHandler: guard }, async (request) => {
    const body = folderBodySchema.parse(request.body);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.folderService.updateFolder(request.auth!.ownerId, params.id, {
      name: body.name,
      parentId: body.parentId ?? null
    });
  });

  app.delete("/api/v1/folders/:id", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.folderService.deleteFolder(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}

