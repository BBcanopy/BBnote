const DEFAULT_GRAVATAR_SIZE = 64;

export async function createGravatarUrl(email: string, size = DEFAULT_GRAVATAR_SIZE) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    return null;
  }

  try {
    const hashBuffer = await subtle.digest("SHA-256", new TextEncoder().encode(normalizedEmail));
    const hash = Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const params = new URLSearchParams({
      d: "404",
      s: size.toString()
    });
    return `https://www.gravatar.com/avatar/${hash}?${params.toString()}`;
  } catch {
    return null;
  }
}
