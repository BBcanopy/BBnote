const DEFAULT_GRAVATAR_SIZE = 64;
const SHA256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
];
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2
];

export async function createGravatarUrl(email: string, size = DEFAULT_GRAVATAR_SIZE) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const hash = await hashEmail(normalizedEmail);
  const params = new URLSearchParams({
    d: "404",
    s: size.toString()
  });
  return `https://www.gravatar.com/avatar/${hash}?${params.toString()}`;
}

async function hashEmail(normalizedEmail: string) {
  const subtle = globalThis.crypto?.subtle;
  const data = new TextEncoder().encode(normalizedEmail);
  try {
    if (subtle && typeof subtle.digest === "function") {
      const hashBuffer = await subtle.digest("SHA-256", data);
      return bytesToHex(new Uint8Array(hashBuffer));
    }
  } catch {
    // Fall through to the local implementation.
  }

  return sha256Hex(data);
}

function sha256Hex(input: Uint8Array) {
  const padded = createPaddedInput(input);
  const words = new Uint32Array(64);
  const state = [...SHA256_INITIAL_STATE];

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] =
        (padded[base] << 24) |
        (padded[base + 1] << 16) |
        (padded[base + 2] << 8) |
        padded[base + 3];
    }

    for (let index = 16; index < 64; index += 1) {
      words[index] = addUint32(
        sigma1(words[index - 2]),
        words[index - 7],
        sigma0(words[index - 15]),
        words[index - 16]
      );
    }

    let [a, b, c, d, e, f, g, h] = state;

    for (let index = 0; index < 64; index += 1) {
      const temp1 = addUint32(h, upperSigma1(e), choose(e, f, g), SHA256_ROUND_CONSTANTS[index], words[index]);
      const temp2 = addUint32(upperSigma0(a), majority(a, b, c));

      h = g;
      g = f;
      f = e;
      e = addUint32(d, temp1);
      d = c;
      c = b;
      b = a;
      a = addUint32(temp1, temp2);
    }

    state[0] = addUint32(state[0], a);
    state[1] = addUint32(state[1], b);
    state[2] = addUint32(state[2], c);
    state[3] = addUint32(state[3], d);
    state[4] = addUint32(state[4], e);
    state[5] = addUint32(state[5], f);
    state[6] = addUint32(state[6], g);
    state[7] = addUint32(state[7], h);
  }

  return state.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function createPaddedInput(input: Uint8Array) {
  const remainder = (input.length + 9) % 64;
  const totalLength = input.length + 9 + (remainder === 0 ? 0 : 64 - remainder);
  const padded = new Uint8Array(totalLength);

  padded.set(input);
  padded[input.length] = 0x80;

  const bitLength = input.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(totalLength - 4, bitLength >>> 0, false);

  return padded;
}

function addUint32(...values: number[]) {
  let result = 0;
  for (const value of values) {
    result = (result + value) >>> 0;
  }
  return result;
}

function rotateRight(value: number, count: number) {
  return (value >>> count) | (value << (32 - count));
}

function choose(x: number, y: number, z: number) {
  return (x & y) ^ (~x & z);
}

function majority(x: number, y: number, z: number) {
  return (x & y) ^ (x & z) ^ (y & z);
}

function upperSigma0(value: number) {
  return rotateRight(value, 2) ^ rotateRight(value, 13) ^ rotateRight(value, 22);
}

function upperSigma1(value: number) {
  return rotateRight(value, 6) ^ rotateRight(value, 11) ^ rotateRight(value, 25);
}

function sigma0(value: number) {
  return rotateRight(value, 7) ^ rotateRight(value, 18) ^ (value >>> 3);
}

function sigma1(value: number) {
  return rotateRight(value, 17) ^ rotateRight(value, 19) ^ (value >>> 10);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
