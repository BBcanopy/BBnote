import crypto from "node:crypto";
import type { AppConfig } from "./configService.js";

export const AUTH_FLOW_COOKIE_NAME = "bbnote_auth_flow";
export const SESSION_COOKIE_NAME = "bbnote_session";

export interface AuthFlowCookieValue {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  createdAt: string;
}

export class CookieService {
  constructor(private readonly config: AppConfig) {}

  readSignedCookie(headerValue: string | undefined, name: string) {
    const cookies = parseCookies(headerValue);
    const rawValue = cookies[name];
    if (!rawValue) {
      return null;
    }

    const separatorIndex = rawValue.lastIndexOf(".");
    if (separatorIndex <= 0) {
      return null;
    }

    const value = rawValue.slice(0, separatorIndex);
    const signature = rawValue.slice(separatorIndex + 1);
    const expectedSignature = this.signValue(value);

    if (!timingSafeEquals(signature, expectedSignature)) {
      return null;
    }

    return value;
  }

  serializeSignedCookie(name: string, value: string, maxAgeSeconds: number) {
    return serializeCookie(name, `${value}.${this.signValue(value)}`, {
      httpOnly: true,
      maxAgeSeconds,
      secure: this.config.appBaseUrl.startsWith("https://"),
      sameSite: "Lax"
    });
  }

  serializeJsonCookie(name: string, value: AuthFlowCookieValue, maxAgeSeconds: number) {
    const encoded = Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return this.serializeSignedCookie(name, encoded, maxAgeSeconds);
  }

  readJsonCookie(headerValue: string | undefined, name: string): AuthFlowCookieValue | null {
    const encoded = this.readSignedCookie(headerValue, name);
    if (!encoded) {
      return null;
    }

    try {
      return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AuthFlowCookieValue;
    } catch {
      return null;
    }
  }

  clearCookie(name: string) {
    return serializeCookie(name, "", {
      httpOnly: true,
      maxAgeSeconds: 0,
      secure: this.config.appBaseUrl.startsWith("https://"),
      sameSite: "Lax"
    });
  }

  private signValue(value: string) {
    return crypto.createHmac("sha256", this.config.sessionSecret).update(value).digest("base64url");
  }
}

function parseCookies(headerValue: string | undefined) {
  const parsed: Record<string, string> = {};
  if (!headerValue) {
    return parsed;
  }

  for (const entry of headerValue.split(";")) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const name = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();
    parsed[name] = decodeURIComponent(value);
  }

  return parsed;
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly: boolean;
    maxAgeSeconds: number;
    secure: boolean;
    sameSite: "Lax";
  }
) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    `SameSite=${options.sameSite}`,
    "Priority=High"
  ];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function timingSafeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
