import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildConfig } from "./configService.js";

const REQUIRED_ENV = {
  APP_BASE_URL: "http://127.0.0.1:3000",
  OIDC_ISSUER_URL: "https://issuer.example.com",
  OIDC_CLIENT_ID_WEB: "bbnote-web",
  OIDC_CLIENT_ID_ANDROID: "bbnote-android",
  OIDC_CLIENT_SECRET: "bbnote-dev-client-secret",
  OIDC_SCOPES: "openid profile email",
  SESSION_SECRET: "bbnote-dev-session-secret-0123456789",
  SQLITE_PATH: "/tmp/bbnote.sqlite",
  NOTES_ROOT: "/tmp/notes",
  ATTACHMENTS_ROOT: "/tmp/attachments",
  EXPORTS_ROOT: "/tmp/exports"
} as const;

const REQUIRED_ENV_KEYS = Object.keys(REQUIRED_ENV) as Array<keyof typeof REQUIRED_ENV>;

describe("buildConfig", () => {
  beforeEach(() => {
    for (const [key, value] of Object.entries(REQUIRED_ENV)) {
      process.env[key] = value;
    }
  });

  afterEach(() => {
    for (const key of REQUIRED_ENV_KEYS) {
      delete process.env[key];
    }
  });

  it("returns explicit environment values", () => {
    const config = buildConfig();

    expect(config.port).toBe(3000);
    expect(config.appBaseUrl).toBe(REQUIRED_ENV.APP_BASE_URL);
    expect(config.oidcIssuerUrl).toBe(REQUIRED_ENV.OIDC_ISSUER_URL);
    expect(config.oidcClientSecret).toBe(REQUIRED_ENV.OIDC_CLIENT_SECRET);
    expect(config.sessionSecret).toBe(REQUIRED_ENV.SESSION_SECRET);
    expect(config.notesRoot).toBe(REQUIRED_ENV.NOTES_ROOT);
    expect(config.attachmentMaxBytes).toBe(50 * 1024 * 1024);
  });

  it("fails fast when a required value is missing", () => {
    delete process.env.OIDC_ISSUER_URL;
    expect(() => buildConfig()).toThrow("Missing required environment variable: OIDC_ISSUER_URL");
  });

  it("fails fast when the session secret is too short", () => {
    process.env.SESSION_SECRET = "too-short";
    expect(() => buildConfig()).toThrow("Environment variable SESSION_SECRET must be at least 32 characters long.");
  });

  it("accepts an explicit attachment upload limit", () => {
    process.env.ATTACHMENT_MAX_BYTES = "4096";

    expect(buildConfig().attachmentMaxBytes).toBe(4096);
  });

  it("rejects invalid attachment upload limits", () => {
    process.env.ATTACHMENT_MAX_BYTES = "invalid";

    expect(() => buildConfig()).toThrow("Environment variable ATTACHMENT_MAX_BYTES must be a positive integer.");
  });
});
