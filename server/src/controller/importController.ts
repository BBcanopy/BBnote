import type { MultipartFile, MultipartValue } from "@fastify/multipart";
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

export function registerImportController(app: FastifyInstance, services: AppServices) {
  const guard = authenticate(services);

  app.post("/api/v1/imports", {
    preHandler: guard,
    schema: {
      tags: ["Imports"],
      summary: "Create an import job",
      security: sessionCookieSecurity,
      consumes: ["multipart/form-data"],
      body: {
        type: "object",
        required: ["source", "file"],
        properties: {
          source: {
            type: "object",
            required: ["value"],
            properties: {
              value: {
                type: "string",
                enum: ["onenote", "synology_note_station"]
              }
            }
          },
          file: { isFile: true }
        }
      },
      response: {
        202: passthroughObjectSchema,
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const { file, source } = request.body as {
      file?: MultipartFile;
      source?: MultipartValue<string>;
    };
    if (!file) {
      return reply.code(400).send({ message: "Import archive is required." });
    }
    const sourceValue = z.enum(["onenote", "synology_note_station"]).parse(source?.value);
    const job = await services.importService.createImportJob({
      ownerId: request.auth!.ownerId,
      source: sourceValue,
      fileName: file.filename,
      buffer: await file.toBuffer()
    });
    return reply.code(202).send(services.importService.getImportJob(request.auth!.ownerId, job.id));
  });

  app.get("/api/v1/imports/:id", {
    preHandler: guard,
    schema: {
      tags: ["Imports"],
      summary: "Get an import job",
      security: sessionCookieSecurity,
      params: createUuidParamsSchema("id", "Import job identifier")
    }
  }, async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    return services.importService.getImportJob(request.auth!.ownerId, params.id);
  });
}
