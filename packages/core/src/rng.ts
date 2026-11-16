/**
 * Seeded pseudo-random numbers (mulberry32). Pure, no Phaser.
 * Use one Rng for everything that changes gameplay so `?seed=N` replays a session exactly.
 * Never use Math.random() for gameplay; cosmetic jitter (sfx pitch, particle spread) may.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p (0..1). */
  chance(p: number): boolean;
  /** Random element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Shuffled copy (Fisher-Yates); the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /** Independent child stream derived from this stream's seed and a label. */
  fork(label: string): Rng;
  /** Internal 32-bit state, for saving a run mid-way. */
  getState(): number;
  setState(state: number): void;
}

/** FNV-1a 32-bit hash: stable unsigned seed from any string. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  const origin = seed >>> 0;
  let state = origin;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    fork(label) {
      return createRng((origin ^ hashSeed(label)) >>> 0);
    },
    getState() {
      return state;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
  return rng;
}
