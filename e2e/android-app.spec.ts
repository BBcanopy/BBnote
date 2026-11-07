import { expect, test, type Page } from "@playwright/test";

const server = "https://notes.example.test";
const attachment = { id: "a", name: "manual.pdf", mimeType: "application/pdf", sizeBytes: 4, url: "/api/v1/attachments/a", embedded: false };
const note = { id: "n", folderId: "f", title: "Phone note", bodyMarkdown: "[Manual](/api/v1/attachments/a)", scratchpad: null,
  sortOrder: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", attachments: [attachment] };

async function prepare(page: Page, options: { restored?: boolean; cancelOnce?: boolean; failConnection?: boolean } = {}) {
  await page.addInitScript(({ server, options }) => {
    const initial = { server: options.restored ? server : null, authenticated: Boolean(options.restored), debug: false };
    let state = JSON.parse(localStorage.getItem("native-state") ?? "null") ?? initial;
    const save = () => localStorage.setItem("native-state", JSON.stringify(state));
    let cancel = options.cancelOnce;
    (window as any).__nativeDownloads = [];
    (window as any).__BBNOTE_NATIVE_TEST__ = {
      async getState() { return state; },
      async connect({ server }: { server: string }) { state = { ...state, server, authenticated: false }; save(); },
      async signIn() { if (cancel) { cancel = false; throw new Error("Sign-in cancelled."); } state.authenticated = true; save(); },
      async getAccessToken() { return { token: state.authenticated ? "native-access" : null }; },
      async signOut() { state.authenticated = false; save(); },
      async disconnect() { state = { ...state, server: null, authenticated: false }; save(); },
      async download(details: unknown) { (window as any).__nativeDownloads.push(details); }
    };
  }, { server, options });
  let fail = options.failConnection;
  const requests: { url: string; authorization: string | undefined }[] = [];
  await page.route("https://*.example.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    requests.push({ url: request.url(), authorization: request.headers().authorization });
    let body: unknown;
    if (url.pathname.endsWith("/native-config")) {
      if (fail) { fail = false; await route.fulfill({ status: 503, headers }); return; }
      body = { issuer: "https://issuer.example.test", clientId: "android", scopes: ["openid", "offline_access"] };
    } else {
      expect(request.headers().authorization).toBe("Bearer native-access");
      expect(request.headers().cookie).toBeUndefined();
      if (url.pathname.endsWith("/auth/session")) body = { authenticated: true, user: { email: "phone@example.test", name: "Phone User", theme: "sea" } };
      else if (url.pathname.endsWith("/folders")) body = [{ id: "f", name: "Notebook", parentId: null, path: "Notebook", icon: "folder", childCount: 0, noteCount: 1 }];
      else if (url.pathname.endsWith("/notes/n")) body = note;
      else if (url.pathname.endsWith("/notes")) body = { items: [{ ...note, excerpt: "Manual", attachmentCount: 1 }], nextCursor: null };
      else if (url.pathname.endsWith("/exports")) body = { id: "export", status: "completed", downloadUrl: "/api/v1/exports/export/download", expiresAt: null, summary: { noteCount: 1, folderCount: 1, attachmentCount: 1 } };
      else body = {};
    }
    await route.fulfill({ json: body, headers });
  });
  return requests;
}

test("validates a server, retries a failed connection, handles cancelled sign-in, and restores the session", async ({ page }) => {
  await prepare(page, { cancelOnce: true, failConnection: true });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connect to BBNote" })).toBeVisible();
  await page.getByLabel("Server URL").fill("http://notes.example.test");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Use HTTPS");
  await page.getByLabel("Server URL").fill(server);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not connect");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(server, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  await page.getByRole("button", { name: "Change server" }).click();
  await expect(page.getByRole("heading", { name: "Connect to BBNote" })).toBeVisible();
});

test("confirms server changes and clears the authenticated workspace", async ({ page }) => {
  const requests = await prepare(page, { restored: true });
  await page.goto("/folders/f/notes/n");
  await expect(page.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue("Phone note");
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("button", { name: "Change server", exact: true }).click();
  await page.getByRole("dialog", { name: "Change server?" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue("Phone note");
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("button", { name: "Change server", exact: true }).click();
  await page.getByRole("dialog", { name: "Change server?" }).getByRole("button", { name: "Change server" }).click();
  await page.getByLabel("Server URL").fill("https://second.example.test");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  expect(requests.filter((request) => request.url.startsWith("https://second.example.test")).every((request) => !request.authorization)).toBe(true);
  await expect(page.getByText("Phone note", { exact: true })).toHaveCount(0);
});

test("routes attachments and export downloads through Android file actions", async ({ page }) => {
  await prepare(page, { restored: true });
  await page.goto("/folders/f/notes/n");
  const panel = page.getByTestId("editor-panel-mobile");
  await panel.getByTestId("attachment-list").getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeDownloads)).toEqual([
    { url: `${server}/api/v1/attachments/a`, name: "manual.pdf", open: false }
  ]);
  await panel.getByRole("button", { name: "Preview", exact: true }).click();
  await page.evaluate(() => {
    const bridge = (window as any).__BBNOTE_NATIVE_TEST__;
    const download = bridge.download;
    bridge.download = async () => { bridge.download = download; throw new Error("No viewer installed. Download the file instead."); };
  });
  await panel.getByRole("button", { name: "Manual", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("No viewer installed");
  await panel.getByRole("button", { name: "Manual", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeDownloads.length)).toBe(2);
  expect(await page.evaluate(() => (window as any).__nativeDownloads[1].open)).toBe(true);
  expect(await page.evaluate(() => (window as any).__nativeDownloads[1].name)).toBe("manual.pdf");
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("link", { name: "Migration", exact: true }).click();
  await page.getByRole("button", { name: "Export all notes" }).click();
  await page.getByRole("button", { name: "Download ZIP" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__nativeDownloads.length)).toBe(3);
  expect(await page.evaluate(() => (window as any).__nativeDownloads[2])).toEqual({ url: `${server}/api/v1/exports/export/download`, name: "export.zip", open: false });
});

test("retries a temporary session connection failure without opening sign-in", async ({ page }) => {
  await prepare(page, { restored: true });
  let fail = true;
  await page.route("**/api/v1/auth/session", async (route) => {
    if (fail) { fail = false; await route.abort("failed"); } else await route.fallback();
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Retry connection" }).click();
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
});

test("clears a restored credential rejected by the server", async ({ page }) => {
  await prepare(page, { restored: true });
  await page.route("**/api/v1/auth/session", (route) => route.fulfill({
    json: { authenticated: false, user: null }, headers: { "access-control-allow-origin": "*" }
  }));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  expect(await page.evaluate(async () => (window as any).__BBNOTE_NATIVE_TEST__.getState())).toMatchObject({ server, authenticated: false });
});

test("aborts pending authenticated work when signing out", async ({ page }) => {
  await prepare(page, { restored: true });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/auth/theme", async (route) => {
    await pending;
    await route.fulfill({ json: { authenticated: true, user: { email: "phone@example.test", name: "Phone User", theme: "midnight" } },
      headers: { "access-control-allow-origin": "*" } }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open user menu" }).click();
  const request = page.waitForRequest("**/api/v1/auth/theme");
  await page.getByRole("button", { name: "Midnight", exact: true }).click();
  await request;
  const aborted = page.waitForEvent("requestfailed", (failed) => failed.url().endsWith("/api/v1/auth/theme"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await aborted;
  release();
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open user menu" })).toHaveCount(0);
});
