import { afterEach, describe, expect, it, vi } from "vitest";
import { createGravatarUrl } from "./gravatar";

describe("createGravatarUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes the email before building the gravatar url", async () => {
    const digest = vi.fn().mockResolvedValue(Uint8Array.from([0xab, 0xcd, 0x0f]).buffer);
    vi.stubGlobal("crypto", {
      subtle: {
        digest
      }
    });

    await expect(createGravatarUrl(" Avery@Example.com ", 80)).resolves.toBe(
      "https://www.gravatar.com/avatar/abcd0f?d=404&s=80"
    );

    expect(digest).toHaveBeenCalledTimes(1);
    const [algorithm, value] = digest.mock.calls[0] ?? [];
    expect(algorithm).toBe("SHA-256");
    expect(Array.from(value as Uint8Array)).toEqual(Array.from(new TextEncoder().encode("avery@example.com")));
  });

  it("returns null when there is no email to hash", async () => {
    await expect(createGravatarUrl("   ")).resolves.toBeNull();
  });

  it("returns null when subtle crypto is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    await expect(createGravatarUrl("avery@example.com")).resolves.toBeNull();
  });
});
