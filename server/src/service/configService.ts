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
  exportsRoot: string;
  mockOidcEnabled: boolean;
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
    sessionSecret: requireEnv("SESSION_SECRET"),
    sqlitePath: requireEnv("SQLITE_PATH"),
    notesRoot: requireEnv("NOTES_ROOT"),
    attachmentsRoot: requireEnv("ATTACHMENTS_ROOT"),
    exportsRoot: requireEnv("EXPORTS_ROOT"),
    mockOidcEnabled: requireBooleanEnv("MOCK_OIDC_ENABLED")
  };
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireBooleanEnv(name: string) {
  const value = requireEnv(name);
  if (value !== "true" && value !== "false") {
    throw new Error(`Environment variable ${name} must be 'true' or 'false'.`);
  }
  return value === "true";
}
