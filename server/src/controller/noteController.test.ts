import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

describe("noteController integration", () => {
  let app: FastifyInstance;
  let token: string;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbnote-"));
    process.env.APP_PORT = "3000";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.OIDC_ISSUER_URL = "http://localhost:3000/mock-oidc";
    process.env.OIDC_CLIENT_ID_WEB = "bbnote-web";
    process.env.OIDC_CLIENT_ID_ANDROID = "bbnote-android";
    process.env.OIDC_SCOPES = "openid profile email";
    process.env.SQLITE_PATH = path.join(tempRoot, "db", "bbnote.sqlite");
    process.env.NOTES_ROOT = path.join(tempRoot, "notes");
    process.env.ATTACHMENTS_ROOT = path.join(tempRoot, "attachments");
    process.env.MOCK_OIDC_ENABLED = "true";

    app = await buildApp();
    const issued = await app.bbnote.mockOidcService!.issueTestToken({
      clientId: "bbnote-web",
      email: "avery@example.com",
      name: "Avery Stone"
    });
    token = issued.access_token;
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
    delete process.env.APP_PORT;
    delete process.env.APP_BASE_URL;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.OIDC_CLIENT_ID_WEB;
    delete process.env.OIDC_CLIENT_ID_ANDROID;
    delete process.env.OIDC_SCOPES;
    delete process.env.SQLITE_PATH;
    delete process.env.NOTES_ROOT;
    delete process.env.ATTACHMENTS_ROOT;
    delete process.env.MOCK_OIDC_ENABLED;
  });

  it("creates inbox automatically, stores notes on disk, and searches through fts", async () => {
    const folderResponse = await app.inject({
      method: "GET",
      url: "/api/v1/folders",
      headers: authHeaders(token)
    });
    expect(folderResponse.statusCode).toBe(200);
    const [inbox] = folderResponse.json();
    expect(inbox.name).toBe("Inbox");

    const nestedFolderResponse = await app.inject({
      method: "POST",
      url: "/api/v1/folders",
      headers: authHeaders(token),
      payload: {
        name: "项目 计划",
        parentId: inbox.id
      }
    });
    expect(nestedFolderResponse.statusCode).toBe(201);
    const nestedFolder = nestedFolderResponse.json();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/v1/notes",
      headers: authHeaders(token),
      payload: {
        folderId: nestedFolder.id,
        title: "会议记录 与 预算规划",
        bodyMarkdown: "# 预算\n\n需要在本周内完成规划。"
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const noteRow = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);

    expect(noteRow?.filePath).toContain("项目-计划");
    expect(noteRow?.filePath).toContain(created.id);
    expect(noteRow?.filePath).toContain("会议记录-与-预算规划");
    await expect(fs.readFile(noteRow!.filePath, "utf8")).resolves.toContain("预算");

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/v1/notes?q=${encodeURIComponent("预算")}&folderId=${nestedFolder.id}`,
      headers: authHeaders(token)
    });
    expect(listResponse.statusCode).toBe(200);
    const listPayload = listResponse.json();
    expect(listPayload.items).toHaveLength(1);
    expect(listPayload.items[0].title).toContain("预算");

    const updated = await app.inject({
      method: "PUT",
      url: `/api/v1/notes/${created.id}`,
      headers: authHeaders(token),
      payload: {
        folderId: nestedFolder.id,
        title: "改名后的标题",
        bodyMarkdown: "更新后的正文"
      }
    });
    expect(updated.statusCode).toBe(200);

    const noteRowAfterUpdate = app.bbnote.database.connection
      .prepare<[string], { filePath: string }>("select file_path as filePath from notes where id = ?")
      .get(created.id);
    expect(noteRowAfterUpdate?.filePath).toBe(noteRow?.filePath);
  });
});

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`
  };
}
