/**
 * Endless shaft and the daily shaft (pure). Segments are drawn at random from a pool whose
 * difficulty rises with the segment index; speed creeps up with height. Every segment (a gate
 * block counts as one) runs port to port and closes its own gate effects, so joins are always
 * the same standard corridor — no impossible join, whatever came before.
 */
import { createRng, hashSeed, type Rng } from '@oyun/core/pure';
import { TrackBuilder } from './builder';
import { emit, OPEN_H, PORT_H, type PatternKind, type Seg } from './patterns';
import type { SpeedProfile, Track, Twist } from './track';
import { CUE_LEAD, easeFor, rockPeriod } from './twist';

export const ENDLESS_SPEED: SpeedProfile = { base: 480, creep: 0.0035, max: 650 };

export interface EndlessOptions {
  /** Number of segments (default 160: far longer than any run). */
  segments?: number;
  speed?: SpeedProfile;
  /**
   * View-twist stretches (lean, rock, zoom-out) over some segments above TWIST_FROM_Y. On by
   * default; presentation only: the shaft is the same with or without them.
   */
  twists?: boolean;
  /** Dive mode: the same generator, shown under one dive twist from start to end. */
  dive?: boolean;
}

/** Endless and daily get twist stretches above this height (300 m). */
export const TWIST_FROM_Y = 3000;
/** Dive mode's twist: the whole shaft, no ease (the run starts flipped). */
export const DIVE_TWIST: Readonly<Twist> = { kind: 'dive', y0: -1e9, y1: 1e9, ease: 0, amount: 0, period: 0 };

export interface EndlessTrack {
  track: Track;
  /** y of every join (the end of each segment). */
  joins: number[];
  /** Difficulty drawn for each segment. */
  qs: number[];
  /** True for the segments that are gate blocks. */
  gated: boolean[];
  /** Pattern of each segment ('gate' for a gate block). */
  kinds: (PatternKind | 'gate')[];
}

/** Twist stretches never sit on a segment harder than this, nor on a needle or a rhythm run. */
export const TWIST_MAX_Q = 0.6;
const CRUX_KINDS: readonly (PatternKind | 'gate')[] = ['needle', 'rhythm'];

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
/**
 * Twist stretches (pure, presentation only): some plain segments above TWIST_FROM_Y are shown
 * leaning, rocking or zoomed out. A stretch covers one segment, easing in around the join
 * before it and out around the join after it (joins are the standard port). Never on a crux:
 * not on a needle or a rhythm run, not on anything harder than TWIST_MAX_Q, and not beside a
 * needle or a rhythm run either (the eases reach a little into the neighbours). Never on a gate
 * block or beside one (a FAST gate would speed the roll up), never two in a row. Drawn from
 * their own stream, three numbers per segment whatever the outcome, so a longer build of the
 * same seed keeps the stretches it had, and the shaft is the same with or without them.
 */
function twistStretches(
  rng: Rng,
  start: number,
  joins: readonly number[],
  gated: readonly boolean[],
  kinds: readonly (PatternKind | 'gate')[],
  qs: readonly number[],
  vMax: number,
): Twist[] {
  const out: Twist[] = [];
  let last = -9;
  let lastEnd = -Infinity;
  for (let i = 0; i < joins.length; i++) {
    const roll = rng.next();
    const pick = rng.next();
    const sign = rng.next() < 0.5 ? -1 : 1;
    const a = i === 0 ? start : joins[i - 1]!;
    const b = joins[i]!;
    const kind = pick < 0.4 ? 'tilt' : pick < 0.7 ? 'rock' : 'far';
    const amount = kind === 'tilt' ? sign * (6 + Math.round(pick * 7.5)) : kind === 'rock' ? sign * 5 : 0.82;
    const ease = easeFor(kind, amount, vMax);
    if (a - ease / 2 < TWIST_FROM_Y || i - last < 2 || i + 1 >= joins.length) continue;
    if (gated[i] || gated[i - 1] || gated[i + 1]) continue;
    if (qs[i]! > TWIST_MAX_Q || CRUX_KINDS.includes(kinds[i]!) || CRUX_KINDS.includes(kinds[i - 1]!) || CRUX_KINDS.includes(kinds[i + 1]!)) continue;
    if (roll >= 0.5 || b - a < ease + 500) continue;
    // The view has settled from the stretch before by the time this one's cue comes up.
    if (a - ease / 2 - CUE_LEAD - 60 < lastEnd) continue;
    out.push({ kind, y0: a - ease / 2, y1: b + ease / 2, ease, amount, period: kind === 'rock' ? rockPeriod(amount, vMax) : 0 });
    last = i;
    lastEnd = b + ease / 2;
  }
  return out;
}

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
  const start = b.y;
  const joins: number[] = [];
  const qs: number[] = [];
  const gated: boolean[] = [];
  const kinds: (PatternKind | 'gate')[] = [];
  for (let i = 0; i < n; i++) {
    const { segs, q } = segmentFor(pick, i);
    for (const s of segs) emit(b, s, ctx);
    joins.push(b.y);
    qs.push(q);
    gated.push(segs.length > 1);
    kinds.push(segs.length > 1 ? 'gate' : (segs[0]!.k as PatternKind));
  }
  b.straight(200, PORT_H);
  if (opts.dive) b.twists.push({ ...DIVE_TWIST });
  if (opts.twists !== false) for (const t of twistStretches(rng.fork('twists'), start, joins, gated, kinds, qs, speed.max)) b.twists.push(t);
  return { track: b.finish(), joins, qs, gated, kinds };
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

/** Label of Dive mode's own seed stream (a fork of the session rng). */
export const DIVE_STREAM = 'dive';
