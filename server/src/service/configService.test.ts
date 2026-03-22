import { describe, expect, it } from "vitest";
import { buildConfig } from "./configService.js";

describe("buildConfig", () => {
  it("provides defaults for local development", () => {
    const config = buildConfig();
    expect(config.port).toBe(3000);
    expect(config.notesRoot).toContain("data");
  });
});
