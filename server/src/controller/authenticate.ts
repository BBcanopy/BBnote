import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppServices } from "../service/serviceFactory.js";

export function authenticate(services: AppServices) {
  return async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
    try {
      request.auth = await services.authService.authenticateRequest(request);
    } catch (error) {
      request.log.warn(error);
      await reply.code(401).send({
        message: "Authentication required."
      });
    }
  };
}
