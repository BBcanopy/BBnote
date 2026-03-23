import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorMessageSchema } from "./openapi.js";
import { AUTH_FLOW_COOKIE_NAME, SESSION_COOKIE_NAME } from "../service/cookieService.js";
import type { AppServices } from "../service/serviceFactory.js";

const loginQuerySchema = z.object({
  returnTo: z.string().optional()
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

export function registerAuthController(app: FastifyInstance, services: AppServices) {
  app.get("/api/v1/auth/login", {
    schema: {
      tags: ["Public"],
      summary: "Start the OIDC login flow",
      querystring: {
        type: "object",
        properties: {
          returnTo: { type: "string" }
        }
      }
    }
  }, async (request, reply) => {
    const query = loginQuerySchema.parse(request.query);
    const { redirectUrl, flowCookie } = await services.authService.startLogin(query.returnTo);

    return reply.header("Set-Cookie", flowCookie).redirect(redirectUrl);
  });

  app.get("/auth/callback", {
    schema: {
      tags: ["Public"],
      summary: "Complete the OIDC login flow",
      querystring: {
        type: "object",
        properties: {
          code: { type: "string" },
          state: { type: "string" },
          error: { type: "string" },
          error_description: { type: "string" }
        }
      },
      response: {
        400: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);

    try {
      const result = await services.authService.completeLogin(request, query);
      return reply
        .header("Set-Cookie", [result.flowCookie, result.sessionCookie])
        .redirect(result.redirectTo);
    } catch (error) {
      return reply
        .code(400)
        .header("Set-Cookie", [services.cookieService.clearCookie(AUTH_FLOW_COOKIE_NAME), services.cookieService.clearCookie(SESSION_COOKIE_NAME)])
        .type("text/html")
        .send(renderAuthError(String(error)));
    }
  });

  app.get("/api/v1/auth/session", {
    schema: {
      tags: ["Public"],
      summary: "Get the current session state"
    }
  }, async (request) => {
    return services.authService.getSessionState(request);
  });

  app.post("/api/v1/auth/logout", {
    schema: {
      tags: ["Public"],
      summary: "Clear the current session"
    }
  }, async (request, reply) => {
    const clearCookie = await services.authService.logout(request);
    return reply.header("Set-Cookie", clearCookie).code(204).send();
  });
}

function renderAuthError(message: string) {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>BBNote sign-in error</title>
        <style>
          body { font-family: "Geist Sans", system-ui, sans-serif; background: #f3f5f6; color: #0f172a; margin: 0; }
          main { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
          section { width: min(560px, 100%); background: rgba(255,255,255,0.92); border: 1px solid rgba(248,113,113,0.28); border-radius: 32px; padding: 32px; box-shadow: 0 20px 40px -24px rgba(15,23,42,0.2); }
          h1 { margin: 0 0 12px; font-size: 28px; }
          p { color: #475569; line-height: 1.6; }
          code { color: #b91c1c; }
          a { color: #0f766e; }
        </style>
      </head>
      <body>
        <main>
          <section>
            <p>Authentication</p>
            <h1>Sign-in could not be completed</h1>
            <p><code>${escapeHtml(message)}</code></p>
            <p><a href="/">Return to BBNote</a></p>
          </section>
        </main>
      </body>
    </html>`;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
