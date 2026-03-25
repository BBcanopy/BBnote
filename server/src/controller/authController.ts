import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errorMessageSchema, sessionCookieSecurity } from "./openapi.js";
import { SESSION_COOKIE_NAME } from "../service/authConstants.js";
import type { AppServices } from "../service/serviceFactory.js";
import { userThemeValues } from "../service/models.js";

const loginQuerySchema = z.object({
  returnTo: z.string().optional()
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

const updateThemeBodySchema = z.object({
  theme: z.enum(userThemeValues)
});

const sessionUserSchema = {
  type: "object",
  required: ["email", "name", "theme"],
  properties: {
    email: { type: ["string", "null"] },
    name: { type: ["string", "null"] },
    theme: {
      type: "string",
      enum: [...userThemeValues]
    }
  }
} as const;

const authSessionSchema = {
  type: "object",
  required: ["authenticated", "user"],
  properties: {
    authenticated: { type: "boolean" },
    user: {
      anyOf: [
        sessionUserSchema,
        { type: "null" }
      ]
    }
  }
} as const;

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
    const redirectUrl = await services.authService.startLogin(request, reply, query.returnTo);
    return reply.redirect(redirectUrl);
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
      const result = await services.authService.completeLogin(request, reply, query);
      return reply.redirect(result.redirectTo);
    } catch (error) {
      await services.authService.failLogin(request, reply);
      return reply
        .code(400)
        .type("text/html")
        .send(renderAuthError(String(error)));
    }
  });

  app.get("/api/v1/auth/session", {
    schema: {
      tags: ["Public"],
      summary: "Get the current session state",
      response: {
        200: authSessionSchema
      }
    }
  }, async (request) => {
    return services.authService.getSessionState(request);
  });

  app.patch("/api/v1/auth/theme", {
    schema: {
      tags: ["Public"],
      summary: "Update the current user's theme",
      security: sessionCookieSecurity,
      body: {
        type: "object",
        required: ["theme"],
        properties: {
          theme: {
            type: "string",
            enum: [...userThemeValues]
          }
        }
      },
      response: {
        200: authSessionSchema,
        401: errorMessageSchema
      }
    }
  }, async (request, reply) => {
    const body = updateThemeBodySchema.parse(request.body);

    try {
      return await services.authService.updateTheme(request, body.theme);
    } catch {
      return reply.code(401).send({ message: "Authentication required." });
    }
  });

  app.post("/api/v1/auth/logout", {
    schema: {
      tags: ["Public"],
      summary: "Clear the current session"
    }
  }, async (request, reply) => {
    await services.authService.logout(request, reply);
    return reply.code(204).send();
  });
}

function renderAuthError(message: string) {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <title>BBNote sign-in error</title>
        <style>
          :root { color: #102022; font-family: "Open Sans", "Segoe UI Variable Display", "Segoe UI", sans-serif; }
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100dvh; background:
            radial-gradient(circle at 14% 8%, rgba(47,119,116,0.16), transparent 22%),
            radial-gradient(circle at 86% 0%, rgba(255,255,255,0.78), transparent 26%),
            linear-gradient(180deg, #f8fbfb 0%, #eff4f3 100%);
          }
          body::before { content: ""; position: fixed; inset: 0; pointer-events: none; background:
            linear-gradient(140deg, rgba(255,255,255,0.28), transparent 38%),
            radial-gradient(circle at 72% 58%, rgba(47,119,116,0.08), transparent 24%);
          }
          body::after { content: ""; position: fixed; inset: 1.1rem; border: 1px solid rgba(255,255,255,0.38); border-radius: 2rem; opacity: 0.65; pointer-events: none; }
          main { position: relative; z-index: 1; min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
          section { width: min(560px, 100%); padding: 32px; border: 1px solid rgba(16,32,34,0.1); border-radius: 2rem; background: rgba(255,255,255,0.78); box-shadow: inset 0 1px 0 rgba(255,255,255,0.42), 0 20px 44px -30px rgba(18,34,36,0.28); backdrop-filter: blur(18px); }
          h1 { margin: 0 0 12px; font-size: clamp(2rem, 6vw, 2.8rem); line-height: 0.94; letter-spacing: -0.05em; }
          p { margin: 0 0 12px; color: #5e6e70; line-height: 1.6; }
          .eyebrow { color: #235e5b; font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase; }
          code { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 999px; background: rgba(159,61,51,0.08); color: #9f3d33; font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace; }
          a { color: #235e5b; text-decoration: none; font-weight: 600; }
        </style>
      </head>
      <body>
        <main>
          <section>
            <p class="eyebrow">Authentication</p>
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
