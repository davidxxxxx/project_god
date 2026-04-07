/**
 * Seedable pseudo-random number generator.
 * Algorithm: mulberry32 — fast, deterministic, 32-bit state.
 * ALL randomness in the simulation MUST go through this interface.
 */

export interface RNG {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [min, max] (inclusive). */
  nextInt(min: number, max: number): number;
  /** Returns true with probability p (0–1). */
  chance(p: number): boolean;
  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T;
  /** Current internal state (for save/restore). */
  readonly state: number;
}

export function createRNG(seed: number): RNG {
  let s = seed | 0;

  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    nextInt(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
    chance(p: number): boolean {
      return next() < p;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    get state() {
      return s;
    },
  };
}
