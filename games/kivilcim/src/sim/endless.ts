/**
 * Endless shaft and the daily shaft (pure). Segments are drawn at random from a pool whose
 * difficulty rises with the segment index; speed creeps up with height. Every segment (a gate
 * block counts as one) runs port to port and closes its own gate effects, so joins are always
 * the same standard corridor — no impossible join, whatever came before.
 */
import { createRng, hashSeed, type Rng } from '@oyun/core/pure';
import { TrackBuilder } from './builder';
import { emit, OPEN_H, PORT_H, type PatternKind, type Seg } from './patterns';
import type { SpeedProfile, Track } from './track';

export const ENDLESS_SPEED: SpeedProfile = { base: 480, creep: 0.0035, max: 650 };

export interface EndlessOptions {
  /** Number of segments (default 160: far longer than any run). */
  segments?: number;
  speed?: SpeedProfile;
}

export interface EndlessTrack {
  track: Track;
  /** y of every join (the end of each segment). */
  joins: number[];
  /** Difficulty drawn for each segment. */
  qs: number[];
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

function pickKind(rng: Rng, q: number): PatternKind {
  const pool: [PatternKind, number][] = [
    ['wide', q < 0.3 ? 3 : 1],
    ['wave', 3],
    ['zig', 4],
    ['slalom', 3],
    ['bars', q > 0.1 ? 3 : 0],
    ['needle', q > 0.15 ? 2.5 : 0],
    ['rhythm', q > 0.2 ? 2.5 : 0],
    ['steps', q > 0.25 ? 2 : 0],
  ];
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let roll = rng.range(0, total);
  for (const [k, w] of pool) {
    roll -= w;
    if (roll < 0) return k;
  }
  return 'zig';
}

/** One endless segment: a pattern, or a gate block that opens and closes its effect. */
function segmentFor(rng: Rng, i: number): { segs: Seg[]; q: number } {
  const q = Math.min(0.9, Math.max(0, 0.04 + i * 0.026 + rng.range(-0.06, 0.06)));
  const gem = rng.chance(0.3);
  if (i >= 4 && rng.chance(0.2)) {
    const pick = rng.int(0, 3);
    if (pick === 0) return { q, segs: [{ k: 'gate', gate: 'fast' }, { k: 'wave', q: q * 0.4, gem }, { k: 'gate', gate: 'normal' }] };
    if (pick === 1) return { q, segs: [{ k: 'gate', gate: 'slow' }, { k: 'zig', q, gem }, { k: 'gate', gate: 'normal' }] };
    if (pick === 2) return { q, segs: [{ k: 'gate', gate: 'mini' }, { k: rng.chance(0.5) ? 'wave' : 'slalom', q: q * 0.5, gem }, { k: 'gate', gate: 'big' }] };
    return { q, segs: [{ k: 'gate', gate: 'flip' }, { k: 'zig', q: q * 0.7, gem }, { k: 'gate', gate: 'unflip' }] };
  }
  const k = pickKind(rng, q);
  const seg: Seg = { k, q, gem };
  if (k === 'rhythm') seg.leg = Math.round(lerp(256, 150, q));
  return { q, segs: [seg] };
}

export function buildEndless(seed: number, opts: EndlessOptions = {}): EndlessTrack {
  const speed = opts.speed ?? ENDLESS_SPEED;
  const n = opts.segments ?? 160;
  const rng = createRng(seed);
  const pick = rng.fork('segments');
  const sides = rng.fork('sides');
  const b = new TrackBuilder({ speed: speed.base, creep: speed.creep, maxSpeed: speed.max, startH: OPEN_H, ramp: speed.ramp ?? true });
  const ctx = { rng: sides, mini: false };
  emit(b, { k: 'open' }, ctx);
  const joins: number[] = [];
  const qs: number[] = [];
  for (let i = 0; i < n; i++) {
    const { segs, q } = segmentFor(pick, i);
    for (const s of segs) emit(b, s, ctx);
    joins.push(b.y);
    qs.push(q);
  }
  b.straight(200, PORT_H);
  return { track: b.finish(), joins, qs };
}

/** Local calendar date as YYYY-MM-DD (one daily shaft per day, wherever the player is). */
export function dailyKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dailySeed(key: string): number {
  return hashSeed(`kivilcim-daily-${key}`);
}
