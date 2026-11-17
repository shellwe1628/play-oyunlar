/**
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
import { emit, PORT_H, type Seg } from './patterns';
import type { Track } from './track';

export const LEVEL_COUNT = 10;

export interface LevelInfo {
  id: number;
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

/**
 * Crux difficulty per level. Each level's hardest stretch is a needle (sets the safety margin)
 * and a zigzag (sets the reaction window) at this q, three quarters of the way in; every other
 * stretch stays below it, more so inside fast, mini and flip stretches.
 */
export const CRUX_Q = [0.08, 0.18, 0.28, 0.37, 0.46, 0.55, 0.64, 0.73, 0.83, 0.93] as const;
/** Vertical leg of each level's rhythm crux (px): the turn interval is leg / speed. */
export const RHYTHM_LEG = [256, 240, 224, 208, 192, 176, 166, 158, 150, 142] as const;

const LEVELS: LevelInfo[] = [
  // 1 · first contact: wide shafts, slow zigzags, one easy slalom. No gates.
  { id: 1, speed: 470, theme: 0, segs: [O, D(0), W(0, true), Z(0), D(0), S(0), W(0.05), D(0, true), S(0.02), Z(0.02), N(0.08), D(0), R(1, true), D(0)] },
  // 2 · speed gates, slow first (alone, in an easy stretch); bars appear.
  { id: 2, speed: 485, theme: 1, segs: [O, Z(0.06), G('slow'), D(0.1), W(0.1, true), Z(0.08), G('normal'), S(0.1), B(0), N(0.1), S(0.12, true), N(0.18), D(0), R(2, true), D(0.1)] },
  // 3 · mini gate alone in easy ground; first fast stretch.
  { id: 3, speed: 500, theme: 2, segs: [O, Z(0.18), B(0.15), G('mini'), D(0.1), W(0, true), G('big'), S(0.2), N(0.2), G('fast'), D(0), W(0), G('normal'), W(0.1, true), B(0.2), N(0.28), D(0), R(3, true), D(0.15)] },
  // 4 · flip gate alone; then mini again.
  { id: 4, speed: 510, theme: 3, segs: [O, Z(0.28), G('flip'), D(0.1), W(0.1, true), Z(0.15), G('flip'), B(0.3), N(0.3), G('mini'), W(0.05), S(0.1), G('big'), W(0.15, true), S(0.3), N(0.37), D(0), R(4, true), D(0.2)] },
  // 5 · combinations begin.
  { id: 5, speed: 525, theme: 4, segs: [O, Z(0.36), B(0.35), G('fast'), W(0.1), D(0.15, true), G('normal'), N(0.38), G('flip'), Z(0.25), G('flip'), S(0.38), G('mini'), Z(0.08, true), B(0.3), G('big'), N(0.46), D(0), R(5, true), D(0.3)] },
  { id: 6, speed: 540, theme: 5, segs: [O, Z(0.45), G('slow'), N(0.45, true), Z(0.45), G('normal'), B(0.45), G('flip'), T(0.3), Z(0.4, true), G('flip'), G('mini'), W(0.2), S(0.3), G('big'), G('fast'), D(0.2), G('normal'), N(0.55), D(0), R(6, true), D(0.4)] },
  { id: 7, speed: 555, theme: 6, segs: [O, Z(0.54), B(0.55), G('flip'), S(0.5, true), Z(0.48), G('flip'), N(0.56), G('fast'), W(0.3), G('normal'), G('mini'), Z(0.25, true), G('big'), T(0.4), S(0.58), N(0.64), D(0), R(7, true), D(0.5)] },
  { id: 8, speed: 570, theme: 7, segs: [O, Z(0.62), S(0.62), G('mini'), N(0.3, true), W(0.2), G('big'), G('fast'), W(0.4), D(0.35), G('normal'), G('flip'), S(0.6, true), Z(0.58), T(0.5), G('flip'), B(0.65), N(0.73), D(0), R(8, true), D(0.6)] },
  { id: 9, speed: 585, theme: 8, segs: [O, Z(0.72), B(0.72), G('flip'), S(0.7, true), T(0.6), G('mini'), Z(0.45), G('big'), G('flip'), G('fast'), W(0.3), D(0.4), G('normal'), N(0.76, true), S(0.75), G('mini'), B(0.6), G('big'), N(0.83), D(0), R(9, true), D(0.7)] },
  { id: 10, speed: 600, theme: 9, segs: [O, Z(0.82), S(0.82), G('fast'), B(0.3, true), G('normal'), G('flip'), N(0.8), T(0.7), G('mini'), Z(0.6, true), G('big'), G('flip'), S(0.85), G('fast'), W(0.4), G('normal'), N(0.93), D(0), R(10, true), B(0.9), D(0.8)] },
];

export function levelInfo(id: number): LevelInfo {
  const info = LEVELS[id - 1];
  if (!info) throw new Error(`no level ${id}`);
  return info;
}

export function buildLevel(id: number): Track {
  const info = levelInfo(id);
  const rng = createRng(7919 * id);
  const b = new TrackBuilder({ speed: info.speed, startH: 300 });
  const ctx = { rng, mini: false };
  for (const seg of info.segs) emit(b, seg, ctx);
  b.straight(200, PORT_H);
  return b.finish();
}
