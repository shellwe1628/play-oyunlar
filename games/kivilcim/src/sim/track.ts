/**
 * Track geometry and exact signed distances (pure). World y grows upward (distance climbed),
 * x is the logical shaft x (0..720). Negative distance = inside a hazard.
 */
import { CLEAR_CAP, RAMP_PX, RAMP_START } from './constants';

export type GateKind = 'fast' | 'slow' | 'normal' | 'mini' | 'big' | 'flip' | 'unflip';
export type HazardKind = 'wall' | 'block' | 'bar';

/** Spike block: a diamond (square rotated 45°) with half-diagonal s. */
export interface Block {
  x: number;
  y: number;
  s: number;
}

/** Moving bar: horizontal capsule whose centre slides x0 + amp·sin(2πt/period + phase). */
export interface Bar {
  y: number;
  x0: number;
  amp: number;
  period: number;
  phase: number;
  /** Half length of the core segment. */
  half: number;
  /** Capsule radius. */
  thick: number;
}

export interface Gate {
  y: number;
  kind: GateKind;
}

export interface Gem {
  x: number;
  y: number;
}

export interface SpeedProfile {
  /** Scroll speed at y = 0, px/s. */
  base: number;
  /** Added px/s per px climbed (endless creep). */
  creep: number;
  max: number;
  /** Launch ramp over the first RAMP_PX of climb (levels and endless; off in bare test tracks). */
  ramp?: boolean;
}

export interface Track {
  /** y of the finish ring: progress = y / length. */
  length: number;
  /** Wall polylines share one ascending y array: left wall x and right wall x at each vertex. */
  wy: Float64Array;
  lx: Float64Array;
  rx: Float64Array;
  blocks: Block[];
  bars: Bar[];
  gates: Gate[];
  gems: Gem[];
  speed: SpeedProfile;
  startX: number;
}

export function baseSpeed(s: SpeedProfile, y: number): number {
  const v = Math.min(s.max, s.base + s.creep * Math.max(0, y));
  if (s.ramp && y < RAMP_PX) return v * (RAMP_START + ((1 - RAMP_START) * Math.max(0, y)) / RAMP_PX);
  return v;
}

/** Index i with wy[i] <= y < wy[i+1] (clamped to the polyline). */
export function segmentAt(wy: Float64Array, y: number): number {
  let lo = 0;
  let hi = wy.length - 2;
  if (y <= wy[0]!) return 0;
  if (y >= wy[hi + 1]!) return hi;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (wy[mid]! <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Interpolated wall x at y on segment i. */
export function wallXAt(wy: Float64Array, xs: Float64Array, i: number, y: number): number {
  const y0 = wy[i]!;
  const y1 = wy[i + 1]!;
  const x0 = xs[i]!;
  const x1 = xs[i + 1]!;
  if (y1 === y0) return x0;
  const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
  return x0 + (x1 - x0) * t;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const ex = px - (ax + dx * t);
  const ey = py - (ay + dy * t);
  return Math.sqrt(ex * ex + ey * ey);
}

/** Unsigned distance from (px,py) to the polyline (wy, xs), searching segments within cap. */
function polyDist(wy: Float64Array, xs: Float64Array, i: number, px: number, py: number, cap: number): number {
  let best = cap;
  const n = wy.length - 1;
  for (let j = i; j >= 0; j--) {
    if (wy[j + 1]! < py - best) break;
    const d = segDist(px, py, xs[j]!, wy[j]!, xs[j + 1]!, wy[j + 1]!);
    if (d < best) best = d;
  }
  for (let j = i + 1; j < n; j++) {
    if (wy[j]! > py + best) break;
    const d = segDist(px, py, xs[j]!, wy[j]!, xs[j + 1]!, wy[j + 1]!);
    if (d < best) best = d;
  }
  return best;
}

/** Signed distance to a diamond of half-diagonal s centred at (bx, by). Exact. */
export function diamondSdf(px: number, py: number, bx: number, by: number, s: number): number {
  const dx = px - bx;
  const dy = py - by;
  const u = Math.abs((dx + dy) * Math.SQRT1_2);
  const v = Math.abs((dx - dy) * Math.SQRT1_2);
  const a = s * Math.SQRT1_2;
  const qx = u - a;
  const qy = v - a;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0);
}

export function barCentre(bar: Bar, t: number): number {
  return bar.x0 + bar.amp * Math.sin((2 * Math.PI * t) / bar.period + bar.phase);
}

export function barSdf(px: number, py: number, bar: Bar, t: number): number {
  const cx = barCentre(bar, t);
  return segDist(px, py, cx - bar.half, bar.y, cx + bar.half, bar.y) - bar.thick;
}

/** First index in a y-sorted list whose y >= v. */
export function lowerBound(list: readonly { y: number }[], v: number): number {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.y < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const BLOCK_REACH = 80;
const BAR_REACH = 40;

/** Result slot reused by sdf() so the run loop never allocates. */
export interface SdfOut {
  cause: HazardKind;
}

/**
 * Signed distance from (px, py) at sim time t to the nearest hazard, capped at CLEAR_CAP.
 * out.cause receives the hazard kind of the minimum.
 */
export function sdf(track: Track, px: number, py: number, t: number, out?: SdfOut): number {
  const { wy, lx, rx } = track;
  const i = segmentAt(wy, py);
  const lwx = wallXAt(wy, lx, i, py);
  const rwx = wallXAt(wy, rx, i, py);
  let best: number;
  let cause: HazardKind = 'wall';
  // Left wall: solid for x < lwx.
  const dl = polyDist(wy, lx, i, px, py, CLEAR_CAP);
  best = px < lwx ? -dl : dl;
  const dr = polyDist(wy, rx, i, px, py, CLEAR_CAP);
  const sr = px > rwx ? -dr : dr;
  if (sr < best) best = sr;

  const blocks = track.blocks;
  if (blocks.length) {
    for (let k = lowerBound(blocks, py - BLOCK_REACH - best); k < blocks.length; k++) {
      const b = blocks[k]!;
      if (b.y > py + BLOCK_REACH + best) break;
      const d = diamondSdf(px, py, b.x, b.y, b.s);
      if (d < best) {
        best = d;
        cause = 'block';
      }
    }
  }
  const bars = track.bars;
  if (bars.length) {
    for (let k = lowerBound(bars, py - BAR_REACH - best); k < bars.length; k++) {
      const b = bars[k]!;
      if (b.y > py + BAR_REACH + best) break;
      const d = barSdf(px, py, b, t);
      if (d < best) {
        best = d;
        cause = 'bar';
      }
    }
  }
  if (out) out.cause = cause;
  return best;
}
