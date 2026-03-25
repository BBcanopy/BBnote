import type { MultipartFile } from "@fastify/multipart";
import fs from "node:fs";
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

export function registerAttachmentController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);
  const uploadLimitText = formatByteLimit(services.config.attachmentMaxBytes);

  app.post("/api/v1/notes/:id/attachments", {
    preHandler: guard,
    schema: {
      tags: ["Attachments"],
      summary: "Upload an attachment",
      security: sessionCookieSecurity,
      consumes: ["multipart/form-data"],
      params: createUuidParamsSchema("id", "Note identifier"),
      body: {
        type: "object",
        required: ["file"],
        properties: {
          file: {
            isFile: true
          }
        }
      },
      response: {
        201: passthroughObjectSchema,
        400: errorMessageSchema,
        413: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const { file } = request.body as { file?: MultipartFile };
    if (!file) {
      return reply.code(400).send({ message: "No attachment uploaded." });
    }
    const content = await file.toBuffer();
    if (content.length > services.config.attachmentMaxBytes) {
      return reply.code(413).send({
        message: `Attachments larger than ${uploadLimitText} are not supported.`
      });
    }
    const uploaded = await services.attachmentService.createAttachment({
      ownerId: request.auth!.ownerId,
      noteId: params.id,
      originalName: file.filename,
      mimeType: file.mimetype,
      content
    });
    return reply.code(201).send(uploaded);
  });

  app.get("/api/v1/attachments/:id", {
    preHandler: guard,
    schema: {
      tags: ["Attachments"],
      summary: "Download an attachment",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Attachment identifier")
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const attachment = services.attachmentService.getAttachment(request.auth!.ownerId, params.id);
    return reply.type(attachment.mimeType).send(fs.createReadStream(attachment.storedPath));
  });

  app.delete("/api/v1/attachments/:id", {
    preHandler: guard,
    schema: {
      tags: ["Attachments"],
      summary: "Delete an attachment",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Attachment identifier")
    }
  }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    await services.attachmentService.deleteAttachment(request.auth!.ownerId, params.id);
    return reply.code(204).send();
  });
}

function formatByteLimit(sizeBytes: number) {
  const mebibyte = 1024 * 1024;
  const kibibyte = 1024;

  if (sizeBytes % mebibyte === 0) {
    return `${sizeBytes / mebibyte} MiB`;
  }

  if (sizeBytes % kibibyte === 0) {
    return `${sizeBytes / kibibyte} KiB`;
  }

  return `${sizeBytes} bytes`;
}
