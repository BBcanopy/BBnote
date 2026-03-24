import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "..");

export default defineConfig(({ mode }) => {
  const env = {
    ...loadEnv(mode, repoRoot, ""),
    ...loadEnv(mode, configDir, ""),
    ...process.env
  };
  const apiOrigin = env.API_ORIGIN || "http://127.0.0.1:3000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api": apiOrigin,
        "/auth": apiOrigin,
        "/docs": apiOrigin,
        "/healthz": apiOrigin
      }
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts"
    }
  };
});
