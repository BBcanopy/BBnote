import path from "node:path";

export interface AppConfig {
  port: number;
  appBaseUrl: string;
  oidcIssuerUrl: string;
  oidcClientIdWeb: string;
  oidcClientIdAndroid: string;
  oidcScopes: string;
  sqlitePath: string;
  notesRoot: string;
  attachmentsRoot: string;
  exportsRoot: string;
  mockOidcEnabled: boolean;
}

export function buildConfig(): AppConfig {
  const appBaseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const defaultMockIssuerUrl = `${appBaseUrl.replace(/\/$/, "")}/mock-oidc`;
  const oidcIssuerUrl = process.env.OIDC_ISSUER_URL ?? defaultMockIssuerUrl;

  return {
    port: Number(process.env.APP_PORT ?? "3000"),
    appBaseUrl,
    oidcIssuerUrl,
    oidcClientIdWeb: process.env.OIDC_CLIENT_ID_WEB ?? "bbnote-web",
    oidcClientIdAndroid: process.env.OIDC_CLIENT_ID_ANDROID ?? "bbnote-android",
    oidcScopes: process.env.OIDC_SCOPES ?? "openid profile email",
    sqlitePath: process.env.SQLITE_PATH ?? path.resolve("data/db/bbnote.sqlite"),
    notesRoot: process.env.NOTES_ROOT ?? path.resolve("data/notes"),
    attachmentsRoot: process.env.ATTACHMENTS_ROOT ?? path.resolve("data/attachments"),
    exportsRoot: process.env.EXPORTS_ROOT ?? path.resolve("data/exports"),
    mockOidcEnabled: process.env.MOCK_OIDC_ENABLED
      ? process.env.MOCK_OIDC_ENABLED === "true"
      : oidcIssuerUrl === defaultMockIssuerUrl
  };
}
