/**
 * Injected randomness. Game setup takes an Rng so tests (and the
 * hotseat-vs-LAN equivalence check) can reproduce a game exactly.
 * All gameplay randomness (shuffles, instance ids, income rolls) is drawn at
 * setup from this one source; nothing random happens in rendering.
 */
export type Rng = () => number; // uniform in [0, 1)

/** Small deterministic PRNG (mulberry32). Not cryptographic: use for tests and hotseat. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cryptographically random Rng (Web Crypto, available in browsers and Node 22).
 * Used by the LAN server so nobody can reconstruct the deck or ids by guessing a seed.
 */
export function cryptoRng(): Rng {
  const buf = new Uint32Array(64);
  let i = buf.length;
  return () => {
    if (i >= buf.length) {
      globalThis.crypto.getRandomValues(buf);
      i = 0;
    }
    return buf[i++]! / 4294967296;
  };
}

/** Uniform integer in [min, max] inclusive. */
export function randomIntInclusive(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Fisher–Yates shuffle returning a new array. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
