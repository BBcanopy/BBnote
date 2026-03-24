import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./",
  timeout: 60_000,
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:5173",
    trace: "retain-on-failure"
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "node start-dev.mjs",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: false,
        timeout: 120_000
      }
});
