import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createUuidParamsSchema,
  errorMessageSchema,
  passthroughObjectSchema,
  sessionCookieSecurity
} from "./openapi.js";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

const noteBodySchema = z.object({
  folderId: z.string().uuid(),
  title: z.string().trim(),
  bodyMarkdown: z.string()
});

const noteListQuerySchema = z.object({
  q: z.string().optional(),
  folderId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.enum(["updatedAt", "createdAt", "title", "priority"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
});

const noteReorderBodySchema = z.object({
  folderId: z.string().uuid(),
  orderedNoteIds: z.array(z.string().uuid()).min(1)
});

const noteMoveBodySchema = z.object({
  folderId: z.string().uuid()
});

export function registerNoteController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.get("/api/v1/notes", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "List or search notes",
      security: sessionCookieSecurity,
      querystring: {
        type: "object",
        properties: {
          q: { type: "string" },
          folderId: { type: "string", format: "uuid" },
          cursor: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
          sort: { type: "string", enum: ["updatedAt", "createdAt", "title", "priority"] },
          order: { type: "string", enum: ["asc", "desc"] }
        }
      }
    }
  }, async (request) => {
    const query = noteListQuerySchema.parse(request.query);
    return services.noteService.listNotes({
      ownerId: request.auth!.ownerId,
      folderId: query.folderId,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
      sort: query.sort,
      order: query.order
    });
  });

  app.patch("/api/v1/notes/reorder", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Reorder notes within a notebook",
      security: sessionCookieSecurity,
      body: {
        type: "object",
        required: ["folderId", "orderedNoteIds"],
        properties: {
          folderId: { type: "string", format: "uuid" },
          orderedNoteIds: {
            type: "array",
            minItems: 1,
            items: { type: "string", format: "uuid" }
          }
        }
      },
      response: {
        204: { type: "null" },
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const parsedBody = noteReorderBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    try {
      await services.noteService.reorderNotes({
        ownerId: request.auth!.ownerId,
        folderId: parsedBody.data.folderId,
        orderedNoteIds: parsedBody.data.orderedNoteIds
      });
    } catch (error) {
      return reply.code(400).send({ message: String(error instanceof Error ? error.message : error) });
    }

    return reply.code(204).send();
  });

  app.post("/api/v1/notes", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Create a note",
      security: sessionCookieSecurity,
      body: {
        type: "object",
        required: ["folderId", "title", "bodyMarkdown"],
        properties: {
          folderId: { type: "string", format: "uuid" },
          title: { type: "string" },
          bodyMarkdown: { type: "string" }
        }
      },
      response: {
        201: passthroughObjectSchema,
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const parsedBody = noteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }
    const body = parsedBody.data;
    const note = await services.noteService.createNote({
      ownerId: request.auth!.ownerId,
      folderId: body.folderId,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown
    });
    return reply.code(201).send(note);
  });

  app.get("/api/v1/notes/:id", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Get a note",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Note identifier")
    }
  }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.noteService.getNote(request.auth!.ownerId, params.id);
  });

  app.put("/api/v1/notes/:id", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Update a note",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Note identifier"),
      body: {
        type: "object",
        required: ["folderId", "title", "bodyMarkdown"],
        properties: {
          folderId: { type: "string", format: "uuid" },
          title: { type: "string" },
          bodyMarkdown: { type: "string" }
        }
      },
      response: {
        200: passthroughObjectSchema,
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsedBody = noteBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }
    const body = parsedBody.data;
    return services.noteService.updateNote({
      ownerId: request.auth!.ownerId,
      noteId: params.id,
      folderId: body.folderId,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown
    });
  });

  app.patch("/api/v1/notes/:id/move", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Move a note to another notebook",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Note identifier"),
      body: {
        type: "object",
        required: ["folderId"],
        properties: {
          folderId: { type: "string", format: "uuid" }
        }
      },
      response: {
        200: passthroughObjectSchema,
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const parsedBody = noteMoveBodySchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ message: parsedBody.error.message });
    }

    return services.noteService.moveNote({
      ownerId: request.auth!.ownerId,
      noteId: params.id,
      folderId: parsedBody.data.folderId
    });
  });

  app.delete("/api/v1/notes/:id", {
    preHandler: guard,
    schema: {
      tags: ["Notes"],
      summary: "Delete a note",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Note identifier")
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.noteService.deleteNote(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}
