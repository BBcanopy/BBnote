import crypto from "node:crypto";
import type { AppConfig } from "./configService.js";

type JsonWebKeyLike = Record<string, unknown>;

interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  nonce: string | undefined;
  subject: string;
  email: string;
  name: string;
}

interface AccessTokenRecord {
  issuer: string;
  subject: string;
  email: string;
  name: string;
  audience: string;
  expiresAt: number;
}

function pkceChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export class MockOidcService {
  private readonly issuer: string;
  private readonly authorizationCodes = new Map<string, AuthorizationCodeRecord>();
  private readonly accessTokens = new Map<string, AccessTokenRecord>();
  private readonly keyPair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });
  private readonly publicJwk = {
    ...(this.keyPair.publicKey.export({ format: "jwk" }) as JsonWebKeyLike),
    kid: "bbnote-mock",
    use: "sig",
    alg: "RS256"
  };

  constructor(private readonly config: AppConfig) {
    this.issuer = `${config.appBaseUrl.replace(/\/$/, "")}/mock-oidc`;
  }

  matchesIssuer(issuerUrl: string) {
    return issuerUrl.replace(/\/$/, "") === this.issuer;
  }

  async discoveryDocument() {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      userinfo_endpoint: `${this.issuer}/userinfo`,
      jwks_uri: `${this.issuer}/jwks`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: ["client_secret_post"],
      claims_supported: ["sub", "iss", "aud", "name", "email", "nonce"]
    };
  }

  async jwks() {
    return {
      keys: [this.publicJwk]
    };
  }

  renderAuthorizePage(query: Record<string, string | undefined>) {
    const hiddenInputs = Object.entries(query)
      .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}" />`)
      .join("\n");

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BBNote Mock OIDC</title>
          <style>
            body { font-family: "Geist Sans", system-ui, sans-serif; background: #f3f5f6; color: #0f172a; margin: 0; }
            main { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
            form { width: min(420px, 100%); background: rgba(255,255,255,0.92); border: 1px solid rgba(148,163,184,0.18); border-radius: 32px; padding: 32px; box-shadow: 0 20px 40px -24px rgba(15,23,42,0.2); }
            label { display: grid; gap: 8px; margin-bottom: 18px; font-size: 14px; }
            input { border-radius: 16px; border: 1px solid #cbd5e1; padding: 12px 14px; font: inherit; }
            button { border: none; border-radius: 999px; background: #0f766e; color: white; padding: 14px 18px; font: inherit; width: 100%; cursor: pointer; }
            p { color: #475569; line-height: 1.6; }
          </style>
        </head>
        <body>
          <main>
            <form method="post" action="/mock-oidc/authorize">
              <p>Mock OIDC is enabled for local development and automated tests.</p>
              <label>
                Display name
                <input name="name" value="Avery Stone" />
              </label>
              <label>
                Email
                <input name="email" value="avery@example.com" />
              </label>
              ${hiddenInputs}
              <button type="submit">Continue to BBNote</button>
            </form>
          </main>
        </body>
      </html>`;
  }

  createAuthorizationRedirect(input: {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    scope: string;
    nonce?: string;
    state: string;
    name: string;
    email: string;
  }) {
    const code = crypto.randomUUID();
    const subject = crypto.createHash("sha256").update(input.email.toLowerCase()).digest("hex").slice(0, 24);
    this.authorizationCodes.set(code, {
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      scope: input.scope,
      nonce: input.nonce,
      subject,
      name: input.name,
      email: input.email
    });
    const redirectUrl = new URL(input.redirectUri);
    redirectUrl.searchParams.set("code", code);
    redirectUrl.searchParams.set("state", input.state);
    return redirectUrl.toString();
  }

  async exchangeAuthorizationCode(input: {
    code: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    codeVerifier: string;
  }) {
    const code = this.authorizationCodes.get(input.code);
    if (!code) {
      throw new Error("Invalid authorization code.");
    }
    if (code.clientId !== input.clientId || code.redirectUri !== input.redirectUri) {
      throw new Error("Authorization code parameters do not match.");
    }
    if (input.clientSecret && input.clientSecret !== this.config.oidcClientSecret) {
      throw new Error("Invalid client secret.");
    }
    if (code.codeChallengeMethod !== "S256" || pkceChallenge(input.codeVerifier) !== code.codeChallenge) {
      throw new Error("Invalid PKCE verifier.");
    }
    this.authorizationCodes.delete(input.code);
    return this.buildTokens({
      clientId: input.clientId,
      subject: code.subject,
      name: code.name,
      email: code.email,
      nonce: code.nonce
    });
  }

  async issueTestToken(input: { clientId: string; email: string; name: string }) {
    const subject = crypto.createHash("sha256").update(input.email.toLowerCase()).digest("hex").slice(0, 24);
    return this.buildTokens({
      clientId: input.clientId,
      subject,
      email: input.email,
      name: input.name
    });
  }

  async userinfo(accessToken: string) {
    const token = this.accessTokens.get(accessToken);
    if (!token || token.expiresAt <= Date.now()) {
      this.accessTokens.delete(accessToken);
      throw new Error("Invalid access token.");
    }

    return {
      iss: token.issuer,
      sub: token.subject,
      email: token.email,
      name: token.name,
      aud: token.audience
    };
  }

  private async buildTokens(input: {
    clientId: string;
    subject: string;
    name: string;
    email: string;
    nonce?: string;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = this.signJwt({
      iss: this.issuer,
      sub: input.subject,
      aud: input.clientId,
      email: input.email,
      name: input.name,
      iat: now,
      exp: now + 3600
    });
    this.accessTokens.set(accessToken, {
      issuer: this.issuer,
      subject: input.subject,
      email: input.email,
      name: input.name,
      audience: input.clientId,
      expiresAt: (now + 3600) * 1000
    });

    const idToken = this.signJwt({
      iss: this.issuer,
      sub: input.subject,
      aud: input.clientId,
      email: input.email,
      name: input.name,
      nonce: input.nonce,
      iat: now,
      exp: now + 3600
    });

    return {
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600
    };
  }

  private signJwt(payload: Record<string, unknown>) {
    const header = {
      alg: "RS256",
      kid: "bbnote-mock",
      typ: "JWT"
    };
    const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const input = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(input, "utf8"), this.keyPair.privateKey).toString("base64url");
    return `${input}.${signature}`;
  }
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
