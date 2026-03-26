import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createUuidParamsSchema, errorMessageSchema, sessionCookieSecurity } from "./openapi.js";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";
import { folderIconValues } from "../service/models.js";

const folderBodySchema = z.object({
  name: z.string().min(1),
  icon: z.enum(folderIconValues).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional()
});

export function registerFolderController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.get("/api/v1/folders", {
    preHandler: guard,
    schema: {
      tags: ["Notebooks"],
      summary: "List notebooks",
      security: sessionCookieSecurity
    }
  }, async (request) => {
    return services.folderService.list(request.auth!.ownerId);
  });

  app.post("/api/v1/folders", {
    preHandler: guard,
    schema: {
      tags: ["Notebooks"],
      summary: "Create a notebook",
      security: sessionCookieSecurity,
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          icon: { type: "string", enum: [...folderIconValues] },
          parentId: { type: "string", format: "uuid", nullable: true }
        }
      }
    }
  }, async (request, reply) => {
    const body = folderBodySchema.parse(request.body);
    const folder = await services.folderService.createFolder(request.auth!.ownerId, {
      name: body.name,
      icon: body.icon,
      parentId: body.parentId ?? null
    });
    return reply.code(201).send(folder);
  });

  app.patch("/api/v1/folders/:id", {
    preHandler: guard,
    schema: {
      tags: ["Notebooks"],
      summary: "Update a notebook or move it in the tree",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Notebook identifier"),
      body: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          icon: { type: "string", enum: [...folderIconValues] },
          parentId: { type: "string", format: "uuid", nullable: true },
          sortOrder: { type: "integer", minimum: 0 }
        }
      },
      response: {
        400: errorMessageSchema
      }
    }
  }, async (request) => {
    const body = folderBodySchema.parse(request.body);
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.folderService.updateFolder(request.auth!.ownerId, params.id, {
      name: body.name,
      icon: body.icon,
      parentId: body.parentId ?? null,
      sortOrder: body.sortOrder
    });
  });

  app.delete("/api/v1/folders/:id", {
    preHandler: guard,
    schema: {
      tags: ["Notebooks"],
      summary: "Delete an empty notebook",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Notebook identifier")
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.folderService.deleteFolder(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}
