import { describe, expect, it } from "vitest";
import { buildConfig } from "./configService.js";

describe("buildConfig", () => {
  it("provides defaults for local development", () => {
    const config = buildConfig();
    expect(config.port).toBe(3000);
    expect(config.appBaseUrl).toBe("http://127.0.0.1:3000");
    expect(config.oidcIssuerUrl).toBe("http://127.0.0.1:3000/mock-oidc");
    expect(config.mockOidcEnabled).toBe(true);
    expect(config.notesRoot).toContain("data");
  });

  it("disables mock oidc by default when a custom issuer is configured", () => {
    process.env.OIDC_ISSUER_URL = "https://issuer.example.com";

    const config = buildConfig();

    expect(config.oidcIssuerUrl).toBe("https://issuer.example.com");
    expect(config.mockOidcEnabled).toBe(false);

    delete process.env.OIDC_ISSUER_URL;
  });
});
