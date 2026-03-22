import formbody from "@fastify/formbody";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppServices } from "../service/serviceFactory.js";

const authorizeQuerySchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  scope: z.string().min(1),
  state: z.string().min(1),
  nonce: z.string().optional(),
  code_challenge: z.string().min(1),
  code_challenge_method: z.literal("S256")
});

const authorizePostSchema = authorizeQuerySchema.extend({
  name: z.string().min(1),
  email: z.string().email()
});

const tokenBodySchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1),
  code_verifier: z.string().min(1)
});

export async function registerMockOidcController(app: FastifyInstance, services: AppServices) {
  if (!services.mockOidcService) {
    return;
  }

  await app.register(formbody);

  app.get("/mock-oidc/.well-known/openid-configuration", async () => services.mockOidcService!.discoveryDocument());
  app.get("/mock-oidc/jwks", async () => services.mockOidcService!.jwks());
  app.get("/mock-oidc/authorize", async (request, reply) => {
    const query = authorizeQuerySchema.parse(request.query);
    return reply.type("text/html").send(services.mockOidcService!.renderAuthorizePage(query));
  });
  app.post("/mock-oidc/authorize", async (request, reply) => {
    const body = authorizePostSchema.parse(request.body);
    const redirectUrl = services.mockOidcService!.createAuthorizationRedirect({
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      codeChallenge: body.code_challenge,
      codeChallengeMethod: body.code_challenge_method,
      scope: body.scope,
      nonce: body.nonce,
      state: body.state,
      name: body.name,
      email: body.email
    });
    return reply.redirect(redirectUrl);
  });
  app.post("/mock-oidc/token", async (request, reply) => {
    const body = tokenBodySchema.parse(request.body);
    const tokens = await services.mockOidcService!.exchangeAuthorizationCode({
      code: body.code,
      clientId: body.client_id,
      redirectUri: body.redirect_uri,
      codeVerifier: body.code_verifier
    });
    return reply.send(tokens);
  });
}
