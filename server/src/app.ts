import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import oauth2 from "@fastify/oauth2";
import session from "@fastify/session";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import { registerAttachmentController } from "./controller/attachmentController.js";
import { registerAuthController } from "./controller/authController.js";
import { registerExportController } from "./controller/exportController.js";
import { registerFolderController } from "./controller/folderController.js";
import { registerHealthController } from "./controller/healthController.js";
import { registerImportController } from "./controller/importController.js";
import { registerMockOidcController } from "./controller/mockOidcController.js";
import { registerNoteController } from "./controller/noteController.js";
import { OIDC_STATE_COOKIE_NAME, OIDC_VERIFIER_COOKIE_NAME, SESSION_COOKIE_NAME, authCookieOptions } from "./service/authConstants.js";
import { buildConfig } from "./service/configService.js";
import { createServices } from "./service/serviceFactory.js";
import { SqliteSessionStore } from "./service/sqliteSessionStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const config = buildConfig();
  const app = Fastify({
    logger: true,
    ajv: {
      plugins: [
        (ajv) => {
          multipart.ajvFilePlugin(ajv);
          return ajv;
        }
      ]
    }
  });
  const services = await createServices(config, app);
  app.decorate("bbnote", services);
  app.decorateRequest("auth", null);
  const secureCookies = config.appBaseUrl.startsWith("https://");
  const baseCookieOptions = authCookieOptions(secureCookies);

  app.register(cookie);
  app.register(session, {
    secret: config.sessionSecret,
    cookieName: SESSION_COOKIE_NAME,
    cookie: baseCookieOptions,
    store: new SqliteSessionStore(services.sessionDb, baseCookieOptions),
    saveUninitialized: false,
    rolling: false
  });
  app.register(jwt, {
    secret: config.sessionSecret
  });
  app.register(oauth2, {
    name: "oidc",
    scope: config.oidcScopes.split(/\s+/).filter(Boolean),
    credentials: {
      client: {
        id: config.oidcClientIdWeb,
        secret: config.oidcClientSecret
      },
      ...(config.mockOidcEnabled
        ? {
            auth: {
              tokenHost: config.appBaseUrl.replace(/\/$/, ""),
              authorizePath: "/mock-oidc/authorize",
              tokenPath: "/mock-oidc/token"
            }
          }
        : {}),
      options: {
        authorizationMethod: "body",
        bodyFormat: "form"
      }
    },
    callbackUri: `${config.appBaseUrl.replace(/\/$/, "")}/auth/callback`,
    ...(!config.mockOidcEnabled
      ? {
          discovery: {
            issuer: config.oidcIssuerUrl
          }
        }
      : {}),
    pkce: "S256",
    redirectStateCookieName: OIDC_STATE_COOKIE_NAME,
    verifierCookieName: OIDC_VERIFIER_COOKIE_NAME,
    cookie: baseCookieOptions
  });
  app.register(cors, {
    origin: true
  });
  app.register(multipart, {
    attachFieldsToBody: true
  });
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "BBNote API",
        description: "OIDC-authenticated notes, notebooks, attachments, imports, exports, and health checks.",
        version: "0.1.0"
      },
      tags: [
        { name: "Public", description: "Unauthenticated routes and auth bootstrap." },
        { name: "Notebooks", description: "Notebook creation, update, ordering, and deletion." },
        { name: "Notes", description: "Note search and CRUD." },
        { name: "Attachments", description: "Attachment upload and download." },
        { name: "Imports", description: "Import jobs." },
        { name: "Exports", description: "Export jobs." }
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: SESSION_COOKIE_NAME
          }
        }
      }
    }
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: secureCookies,
    uiConfig: {
      docExpansion: "list",
      deepLinking: false
    },
    transformSpecification: (openapiObject, request) => ({
      ...openapiObject,
      servers: [
        {
          url: `${request.protocol}://${request.headers.host}`,
          description: "Current server"
        }
      ]
    })
  });

  registerHealthController(app);
  registerAuthController(app, services);
  registerFolderController(app, services);
  registerNoteController(app, services);
  registerAttachmentController(app, services);
  registerImportController(app, services);
  registerExportController(app, services);
  await registerMockOidcController(app, services);

  const webDist = path.resolve(__dirname, "../../web/dist");
  if (await pathExists(path.join(webDist, "index.html"))) {
    app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      wildcard: false
    });

    app.get("/*", async (_request, reply) => {
      return reply.sendFile("index.html");
    });
  }

  return app;
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
