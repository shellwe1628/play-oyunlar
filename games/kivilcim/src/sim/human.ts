/**
 * A closed-loop "human" player model (pure), used to tune the levels for people, not for the
 * solver. It knows the line it wants to fly (a solver plan: the level is in view ahead), but:
 *  - it commits to each input change REACT_S before it happens, from what it sees at that
 *    moment: its sideways offset from the line, which it corrects by switching earlier or later;
 *  - every change lands with uniform timing noise of ±NOISE_S;
 *  - it cannot correct an error faster than its reaction time.
 */
import type { Rng } from '@oyun/core/pure';
import { DT, TICK_HZ } from './constants';
import { RunSim } from './run';
import type { Track } from './track';

export const REACT_S = 0.25;
export const NOISE_S = 0.04;
/** Largest correction a player makes to one switch (s). */
const MAX_CORRECTION_S = 0.15;

export interface Reference {
  held: Uint8Array;
  /** Planned x after j ticks (row j). */
  x: Float64Array;
  /** Planned direction during tick j. */
  dir: Int8Array;
  /** Ticks at which the planned input changes. */
  switches: number[];
}

/** Replay a plan and keep its line. */
export function reference(track: Track, held: Uint8Array): Reference {
  const sim = new RunSim(track);
  const x = new Float64Array(held.length + 1);
  const dir = new Int8Array(held.length);
  x[0] = sim.x;
  for (let j = 0; j < held.length; j++) {
    sim.step(held[j] === 1);
    dir[j] = sim.dir;
    x[j + 1] = sim.x;
  }
  const switches: number[] = [];
  for (let j = 1; j < held.length; j++) if (held[j] !== held[j - 1]) switches.push(j);
  return { held, x, dir, switches };
}

export interface HumanOptions {
  rng: Rng;
  reactS?: number;
  noiseS?: number;
  /** Diagnostics: called every tick with the offset from the line. */
  onTick?: (tick: number, offset: number) => void;
}

export interface HumanResult {
  finished: boolean;
  progress: number;
}

/** One attempt by the model. */
export function humanAttempt(track: Track, ref: Reference, opts: HumanOptions): HumanResult {
  const react = Math.round((opts.reactS ?? REACT_S) * TICK_HZ);
  const noise = (opts.noiseS ?? NOISE_S) * TICK_HZ;
  const maxCorr = MAX_CORRECTION_S * TICK_HZ;
  const sim = new RunSim(track);
  const S = ref.switches;
  const actual: number[] = [];
  const planned: number[] = [];
  const before: number[] = [];
  let committed = 0;
  let applied = 0;
  let input = ref.held[0] === 1;
  const n = ref.held.length;
  for (let j = 0; j < n + 2 * TICK_HZ && sim.alive && !sim.finished; j++) {
    while (committed < S.length && j >= S[committed]! - react) {
      const s = S[committed]!;
      const v2 = 2 * sim.speed * DT;
      // What the player sees now, plus what its already-committed switches will still do.
      let predicted = sim.x - (ref.x[Math.min(j, n)] ?? sim.x);
      for (let c = actual.length - 1; c >= 0; c--) {
        const a = actual[c]!;
        const p = planned[c]!;
        const end = Math.max(a, p);
        if (end <= j) break;
        const len = end - Math.max(j, Math.min(a, p));
        predicted += (a < p ? -1 : 1) * v2 * before[c]! * len;
      }
      const d0 = ref.dir[s - 1] ?? 1;
      let corr = (predicted * d0) / v2;
      corr = Math.max(-maxCorr, Math.min(maxCorr, corr));
      const t = s - corr + opts.rng.range(-noise, noise);
      const prev = actual.length ? actual[actual.length - 1]! + 1 : 0;
      actual.push(Math.max(j, prev, Math.round(t)));
      planned.push(s);
      before.push(d0);
      committed++;
    }
    while (applied < actual.length && actual[applied]! <= j) {
      input = !input;
      applied++;
    }
    sim.step(input);
    opts.onTick?.(j, sim.x - (ref.x[Math.min(j + 1, n)] ?? sim.x));
  }
  return { finished: sim.finished, progress: sim.progress };
}

/** Finish rate of the model over `attempts` seeded attempts. */
export function humanRate(track: Track, ref: Reference, attempts: number, rng: Rng): { rate: number; meanProgress: number } {
  let fin = 0;
  let prog = 0;
  for (let a = 0; a < attempts; a++) {
    const r = humanAttempt(track, ref, { rng });
    if (r.finished) fin++;
    prog += r.progress;
  }
  return { rate: fin / attempts, meanProgress: prog / attempts };
}
