/**
 * Levels 1-50 in five worlds of ten (pure). World 1 (levels 1-10) is the original slice and its
 * geometry is frozen. Worlds 2-4 each introduce new mechanics one at a time, alone and calm
 * (q 0) on their intro level, then combine them; every world ends on a boss level. World 5
 * (Vortex) adds no new hazard: it introduces the view twists (dive, lean and rock, zoom, side),
 * each alone on its own level, then combines them with the eight mechanics. Twists are
 * presentation only (track.twists): the geometry they sit on is ordinary corridor, and every
 * change of view happens in a wide, empty chamber, never on the crux.
 *
 * Levels 1-10 (pure): hand-ordered pattern sequences with per-segment difficulty, seeded only for
 * cosmetic variation (which side a pattern swings to first, bar phases). Difficulty is raised on
 * purpose: each level's hardest stretch (its crux) is harder than the previous level's, which the
 * solver test measures as strictly smaller safety margins and reaction windows.
 *
 * Gate families are introduced alone in easy stretches: speed on level 2, mini on level 3, flip
 * on level 4; from level 5 they combine.
 */
import { createRng } from '@oyun/core/pure';
import { TrackBuilder } from './builder';
import { emit, OPEN_H, PORT_H, type Mechanic, type PatternCtx, type Seg, type TwistSpec } from './patterns';
import type { Track, TwistKind } from './track';

export const LEVEL_COUNT = 50;
export const WORLD_SIZE = 10;
export const WORLD_COUNT = LEVEL_COUNT / WORLD_SIZE;

export const worldOf = (id: number): number => Math.ceil(id / WORLD_SIZE);
export const isBoss = (id: number): boolean => id % WORLD_SIZE === 0;

export interface LevelInfo {
  id: number;
  world: number;
  boss: boolean;
  /** Mechanic introduced on this level (calm, alone, with a one-time cue). */
  intro: Mechanic | null;
  /** View twists introduced on this level (world 5). */
  twists: TwistKind[];
  /** Base scroll speed, px/s. */
  speed: number;
  /** Palette index (src/textures PALETTES). */
  theme: number;
  segs: Seg[];
}

const G = (gate: Seg['gate']): Seg => ({ k: 'gate', gate });
const O: Seg = { k: 'open' };
const D = (q: number, gem = false): Seg => ({ k: 'wide', q, gem });
const W = (q: number, gem = false): Seg => ({ k: 'wave', q, gem });
const Z = (q: number, gem = false): Seg => ({ k: 'zig', q, gem });
const N = (q: number, gem = false): Seg => ({ k: 'needle', q, gem });
const S = (q: number, gem = false): Seg => ({ k: 'slalom', q, gem });
const B = (q: number, gem = false): Seg => ({ k: 'bars', q, gem });
const T = (q: number, gem = false): Seg => ({ k: 'steps', q, gem });
/** Rhythm crux of level n (1-based): leg climb from RHYTHM_LEG, width from CRUX_Q. */
const R = (n: number, gem = false): Seg => ({ k: 'rhythm', q: CRUX_Q[n - 1]!, leg: RHYTHM_LEG[n - 1]!, gem });
/** Crux needle of level n. */
const X = (n: number): Seg => ({ k: 'needle', q: CRUX_Q[n - 1]! });
const SP = (q: number, gem = false): Seg => ({ k: 'split', q, gem });
const LZ = (q: number, gem = false): Seg => ({ k: 'laser', q, gem });
const SN = (q: number, gem = false): Seg => ({ k: 'spin', q, gem });
const PI = (q: number, gem = false): Seg => ({ k: 'piston', q, gem });
const WN = (q: number, gem = false): Seg => ({ k: 'wind', q, gem });
const PO = (q: number, gem = false): Seg => ({ k: 'portal', q, gem });
const MI = (q: number, gem = false): Seg => ({ k: 'mirror', q, gem });
const dk = (seg: Seg): Seg => ({ ...seg, dark: true });
/** Twist chamber: the open twists ease out, then these ease in. UT = back to the normal view. */
const TW = (...tw: TwistSpec[]): Seg => ({ k: 'twist', tw });
const UT: Seg = { k: 'twist', tw: [] };
const dive: TwistSpec = { kind: 'dive' };
const side: TwistSpec = { kind: 'side' };
const tilt = (deg: number): TwistSpec => ({ kind: 'tilt', amount: deg });
const rock = (deg: number): TwistSpec => ({ kind: 'rock', amount: deg });
const far = (zoom = 0.8): TwistSpec => ({ kind: 'far', amount: zoom });
const near = (zoom = 1.22): TwistSpec => ({ kind: 'near', amount: zoom });

/**
 * Crux difficulty per level. Each level's hardest stretch is a needle (sets the safety margin)
 * and a zigzag (sets the reaction window) at this q, three quarters of the way in; every other
 * stretch stays below it, more so inside fast, mini and flip stretches.
 */
export const CRUX_Q = [
  0.08, 0.18, 0.28, 0.37, 0.46, 0.54, 0.6, 0.66, 0.72, 0.78,
  0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.66, 0.72, 0.78, 0.84,
  0.4, 0.45, 0.51, 0.57, 0.63, 0.69, 0.74, 0.79, 0.84, 0.89,
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.94,
  0.53, 0.59, 0.64, 0.69, 0.74, 0.79, 0.835, 0.88, 0.92, 0.95,
] as const;
/** Vertical leg of each level's rhythm crux (px): the turn interval is leg / speed. */
export const RHYTHM_LEG = [
  256, 240, 224, 208, 192, 176, 166, 158, 150, 142,
  175, 169, 162, 155, 148, 140, 132, 124, 115, 106,
  165, 159, 153, 147, 140, 133, 125, 118, 109, 103,
  159, 153, 147, 141, 135, 128, 120, 113, 105, 99,
  158, 153, 147, 141, 134, 127, 120, 112, 105, 96,
] as const;

const LEVELS: LevelInfo[] = [
  // 1 · first contact: wide shafts, slow zigzags, one easy slalom. No gates.
  { id: 1, world: 1, boss: false, intro: null, twists: [], speed: 470, theme: 0, segs: [O, D(0), W(0, true), Z(0), D(0), S(0), W(0.05), D(0, true), S(0.02), Z(0.02), N(0.08), D(0), R(1, true), D(0)] },
  // 2 · speed gates, slow first (alone, in an easy stretch); bars appear.
  { id: 2, world: 1, boss: false, intro: null, twists: [], speed: 485, theme: 1, segs: [O, Z(0.06), G('slow'), D(0.1), W(0.1, true), Z(0.08), G('normal'), S(0.1), B(0), N(0.16), S(0.12, true), N(0.18), D(0), R(2, true), D(0.1)] },
  // 3 · mini gate alone in easy ground; first fast stretch.
  { id: 3, world: 1, boss: false, intro: null, twists: [], speed: 500, theme: 2, segs: [O, Z(0.18), B(0.15), G('mini'), D(0.1), W(0, true), G('big'), S(0.2), N(0.2), G('fast'), D(0), W(0), G('normal'), W(0.1, true), N(0.26), B(0.2), N(0.28), D(0), R(3, true), D(0.15)] },
  // 4 · flip gate alone; then mini again.
  { id: 4, world: 1, boss: false, intro: null, twists: [], speed: 510, theme: 3, segs: [O, Z(0.28), G('flip'), D(0.1), W(0.1, true), Z(0.15), G('unflip'), B(0.3), N(0.3), G('mini'), W(0.05), S(0.1), G('big'), W(0.15, true), S(0.3), N(0.37), D(0), R(4, true), D(0.2)] },
  // 5 · combinations begin.
  { id: 5, world: 1, boss: false, intro: null, twists: [], speed: 525, theme: 4, segs: [O, Z(0.36), B(0.35), G('fast'), W(0.1), D(0.15, true), G('normal'), N(0.38), G('flip'), Z(0.25), G('unflip'), S(0.38), G('mini'), Z(0.08, true), B(0.3), G('big'), N(0.46), D(0), R(5, true), D(0.3)] },
  { id: 6, world: 1, boss: false, intro: null, twists: [], speed: 540, theme: 5, segs: [O, Z(0.45), G('slow'), N(0.45, true), Z(0.45), G('normal'), B(0.45), G('flip'), T(0.3), Z(0.4, true), G('unflip'), G('mini'), W(0.2), S(0.3), G('big'), G('fast'), D(0.2), G('normal'), N(0.54), D(0), R(6, true), D(0.4)] },
  { id: 7, world: 1, boss: false, intro: null, twists: [], speed: 555, theme: 6, segs: [O, Z(0.42), B(0.5), G('flip'), S(0.3, true), Z(0.35), G('unflip'), N(0.42), G('fast'), W(0.3), G('normal'), G('mini'), Z(0.2, true), G('big'), T(0.4), S(0.38), N(0.6), D(0), R(7, true), D(0.5)] },
  { id: 8, world: 1, boss: false, intro: null, twists: [], speed: 570, theme: 7, segs: [O, Z(0.45), S(0.4), G('mini'), W(0.15, true), W(0.2), G('big'), N(0.25), G('fast'), W(0.35), D(0.35), G('normal'), G('flip'), S(0.38, true), Z(0.42), T(0.5), G('unflip'), B(0.6), N(0.66), D(0), R(8, true), D(0.6)] },
  { id: 9, world: 1, boss: false, intro: null, twists: [], speed: 585, theme: 8, segs: [O, Z(0.5), B(0.65), G('flip'), S(0.3, true), T(0.6), G('unflip'), G('mini'), Z(0.2), G('big'), G('fast'), W(0.3), D(0.4), G('normal'), N(0.5, true), S(0.4), G('mini'), B(0.55), G('big'), N(0.72), D(0), R(9, true), D(0.7)] },
  { id: 10, world: 1, boss: true, intro: null, twists: [], speed: 600, theme: 9, segs: [O, Z(0.55), S(0.35), G('fast'), B(0.3, true), G('normal'), G('flip'), W(0.4), T(0.6), G('unflip'), G('mini'), Z(0.35, true), G('big'), S(0.4), G('fast'), W(0.4), G('normal'), N(0.78), D(0), R(10, true), B(0.8), D(0.8)] },
];


type Def = [speed: number, intro: Mechanic | null, segs: Seg[]];

/** Worlds 2-4: [speed, mechanic introduced, segments]. Crux = X(id) + R(id) near the end. */
const MORE: Def[] = [
  // ── World 2 · Prism Works: split paths, lasers on the beat, spinners ──
  /* 11 */ [500, 'split', [O, D(0.1), SP(0, true), W(0.1), SP(0.1), Z(0.3), SP(0.2, true), S(0.25), D(0), X(11), D(0), R(11, true), D(0.2)]],
  /* 12 */ [510, null, [O, Z(0.35), SP(0.3, true), B(0.3), SP(0.4), G('fast'), W(0.2), G('normal'), N(0.3, true), S(0.4), D(0), X(12), D(0), R(12, true), D(0.3)]],
  /* 13 */ [520, 'laser', [O, D(0.2), LZ(0, true), W(0.2), LZ(0.1), SP(0.3), Z(0.35, true), LZ(0.25), D(0), X(13), D(0), R(13, true), D(0.3)]],
  /* 14 */ [530, null, [O, Z(0.4), LZ(0.35), SP(0.4, true), G('flip'), W(0.2), G('unflip'), LZ(0.4, true), B(0.4), D(0), X(14), D(0), R(14, true), D(0.35)]],
  /* 15 */ [540, null, [O, SP(0.45), LZ(0.5, true), G('mini'), W(0.1), G('big'), S(0.45), Z(0.45, true), LZ(0.5), D(0), X(15), D(0), R(15, true), D(0.4)]],
  /* 16 */ [550, 'spin', [O, W(0.2), D(0.2), SN(0, true), W(0.25), SN(0.1), LZ(0.4), SN(0.25, true), SP(0.4), D(0), X(16), D(0), R(16, true), D(0.4)]],
  /* 17 */ [560, null, [O, W(0.2), SN(0.4), SP(0.5, true), LZ(0.55), G('fast'), W(0.3), G('normal'), SN(0.45, true), B(0.5), D(0), X(17), D(0), R(17, true), D(0.5)]],
  /* 18 */ [570, null, [O, LZ(0.6), SN(0.5, true), G('flip'), SP(0.4), G('unflip'), Z(0.5), SN(0.55), LZ(0.6, true), D(0), X(18), D(0), R(18, true), D(0.5)]],
  /* 19 */ [580, null, [O, SP(0.6), SN(0.6, true), LZ(0.65), G('mini'), Z(0.3), G('big'), SN(0.6), SP(0.6, true), D(0), X(19), D(0), R(19, true), D(0.6)]],
  /* 20 */ [590, null, [O, LZ(0.6), SN(0.6), G('fast'), W(0.35), G('normal'), SP(0.6, true), LZ(0.8), SN(0.8, true), G('flip'), W(0.3), G('unflip'), SP(0.7), D(0), X(20), D(0), R(20, true), LZ(0.75), D(0.7)]],
  // ── World 3 · Storm Spire: wind, moving walls, dark sections ──
  /* 21 */ [515, 'wind', [O, D(0.2), WN(0, true), W(0.3), WN(0.1), SP(0.4), WN(0.25, true), LZ(0.4), D(0), X(21), D(0), R(21, true), D(0.4)]],
  /* 22 */ [525, null, [O, WN(0.35), SN(0.45, true), LZ(0.45), WN(0.4), G('fast'), W(0.3), G('normal'), SP(0.5, true), D(0), X(22), D(0), R(22, true), D(0.4)]],
  /* 23 */ [535, 'piston', [O, D(0.25), PI(0, true), W(0.3), PI(0.15), WN(0.4), PI(0.3, true), SN(0.45), D(0), X(23), D(0), R(23, true), D(0.45)]],
  /* 24 */ [545, null, [O, PI(0.45), WN(0.45, true), G('flip'), W(0.25), G('unflip'), PI(0.5), LZ(0.5, true), SP(0.5), D(0), X(24), D(0), R(24, true), D(0.5)]],
  /* 25 */ [555, null, [O, WN(0.5), PI(0.55, true), SN(0.5), G('mini'), W(0.15), G('big'), PI(0.55), WN(0.5, true), D(0), X(25), D(0), R(25, true), D(0.5)]],
  /* 26 */ [565, 'dark', [O, D(0.25), dk(W(0, true)), Z(0.4), dk(Z(0.3)), PI(0.5), dk(S(0.35, true)), WN(0.5), D(0), X(26), D(0), R(26, true), D(0.5)]],
  /* 27 */ [575, null, [O, W(0.2), dk(PI(0.55)), WN(0.55, true), dk(LZ(0.55)), SN(0.55), G('fast'), W(0.3), G('normal'), dk(SP(0.55, true)), D(0), X(27), D(0), R(27, true), D(0.55)]],
  /* 28 */ [585, null, [O, PI(0.6), dk(WN(0.55, true)), G('flip'), dk(Z(0.4)), G('unflip'), SN(0.6), dk(PI(0.6, true)), LZ(0.6), D(0), X(28), D(0), R(28, true), D(0.6)]],
  /* 29 */ [595, null, [O, W(0.2), dk(SN(0.6)), WN(0.65, true), PI(0.65), G('mini'), dk(W(0.2)), G('big'), dk(LZ(0.65, true)), SP(0.65), D(0), X(29), D(0), R(29, true), D(0.65)]],
  /* 30 */ [605, null, [O, WN(0.65), PI(0.65, true), dk(SN(0.65)), G('fast'), W(0.35), G('normal'), dk(PI(0.7, true)), WN(0.7), LZ(0.7), D(0), X(30), D(0), R(30, true), dk(PI(0.75)), D(0.7)]],
  // ── World 4 · Void Gate: portals, the mirror twin ──
  /* 31 */ [530, 'portal', [O, W(0.2), D(0.3), PO(0, true), W(0.3), PO(0.15), SN(0.5), PO(0.3, true), WN(0.5), D(0), X(31), D(0), R(31, true), D(0.5)]],
  /* 32 */ [540, null, [O, PO(0.45), PI(0.55, true), LZ(0.55), PO(0.5), G('fast'), W(0.35), G('normal'), dk(SP(0.55, true)), D(0), X(32), D(0), R(32, true), D(0.55)]],
  /* 33 */ [550, null, [O, WN(0.55), PO(0.55, true), dk(SN(0.55)), G('flip'), W(0.3), G('unflip'), PO(0.6), PI(0.6, true), D(0), X(33), D(0), R(33, true), D(0.55)]],
  /* 34 */ [560, 'mirror', [O, D(0.3), MI(0, true), W(0.3), MI(0.15), PO(0.55), MI(0.3, true), LZ(0.6), D(0), X(34), D(0), R(34, true), D(0.6)]],
  /* 35 */ [570, null, [O, MI(0.45), PO(0.6, true), WN(0.6), MI(0.5), G('mini'), W(0.2), G('big'), dk(PI(0.6, true)), D(0), X(35), D(0), R(35, true), D(0.6)]],
  /* 36 */ [580, null, [O, W(0.2), dk(MI(0.5)), SN(0.6, true), PO(0.65), G('fast'), W(0.35), G('normal'), MI(0.55), LZ(0.65, true), D(0), X(36), D(0), R(36, true), D(0.65)]],
  /* 37 */ [590, null, [O, PO(0.65), MI(0.6, true), dk(WN(0.65)), PI(0.65), G('flip'), W(0.3), G('unflip'), MI(0.6, true), D(0), X(37), D(0), R(37, true), D(0.65)]],
  /* 38 */ [600, null, [O, MI(0.65), dk(PO(0.65, true)), SN(0.65), WN(0.7), G('mini'), Z(0.35), G('big'), dk(MI(0.65, true)), D(0), X(38), D(0), R(38, true), D(0.7)]],
  /* 39 */ [610, null, [O, W(0.2), dk(PI(0.7)), MI(0.7, true), PO(0.7), LZ(0.7), G('fast'), W(0.4), G('normal'), dk(MI(0.7)), SN(0.7, true), D(0), X(39), D(0), R(39, true), D(0.7)]],
  /* 40 */ [620, null, [O, MI(0.65), PO(0.6, true), dk(WN(0.62)), PI(0.7), G('fast'), W(0.4), G('normal'), dk(MI(0.75, true)), SN(0.75), LZ(0.75), D(0), X(40), D(0), R(40, true), dk(PO(0.75)), D(0.75)]],
];

for (const [i, [speed, intro, segs]] of MORE.entries()) {
  const id = 11 + i;
  const w = worldOf(id);
  LEVELS.push({ id, world: w, boss: isBoss(id), intro, twists: [], speed, theme: (i % 10 + 3 * (w - 1)) % 10, segs });
}

/** World 5 · Vortex: [speed, twists introduced, segments]. Palettes 10-19 are its own. */
const VORTEX: [speed: number, twists: TwistKind[], segs: Seg[]][] = [
  /* 41 */ [540, ['dive'], [O, TW(dive), D(0, true), W(0.25), UT, Z(0.35), TW(dive), S(0.3, true), W(0.3), UT, D(0), X(41), D(0), R(41, true), D(0.4)]],
  /* 42 */ [550, ['tilt', 'rock'], [O, TW(tilt(8)), W(0, true), Z(0.3), UT, SP(0.4), TW(rock(6)), S(0.35, true), LZ(0.3), UT, D(0), X(42), D(0), R(42, true), D(0.4)]],
  /* 43 */ [560, ['far', 'near'], [O, TW(far()), W(0, true), PI(0.4), UT, G('slow'), TW(near()), S(0, true), UT, G('normal'), WN(0.4), D(0), X(43), D(0), R(43, true), D(0.45)]],
  /* 44 */ [570, ['side'], [O, TW(side), D(0, true), W(0.2), Z(0.3), UT, SN(0.45), TW(side), S(0.4, true), UT, D(0), X(44), D(0), R(44, true), D(0.5)]],
  /* 45 */ [580, [], [O, TW(dive), SP(0.5, true), LZ(0.5), UT, PO(0.5), TW(dive, tilt(-6)), SN(0.5, true), W(0.3), UT, D(0), X(45), D(0), R(45, true), D(0.5)]],
  /* 46 */ [590, [], [O, TW(rock(7)), PI(0.55, true), WN(0.55), TW(far()), MI(0.55, true), UT, dk(Z(0.45)), D(0), X(46), D(0), R(46, true), D(0.55)]],
  /* 47 */ [600, [], [O, TW(side), LZ(0.55), SP(0.55, true), TW(dive), PI(0.6), UT, G('slow'), TW(near()), S(0.5, true), UT, G('normal'), D(0), X(47), D(0), R(47, true), D(0.55)]],
  /* 48 */ [610, [], [O, TW(dive, rock(6)), SN(0.6, true), PO(0.6), TW(side), WN(0.6), LZ(0.6, true), UT, dk(PI(0.6)), D(0), X(48), D(0), R(48, true), D(0.6)]],
  /* 49 */ [620, [], [O, TW(far(), tilt(-8)), MI(0.65, true), dk(SN(0.65)), TW(side), SP(0.65, true), PI(0.65), TW(dive), LZ(0.7), UT, D(0), X(49), D(0), R(49, true), D(0.65)]],
  /* 50 */ [630, [], [O, TW(dive), MI(0.75), PO(0.7, true), TW(side), PI(0.75), UT, G('fast'), W(0.45), G('normal'), TW(dive, tilt(10)), dk(MI(0.75, true)), SN(0.75), UT, D(0), X(50), D(0), R(50, true), LZ(0.8), D(0.75)]],
];

for (const [i, [speed, twists, segs]] of VORTEX.entries()) {
  const id = 41 + i;
  LEVELS.push({ id, world: 5, boss: isBoss(id), intro: null, twists, speed, theme: 10 + i, segs });
}

export function levelInfo(id: number): LevelInfo {
  const info = LEVELS[id - 1];
  if (!info) throw new Error(`no level ${id}`);
  return info;
}

/** A level's segment with the stretch of the track it was built into. */
export interface SegRange {
  seg: Seg;
  y0: number;
  y1: number;
}

/** Build a level and report where each of its segments lies (tests, cues). */
export function buildLevelParts(id: number): { track: Track; ranges: SegRange[] } {
  const info = levelInfo(id);
  const rng = createRng(7919 * id);
  const b = new TrackBuilder({ speed: info.speed, startH: OPEN_H, ramp: true });
  const ctx: PatternCtx = { rng, mini: false };
  const ranges: SegRange[] = [];
  for (const seg of info.segs) {
    const y0 = b.y;
    emit(b, seg, ctx);
    ranges.push({ seg, y0, y1: b.y });
  }
  // A twist a level forgot to close ends with the level (tests ask for none).
  for (const t of ctx.open ?? []) t.y1 = b.y;
  b.straight(200, PORT_H);
  return { track: b.finish(), ranges };
}

export function buildLevel(id: number): Track {
  return buildLevelParts(id).track;
}
