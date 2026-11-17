/**
 * Search-based autopilot (pure). Because the climb never depends on input, every tick j has a
 * known y, speed, radius, flip state and time (kinematics()). The solver runs a forward dynamic
 * programme over (x bin, input held) per tick, keeping the exact x of one representative per bin,
 * so a found plan replays bit-for-bit in RunSim.
 *
 * Constraints a plan must meet:
 *   - minClear: the spark's edge stays at least this far from every hazard (px)
 *   - minHoldTicks: every press and every release lasts at least this many ticks
 *   - gems (optional): pass through every gem
 * Clearance per (tick, bin) is precomputed at the bin centre; the representative's clearance is
 * bounded from below with the 1-Lipschitz property of the signed distance, so the solver is
 * conservative: what it finds is real (and replay() proves it), what it rejects may be a
 * near-miss solution it could not represent.
 *
 * Difficulty numbers per track:
 *   windowMs  — reaction window: the largest K such that a finishing plan exists in which every
 *               press/release lasts ≥ K (clearance ≥ 0). Smaller = faster inputs forced.
 *   marginPx  — safety margin: the largest clearance a finishing plan can keep everywhere while
 *               holding every input at least K_REF (100 ms). Smaller = more precise steering.
 */
import { DT, GEM_R, MINI_R, SHAFT_W, SPARK_R } from './constants';
import { kinAdvance, kinSpeed, kinStart, RunSim } from './run';
import { sdf, segmentAt, wallXAt, type Track } from './track';

/** Ticks a human can still alternate at: 12 ticks = 100 ms. */
export const K_REF = 12;
const BIN_W = 2;
const BINS = SHAFT_W / BIN_W;

export interface Timeline {
  /** Ticks to the finish. Row j is the state after j ticks (row 0 = start). */
  n: number;
  y: Float64Array;
  t: Float64Array;
  /** Speed used by tick j (row j → j+1). */
  v: Float64Array;
  /** Radius and flip state at row j. */
  r: Float32Array;
  flipped: Uint8Array;
}

export function kinematics(track: Track, maxTicks = Infinity): Timeline {
  const ys: number[] = [0];
  const vs: number[] = [];
  const rs: number[] = [SPARK_R];
  const fs: number[] = [0];
  const k = kinStart();
  while (k.y < track.length && vs.length < maxTicks) {
    const v = kinSpeed(track, k);
    vs.push(v);
    kinAdvance(track, k, v);
    ys.push(k.y);
    rs.push(k.mini ? MINI_R : SPARK_R);
    fs.push(k.flipped ? 1 : 0);
    if (ys.length > 2_000_000) throw new Error('track too long');
  }
  const n = vs.length;
  const t = new Float64Array(n + 1);
  for (let j = 0; j <= n; j++) t[j] = j * DT;
  vs.push(vs[n - 1] ?? 0);
  return { n, y: Float64Array.from(ys), t, v: Float64Array.from(vs), r: Float32Array.from(rs), flipped: Uint8Array.from(fs) };
}

export interface ClearTable {
  /** Lowest/highest bin inside the corridor per row. */
  lo: Int16Array;
  hi: Int16Array;
  /** Signed distance (no radius) at bin centres, row-major [row * BINS + bin]. */
  d: Float32Array;
}

export function clearTable(track: Track, tl: Timeline, fromRow = 0): ClearTable {
  const rows = tl.n + 1;
  const lo = new Int16Array(rows);
  const hi = new Int16Array(rows);
  const d = new Float32Array(rows * BINS);
  for (let j = fromRow; j <= tl.n; j++) {
    const y = tl.y[j]!;
    const i = segmentAt(track.wy, y);
    const l = Math.max(0, Math.floor(wallXAt(track.wy, track.lx, i, y) / BIN_W));
    const h = Math.min(BINS - 1, Math.ceil(wallXAt(track.wy, track.rx, i, y) / BIN_W));
    lo[j] = l;
    hi[j] = h;
    const base = j * BINS;
    const t = tl.t[j]!;
    for (let b = l; b <= h; b++) d[base + b] = sdf(track, (b + 0.5) * BIN_W, y, t);
  }
  return { lo, hi, d };
}

export interface SolveOptions {
  minClear: number;
  minHoldTicks: number;
  gems?: boolean;
  /** Force the input of the first tick (a real run starts with the finger that started it). */
  startHeld?: 0 | 1;
  /**
   * Plan from a mid-run state instead of the start: the spark is at x after `tick` ticks with
   * input `held`, which has just changed (it is kept for minHoldTicks before the next change).
   * Ticks before `tick` are filled with `held` in the result.
   */
  from?: { tick: number; x: number; held: 0 | 1; since?: number };
  /**
   * Comfort line: among feasible plans prefer the one with the largest sum of clearance (capped
   * at `cap` px per tick), minus `switchCost` per input change. This is the line a person flies
   * (the middle, few changes); without it the plan is merely feasible.
   */
  comfort?: { cap: number; switchCost: number };
}

export interface Plan {
  /** Input per tick (1 = held). */
  held: Uint8Array;
}

export interface Prepared {
  track: Track;
  tl: Timeline;
  table: ClearTable;
}

/**
 * Precompute the timeline and the clearance table. A window (fromTick..toTick) limits both, for
 * planning a stretch ahead of a running spark (solve with `from` at fromTick).
 */
export function prepare(track: Track, window: { fromTick?: number; toTick?: number } = {}): Prepared {
  const tl = kinematics(track, window.toTick ?? Infinity);
  return { track, tl, table: clearTable(track, tl, Math.max(0, window.fromTick ?? 0)) };
}

/** Rows at which each gem must be overlapped (closest row to its y), or -1. */
function gemRows(p: Prepared): Int32Array {
  const rows = new Int32Array(p.tl.n + 1).fill(-1);
  const ys = p.tl.y;
  p.track.gems.forEach((g, gi) => {
    let best = -1;
    let bd = Infinity;
    for (let j = 1; j <= p.tl.n; j++) {
      const dd = Math.abs(ys[j]! - g.y);
      if (dd < bd) {
        bd = dd;
        best = j;
      }
    }
    if (best >= 0) rows[best] = gi;
  });
  return rows;
}

/** Row at which the last failed solve() ran out of states (diagnostics). */
export let lastFailRow = -1;

/** Forward DP. Returns a plan meeting the constraints, or null. */
export function solve(track: Track | Prepared, opts: SolveOptions): Plan | null {
  const p = 'table' in track ? track : prepare(track);
  const { tl, table } = p;
  const n = tl.n;
  const K = Math.max(1, opts.minHoldTicks);
  const S = BINS * 2;
  let has = new Uint8Array(S);
  let xs = new Float64Array(S);
  let since = new Int16Array(S);
  let nHas = new Uint8Array(S);
  let nXs = new Float64Array(S);
  let nSince = new Int16Array(S);
  const nClr = new Float32Array(S);
  let score = new Float64Array(S);
  let nScore = new Float64Array(S);
  const comfort = opts.comfort;
  const back = new Int16Array((n + 1) * S).fill(-1);
  const gemAt = opts.gems ? gemRows(p) : null;
  const gems = p.track.gems;
  const d = table.d;

  const from = opts.from;
  const j0 = from ? Math.min(n, Math.max(0, from.tick)) : 0;
  const x0 = from ? from.x : p.track.startX;
  const b0 = Math.floor(x0 / BIN_W);
  for (let hb = 0; hb < 2; hb++) {
    if (from && hb !== from.held) continue;
    has[b0 * 2 + hb] = 1;
    xs[b0 * 2 + hb] = x0;
    since[b0 * 2 + hb] = from ? Math.min(K, Math.max(1, from.since ?? 1)) : K;
  }
  let curLo = b0;
  let curHi = b0;

  for (let j = j0; j < n; j++) {
    const v = tl.v[j]! * DT;
    const flip = tl.flipped[j]!;
    const r1 = tl.r[j + 1]!;
    const lo1 = table.lo[j + 1]!;
    const hi1 = table.hi[j + 1]!;
    const base1 = (j + 1) * BINS;
    const gi = gemAt ? gemAt[j + 1]! : -1;
    const g = gi >= 0 ? gems[gi]! : null;
    const gy = g ? g.y - tl.y[j + 1]! : 0;
    const gr2 = (r1 + GEM_R - 0.25) * (r1 + GEM_R - 0.25);
    nHas.fill(0, Math.max(0, (lo1 - 1) * 2), Math.min(S, (hi1 + 2) * 2));
    let nLo = BINS;
    let nHi = -1;
    for (let b = curLo; b <= curHi; b++) {
      for (let hb = 0; hb < 2; hb++) {
        const s = b * 2 + hb;
        if (!has[s]) continue;
        const x = xs[s]!;
        const sn = since[s]!;
        for (let c = 0; c < 2; c++) {
          const h2 = c === 0 ? hb : 1 - hb;
          if (j === j0 && opts.startHeld !== undefined && h2 !== opts.startHeld) continue;
          let sn2: number;
          if (h2 === hb) sn2 = sn < K ? sn + 1 : K;
          else {
            if (sn < K) continue;
            sn2 = 1;
          }
          const dir = (h2 === 1) !== (flip === 1) ? 1 : -1;
          const x2 = x + dir * v;
          const b2 = Math.floor(x2 / BIN_W);
          if (b2 < lo1 || b2 > hi1) continue;
          const off = x2 - (b2 + 0.5) * BIN_W;
          const aoff = off < 0 ? -off : off;
          const dc = d[base1 + b2]!;
          let clr = dc - aoff - r1;
          if (clr < opts.minClear) {
            // The 1-Lipschitz bound failed; only if the true value could still pass, compute it.
            if (dc + aoff - r1 < opts.minClear) continue;
            clr = sdf(p.track, x2, tl.y[j + 1]!, tl.t[j + 1]!) - r1;
            if (clr < opts.minClear) continue;
          }
          if (g) {
            const gx = g.x - x2;
            if (gx * gx + gy * gy >= gr2) continue;
          }
          const s2 = b2 * 2 + h2;
          let sc = 0;
          if (comfort) {
            sc = score[s]! + Math.min(clr, comfort.cap) - (h2 !== hb ? comfort.switchCost : 0);
            if (nHas[s2] && nScore[s2]! >= sc) continue;
          } else if (nHas[s2] && (nSince[s2]! > sn2 || (nSince[s2] === sn2 && nClr[s2]! >= clr))) continue;
          nHas[s2] = 1;
          nClr[s2] = clr;
          nScore[s2] = sc;
          nXs[s2] = x2;
          nSince[s2] = sn2;
          back[base1 * 2 + s2] = s;
          if (b2 < nLo) nLo = b2;
          if (b2 > nHi) nHi = b2;
        }
      }
    }
    if (nHi < 0) {
      lastFailRow = j + 1;
      return null;
    }
    // Clear stale entries of the old arrays outside the new range before swapping.
    has.fill(0);
    [has, nHas] = [nHas, has];
    [xs, nXs] = [nXs, xs];
    [since, nSince] = [nSince, since];
    [score, nScore] = [nScore, score];
    curLo = nLo;
    curHi = nHi;
  }

  // Any surviving state at the finish row; walk back.
  let s = -1;
  for (let b = curLo; b <= curHi; b++) {
    for (let hb = 0; hb < 2; hb++) {
      const k = b * 2 + hb;
      if (!has[k]) continue;
      if (s < 0 || (comfort && score[k]! > score[s]!)) s = k;
    }
    if (s >= 0 && !comfort) break;
  }
  if (s < 0) return null;
  const held = new Uint8Array(n);
  for (let j = n; j > j0; j--) {
    held[j - 1] = s & 1;
    s = back[j * BINS * 2 + s]!;
    if (s < 0 && j > j0 + 1) return null;
  }
  if (from) held.fill(from.held, 0, j0);
  return { held };
}

export interface ReplayResult {
  finished: boolean;
  ticks: number;
  progress: number;
  minClear: number;
  /** Shortest press or release in the run, ticks (the first and last stretches excluded). */
  minInterval: number;
  gems: number;
}

/** Play an input timeline through the real RunSim. */
export function replay(track: Track, held: ArrayLike<number>): ReplayResult {
  const sim = new RunSim(track);
  let minClear = Infinity;
  let last = -1;
  let prev = held.length ? held[0]! : 0;
  let minInterval = Infinity;
  for (let j = 0; j < held.length && sim.alive && !sim.finished; j++) {
    const h = held[j]!;
    if (j > 0 && h !== prev) {
      if (last >= 0) minInterval = Math.min(minInterval, j - last);
      last = j;
      prev = h;
    }
    sim.step(h === 1);
    if (sim.alive) minClear = Math.min(minClear, sim.clearance);
  }
  return { finished: sim.finished, ticks: sim.tick, progress: sim.progress, minClear, minInterval, gems: sim.gemsTaken };
}

/** Reaction window in ms (largest feasible minimum hold, clearance ≥ 0). 0 if unsolvable. */
export function reactionWindow(track: Track | Prepared, maxTicks = 240): number {
  const p = 'table' in track ? track : prepare(track);
  if (!solve(p, { minClear: 0, minHoldTicks: 1 })) return 0;
  let lo = 1;
  let hi = maxTicks;
  if (solve(p, { minClear: 0, minHoldTicks: hi })) return (hi * 1000) / 120;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (solve(p, { minClear: 0, minHoldTicks: mid })) lo = mid;
    else hi = mid;
  }
  return (lo * 1000) / 120;
}

/** Safety margin in px (largest feasible minimum clearance at K_REF holds), to 0.25 px. -1 if unsolvable. */
export function safetyMargin(track: Track | Prepared): number {
  const p = 'table' in track ? track : prepare(track);
  if (!solve(p, { minClear: 0, minHoldTicks: K_REF })) return -1;
  let lo = 0;
  let hi = 200;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    if (solve(p, { minClear: mid, minHoldTicks: K_REF })) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface Analysis {
  marginPx: number;
  windowMs: number;
  /** Max-margin plan (the autopilot timeline). */
  plan: Plan;
  /** A finishing plan that takes every gem (null if none was found). */
  gemPlan: Plan | null;
  ticks: number;
}

export function analyse(track: Track): Analysis {
  const p = prepare(track);
  const marginPx = safetyMargin(p);
  if (marginPx < 0) throw new Error('track is not completable');
  const windowMs = reactionWindow(p);
  const plan = solve(p, { minClear: marginPx, minHoldTicks: K_REF })!;
  const gemPlan = solve(p, { minClear: 0, minHoldTicks: K_REF, gems: true });
  return { marginPx, windowMs, plan, gemPlan, ticks: p.tl.n };
}

/** Ticks at which the input changes (for compact storage / real-touch replays). */
export function switchTicks(held: ArrayLike<number>): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let j = 0; j < held.length; j++) {
    if (held[j] !== prev) out.push(j);
    prev = held[j]!;
  }
  return out;
}
