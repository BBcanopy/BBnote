import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./", testMatch: "android-app.spec.ts", timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:5174", viewport: { width: 412, height: 915 }, trace: "retain-on-failure" },
  webServer: { command: "node ../node_modules/vite/bin/vite.js ../web --host 127.0.0.1 --port 5174 --strictPort", env: { VITE_NATIVE_TEST: "true" }, url: "http://127.0.0.1:5174", timeout: 30_000, reuseExistingServer: false }
});
