import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

const noteBodySchema = z.object({
  folderId: z.string().uuid().optional(),
  title: z.string().min(1),
  bodyMarkdown: z.string()
});

const noteListQuerySchema = z.object({
  q: z.string().optional(),
  folderId: z.string().uuid().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sort: z.enum(["updatedAt", "createdAt", "title"]).optional(),
  order: z.enum(["asc", "desc"]).optional()
});

export function registerNoteController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.get("/api/v1/notes", { preHandler: guard }, async (request) => {
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

  app.post("/api/v1/notes", { preHandler: guard }, async (request, reply) => {
    const body = noteBodySchema.parse(request.body);
    const note = await services.noteService.createNote({
      ownerId: request.auth!.ownerId,
      folderId: body.folderId,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown
    });
    return reply.code(201).send(note);
  });

  app.get("/api/v1/notes/:id", { preHandler: guard }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.noteService.getNote(request.auth!.ownerId, params.id);
  });

  app.put("/api/v1/notes/:id", { preHandler: guard }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = noteBodySchema.parse(request.body);
    return services.noteService.updateNote({
      ownerId: request.auth!.ownerId,
      noteId: params.id,
      folderId: body.folderId,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown
    });
  });

  app.delete("/api/v1/notes/:id", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.noteService.deleteNote(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}

