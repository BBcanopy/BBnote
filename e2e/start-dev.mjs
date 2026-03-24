import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(rootDir, ".playwright-data");

await rm(dataRoot, { recursive: true, force: true });

const env = {
  ...process.env,
  API_ORIGIN: "http://127.0.0.1:3000",
  APP_BASE_URL: "http://127.0.0.1:5173",
  OIDC_ISSUER_URL: "https://issuer.example.com",
  OIDC_CLIENT_ID_WEB: "bbnote-web",
  OIDC_CLIENT_ID_ANDROID: "bbnote-android",
  OIDC_CLIENT_SECRET: "bbnote-dev-client-secret",
  OIDC_SCOPES: "openid profile email",
  SESSION_SECRET: "bbnote-playwright-session-secret",
  SQLITE_PATH: path.join(dataRoot, "db", "bbnote.sqlite"),
  NOTES_ROOT: path.join(dataRoot, "notes"),
  ATTACHMENTS_ROOT: path.join(dataRoot, "attachments"),
  EXPORTS_ROOT: path.join(dataRoot, "exports"),
  BBNOTE_TEST_AUTH_ENABLED: "true"
};

const child =
  process.platform === "win32"
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "npm run dev"], {
        cwd: rootDir,
        env,
        stdio: "inherit"
      })
    : spawn("npm", ["run", "dev"], {
        cwd: rootDir,
        env,
        stdio: "inherit"
      });

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    child.kill(signal);
  });
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
