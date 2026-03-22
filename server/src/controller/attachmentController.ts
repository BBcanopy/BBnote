import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "./authenticate.js";
import type { AppServices } from "../service/serviceFactory.js";

export function registerAttachmentController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.post("/api/v1/notes/:id/attachments", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ message: "No attachment uploaded." });
    }
    const uploaded = await services.attachmentService.createAttachment({
      ownerId: request.auth!.ownerId,
      noteId: params.id,
      originalName: file.filename,
      mimeType: file.mimetype,
      content: await file.toBuffer()
    });
    return reply.code(201).send(uploaded);
  });

  app.get("/api/v1/attachments/:id", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const attachment = services.attachmentService.getAttachment(request.auth!.ownerId, params.id);
    return reply.type(attachment.mimeType).send(fs.createReadStream(attachment.storedPath));
  });

  app.delete("/api/v1/attachments/:id", { preHandler: guard }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.attachmentService.deleteAttachment(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}
