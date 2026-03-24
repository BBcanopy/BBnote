import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { createTestAuthProvider, createTestConfig } from "./test-helpers.js";

describe("swagger docs", () => {
  let app: FastifyInstance;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-docs-"));
    const config = createTestConfig(tempRoot);
    const oidc = createTestAuthProvider(config, {
      email: "docs@example.com",
      name: "Docs User",
      subject: "docs-user"
    });
    app = await buildApp({
      authTesting: oidc.authTesting,
      config
    });
  });

  afterEach(async () => {
    await app?.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it("serves swagger ui and the generated spec", async () => {
    const docsResponse = await app.inject({
      method: "GET",
      url: "/docs/"
    });
    expect(docsResponse.statusCode).toBe(200);
    expect(docsResponse.body).toContain("Swagger UI");

    const specResponse = await app.inject({
      method: "GET",
      url: "/docs/json"
    });
    expect(specResponse.statusCode).toBe(200);
    expect(specResponse.json()).toMatchObject({
      info: {
        title: "BBNote API"
      }
    });
    expect(specResponse.json().paths["/api/v1/notes"]).toBeDefined();
    expect(specResponse.json().paths["/healthz"]).toBeDefined();
  });
});
