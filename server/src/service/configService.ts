export interface AppConfig {
  port: number;
  appBaseUrl: string;
  oidcIssuerUrl: string;
  oidcClientIdWeb: string;
  oidcClientIdAndroid: string;
  oidcClientSecret: string;
  oidcScopes: string;
  sessionSecret: string;
  sqlitePath: string;
  notesRoot: string;
  attachmentsRoot: string;
  attachmentMaxBytes: number;
  exportsRoot: string;
}

export function buildConfig(): AppConfig {
  const defaultPort = 3000;

  return {
    port: defaultPort,
    appBaseUrl: requireEnv("APP_BASE_URL"),
    oidcIssuerUrl: requireEnv("OIDC_ISSUER_URL"),
    oidcClientIdWeb: requireEnv("OIDC_CLIENT_ID_WEB"),
    oidcClientIdAndroid: requireEnv("OIDC_CLIENT_ID_ANDROID"),
    oidcClientSecret: requireEnv("OIDC_CLIENT_SECRET"),
    oidcScopes: requireEnv("OIDC_SCOPES"),
    sessionSecret: requireSessionSecret(),
    sqlitePath: requireEnv("SQLITE_PATH"),
    notesRoot: requireEnv("NOTES_ROOT"),
    attachmentsRoot: requireEnv("ATTACHMENTS_ROOT"),
    attachmentMaxBytes: parseOptionalPositiveInteger("ATTACHMENT_MAX_BYTES", 100 * 1024 * 1024),
    exportsRoot: requireEnv("EXPORTS_ROOT")
  };
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireSessionSecret() {
  const value = requireEnv("SESSION_SECRET");
  if (value.length < 32) {
    throw new Error("Environment variable SESSION_SECRET must be at least 32 characters long.");
  }
  return value;
}

function parseOptionalPositiveInteger(name: string, defaultValue: number) {
  const value = process.env[name]?.trim();
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsed;
}
