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

  it("falls back to the local hash implementation when subtle crypto is unavailable", async () => {
    vi.stubGlobal("crypto", {});
    await expect(createGravatarUrl("avery@example.com")).resolves.toBe(
      "https://www.gravatar.com/avatar/c7bab17bda91be4f73ce7604f0d3a01dd80f3a999a370de999dde303f7794fba?d=404&s=64"
    );
  });

  it("falls back to the local hash implementation when subtle crypto throws", async () => {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockRejectedValue(new Error("subtle unavailable"))
      }
    });

    await expect(createGravatarUrl("avery@example.com")).resolves.toBe(
      "https://www.gravatar.com/avatar/c7bab17bda91be4f73ce7604f0d3a01dd80f3a999a370de999dde303f7794fba?d=404&s=64"
    );
  });
});
