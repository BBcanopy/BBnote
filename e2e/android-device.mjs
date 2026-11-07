import { _android, expect } from "@playwright/test";
import { createServer } from "node:http";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";

// An emulator-only fixture exercises the real native bridge and browser, without a production account.
const port = 8765;
const watchdog = setTimeout(() => { console.error("Android smoke test exceeded three minutes."); process.exit(1); }, 180_000);
watchdog.unref();
const origin = `http://10.0.2.2:${port}`;
const codes = new Map();
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const attachment = { id: "a", name: `bbnote-device-${randomUUID()}.txt`, mimeType: "text/plain", sizeBytes: 4, url: "/api/v1/attachments/a", embedded: false };
let note = { id: "n", folderId: "f", title: "Android smoke note", bodyMarkdown: "Hello from Android", scratchpad: null,
  sortOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), attachments: [attachment] };
let uploadCount = 0;
const fixture = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "authorization,content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  const url = new URL(request.url, origin);
  const json = (value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(value)); };
  if (url.pathname === "/api/v1/auth/native-config") {
    json({ issuer: origin, clientId: "bbnote-android", scopes: ["openid", "profile", "offline_access"] }); return;
  }
  if (url.pathname === "/.well-known/openid-configuration") {
    json({ issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`,
      jwks_uri: `${origin}/jwks`, response_types_supported: ["code"], subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"], code_challenge_methods_supported: ["S256"] }); return;
  }
  if (url.pathname === "/authorize") {
    const code = randomUUID();
    codes.set(code, Object.fromEntries(url.searchParams));
    response.writeHead(200, { "Content-Type": "text/html" }).end(`<html><head><meta name="viewport" content="width=device-width"></head><body><h1>Android test sign-in</h1><form action="/approve"><input type="hidden" name="code" value="${code}"><button>Continue to BBNote</button></form></body></html>`); return;
  }
  if (url.pathname === "/approve") {
    const code = url.searchParams.get("code"); const flow = codes.get(code);
    if (!flow) { json({ error: "invalid_request" }, 400); return; }
    const callback = new URL(flow.redirect_uri); callback.searchParams.set("code", code); callback.searchParams.set("state", flow.state);
    response.writeHead(302, { Location: callback.href }).end(); return;
  }
  const body = [];
  for await (const chunk of request) body.push(chunk);
  const payload = Buffer.concat(body).toString();
  if (url.pathname === "/token") {
    const tokenRequest = new URLSearchParams(payload);
    const flow = codes.get(tokenRequest.get("code"));
    if (tokenRequest.get("grant_type") === "authorization_code") {
      if (!flow || createHash("sha256").update(tokenRequest.get("code_verifier") ?? "").digest("base64url") !== flow.code_challenge) {
        json({ error: "invalid_grant" }, 400); return;
      }
      codes.delete(tokenRequest.get("code"));
    }
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url");
    const claims = Buffer.from(JSON.stringify({ iss: origin, aud: "bbnote-android", sub: "android-test", iat: now, exp: now + 3600, ...(flow?.nonce ? { nonce: flow.nonce } : {}) })).toString("base64url");
    const signature = sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), privateKey).toString("base64url");
    json({ token_type: "Bearer", access_token: "device-test-access", refresh_token: "device-test-refresh", expires_in: 3600, id_token: `${header}.${claims}.${signature}` }); return;
  }
  if (request.headers.authorization !== "Bearer device-test-access") { json({ message: "Authentication required" }, 401); return; }
  if (url.pathname === "/api/v1/auth/session") json({ authenticated: true, user: { email: "android@example.test", name: "Android Test", theme: "sea" } });
  else if (url.pathname === "/api/v1/folders") json([{ id: "f", name: "Android notebook", parentId: null, path: "Android notebook", icon: "folder", childCount: 0, noteCount: 1 }]);
  else if (url.pathname === "/api/v1/notes/n/attachments") {
    uploadCount += 1;
    const uploaded = { ...attachment, id: `upload-${uploadCount}`, name: `upload-${uploadCount}.txt`, url: `/api/v1/attachments/upload-${uploadCount}` };
    note.attachments.push(uploaded); json(uploaded);
  } else if (url.pathname === "/api/v1/notes/n") {
    if (request.method === "PUT") note = { ...note, ...JSON.parse(payload) };
    json(note);
  } else if (url.pathname === "/api/v1/notes") json({ items: [{ ...note, excerpt: "Hello", attachmentCount: note.attachments.length }], nextCursor: null });
  else if (url.pathname.startsWith("/api/v1/attachments/")) response.writeHead(200, { "Content-Type": "text/plain" }).end("test");
  else json({});
});

await new Promise((resolve) => fixture.listen(port, "127.0.0.1", resolve));
const [device] = (await _android.devices()).filter((candidate) => candidate.serial().startsWith("emulator-"));
if (!device) { fixture.close(); throw new Error("Start an Android emulator before running the device smoke test."); }
device.setDefaultTimeout(30_000);
let browser;
let page;
const apk = new URL("../android/android/app/build/outputs/apk/debug/app-debug.apk", import.meta.url);
async function launch() {
  await device.shell("am start -n me.jybb.bbnote/.MainActivity");
  return (await device.webView({ pkg: "me.jybb.bbnote" })).page();
}
async function tapNativeResource(resourceId, packageName) {
  // Read the current system hierarchy: permission dialogs can outlive a cached automation tree.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await device.shell("uiautomator dump /data/local/tmp/bbnote-ui.xml");
    const xml = (await device.shell("cat /data/local/tmp/bbnote-ui.xml")).toString();
    const nodes = xml.match(/<node\b[^>]*>/g) ?? [];
    const node = nodes.find((value) => value.includes(`resource-id="${resourceId}"`) && (!packageName || value.includes(`package="${packageName}"`)));
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      const [, left, top, right, bottom] = bounds.map(Number);
      await device.shell(`input tap ${Math.floor((left + right) / 2)} ${Math.floor((top + bottom) / 2)}`);
      return;
    }
  }
  throw new Error(`Android control not found: ${resourceId}`);
}
async function authorizationTab() {
  const promise = browser.waitForEvent("page");
  await page.getByRole("button", { name: "Sign in with OIDC" }).click();
  const tab = await promise;
  await tab.getByRole("button", { name: "Continue to BBNote" }).waitFor();
  return tab;
}
try {
  await device.shell("svc power stayon true");
  await device.shell("settings put system screen_off_timeout 2147483647");
  await device.shell("input keyevent KEYCODE_WAKEUP");
  await device.shell("wm dismiss-keyguard");
  console.log("SETUP: installing the debug APK on the emulator");
  await device.installApk(await readFile(apk));
  await device.shell("pm clear me.jybb.bbnote");
  console.log("SETUP: opening Chrome and the BBNote WebView");
  browser = await device.launchBrowser();
  page = await launch();
  await page.getByLabel("Server URL").fill(origin);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Sign in with OIDC" }).waitFor();
  console.log("PASS: actual APK connects to a debug server");
  await authorizationTab();
  await tapNativeResource("com.android.chrome:id/close_button");
  await expect(page.getByRole("alert")).toContainText("cancelled");
  const tab = await authorizationTab();
  const appPid = (await device.shell("pidof me.jybb.bbnote")).toString().trim();
  if (!/^\d+$/.test(appPid)) throw new Error("Could not identify the test APK's process.");
  await device.shell(`run-as me.jybb.bbnote kill -9 ${appPid}`);
  await expect.poll(async () => (await device.shell("pidof me.jybb.bbnote")).toString().trim()).toBe("");
  await tab.getByRole("button", { name: "Continue to BBNote" }).click();
  page = await (await device.webView({ pkg: "me.jybb.bbnote" })).page();
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
  console.log("PASS: external-browser sign-in, PKCE, cancellation, and process recreation during sign-in");
  await device.shell("am force-stop me.jybb.bbnote");
  page = await launch();
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
  console.log("PASS: encrypted sign-in restored after force-stop/restart");
  await page.goto("https://localhost/folders/f/notes/n");
  const panel = page.getByTestId("editor-panel-mobile");
  await expect(page.getByRole("textbox", { name: "Title", exact: true }).first()).toHaveValue("Android smoke note");
  await panel.getByRole("button", { name: "Notebooks", exact: true }).click();
  await expect(page.getByTestId("mobile-notebooks-drawer")).toBeVisible();
  await device.shell("input keyevent 4");
  await expect(page.getByTestId("mobile-notebooks-drawer")).toBeHidden();
  console.log("PASS: Android Back dismisses the drawer");
  await panel.getByTestId("media-input-file").setInputFiles({ name: "device.txt", mimeType: "text/plain", buffer: Buffer.from("device upload") });
  await expect.poll(() => uploadCount).toBe(1);
  console.log("PASS: multipart upload through the real WebView");
  await panel.getByRole("button", { name: "Record voice", exact: true }).click();
  await tapNativeResource("com.android.permissioncontroller:id/permission_deny_button");
  await expect(panel.getByText("Microphone access was denied.", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await panel.getByRole("button", { name: "Record voice", exact: true }).click();
  await tapNativeResource("com.android.permissioncontroller:id/permission_allow_foreground_only_button");
  await expect(panel.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Stop", exact: true }).click();
  await expect.poll(() => uploadCount).toBe(2);
  console.log("PASS: microphone denial, permission grant, and recorded audio upload");
  await panel.getByTestId("attachment-list").getByRole("button", { name: "Download", exact: true }).first().click();
  await tapNativeResource("android:id/button1", "com.google.android.documentsui");
  await expect.poll(async () => (await device.shell(`cat /sdcard/Download/${attachment.name}`)).toString().trim()).toBe("test");
  console.log("PASS: authenticated download saved through Android's save dialog");
  await mkdir(new URL("../android/.toolchain", import.meta.url), { recursive: true });
  await page.screenshot({ path: "android/.toolchain/device-smoke.png" });
} catch (failure) {
  await mkdir(new URL("../android/.toolchain", import.meta.url), { recursive: true });
  await device.screenshot({ path: "android/.toolchain/device-failure.png" }).catch(() => {});
  if (page && !page.isClosed()) console.error(await page.locator("body").innerText().catch(() => ""));
  throw failure;
} finally {
  clearTimeout(watchdog);
  await browser?.close().catch(() => {});
  await device.close();
  fixture.closeAllConnections(); fixture.close();
}
