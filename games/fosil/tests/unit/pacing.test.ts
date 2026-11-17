import { describe, expect, it } from 'vitest';
import { at } from '../../src/sim/data';
import { median, runPolicy, type PacingMetrics, type Profile } from './policy';

const seeds = (n: number): number[] => Array.from({ length: Number(process.env.PACING_SEEDS ?? n) }, (_, i) => i + 1);
const min = (s: number | null | undefined): number => (s === null || s === undefined ? Infinity : s / 60);
const pct = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * q))] ?? Infinity;

function summary(profile: Profile, runs: PacingMetrics[]): string {
  const col = (f: (r: PacingMetrics) => number) => {
    const xs = runs.map(f);
    return `med ${median(xs).toFixed(1)} [${Math.min(...xs).toFixed(1)}–${Math.max(...xs).toFixed(1)}]`;
  };
  return [
    `${profile}: L1 set ${col((r) => min(r.l1SetAt))}`,
    `  L2 ${col((r) => min(r.unlockAt[1]))}  L3 ${col((r) => min(r.unlockAt[2]))}  L4 ${col((r) => min(r.unlockAt[3]))}`,
    `  first 1 in 10,000+ ${col((r) => min(r.first10kAt))} (none in 40 min: ${runs.filter((r) => r.first10kAt === null).length}/${runs.length})`,
    `  max gap ${col((r) => r.maxGap)} s`,
  ].join('\n');
}

// Fast runs 60 seeds and casual 30: the rare-find timings are exponential waits and noisy.
describe.each(['fast', 'casual'] as const)('pacing: %s player (scripted)', (profile) => {
  const runs: PacingMetrics[] = seeds(profile === 'fast' ? 60 : 30).map((s) => runPolicy(s, 40, profile));
  const t = (f: (r: PacingMetrics) => number | null | undefined) => runs.map((r) => min(f(r)));

  it('prints the measured pacing', () => {
    console.warn(summary(profile, runs));
    if (process.env.PACING_TRACE) console.warn(runs[0]?.timeline.join('\n'));
    expect(runs.length).toBeGreaterThan(0);
  });

  it('opens layer 2 within 2 min (fast) / about 3 min (casual) on every seed', () => {
    for (const x of t((r) => r.unlockAt[1])) expect(x).toBeLessThanOrEqual(profile === 'fast' ? 2 : 3.3);
  });

  it('opens layer 3 within about 15 min on every seed (fast: 12)', () => {
    for (const x of t((r) => r.unlockAt[2])) expect(x).toBeLessThanOrEqual(profile === 'fast' ? 12 : 15);
  });

  it('never goes 60 s without a new fossil, a fusion or a purchase in the first 20 minutes', () => {
    for (const r of runs) expect(r.maxGap, `seed ${r.seed}`).toBeLessThanOrEqual(60);
  });

  if (profile === 'fast') {
    it('completes the Topsoil set in about 3-5 minutes (median of 100 seeds), half within 6', () => {
      // The set waits on one exponential draw (the 1 in 1,200), so 20 seeds are too noisy here.
      const x = Array.from({ length: 100 }, (_, i) => min(runPolicy(i + 1, 9, 'fast').l1SetAt));
      console.warn(`fast: Topsoil set over 100 seeds: median ${median(x).toFixed(2)} min, within 6 min ${x.filter((v) => v <= 6).length}/100`);
      expect(median(x)).toBeGreaterThanOrEqual(3);
      expect(median(x)).toBeLessThanOrEqual(5);
      expect(x.filter((v) => v <= 6).length).toBeGreaterThanOrEqual(50);
    }, 120_000);

    it('opens layer 4 within 30 minutes on every seed', () => {
      for (const x of t((r) => r.unlockAt[3])) expect(x).toBeLessThanOrEqual(30);
    });

    it('expects the first find at 1 in 10,000 or rarer around minute 15-25 (median of 60 seeds)', () => {
      const m = median(t((r) => r.first10kAt));
      expect(m).toBeGreaterThanOrEqual(15);
      expect(m).toBeLessThanOrEqual(25);
    });
  } else {
    it('the 90th-percentile casual player still opens layer 3 within 15 minutes', () => {
      expect(pct(t((r) => r.unlockAt[2]), 0.9)).toBeLessThanOrEqual(15);
    });
  }
});

// Long horizon: all ten layers, then the expedition loop (GAME.md "Built" has the measured table).
describe.each(['fast', 'casual'] as const)('long run: %s player, 15 hours', (profile) => {
  const runs = [1, 2, 3, 4].map((s) => runPolicy(s, 900, profile, { every: 60 }));
  const h = (s: number | null | undefined): number => (s === null || s === undefined ? Infinity : s / 3600);
  const lens = (r: PacingMetrics): number[] => r.expeditionsAt.map((x, i) => (x - (r.expeditionsAt[i - 1] ?? 0)) / 3600);

  it('prints the measured long-run pacing', () => {
    for (const r of runs)
      console.warn(
        `${profile} seed ${r.seed}: layers at ${r.unlockAt.map((x) => (x === null ? '-' : (x / 60).toFixed(0))).join(' ')} min; ` +
          `expedition runs ${lens(r).map((x) => x.toFixed(2)).join(', ')} h; first-hour max gap ${r.maxGapHour.toFixed(0)} s; score ${r.score}, rank ${r.rank}`,
      );
    expect(runs.length).toBe(4);
  });

  it('opens all ten layers (fast within 4 h, casual within 9 h), no layer taking more than 45 / 100 min', () => {
    for (const r of runs) {
      expect(h(r.unlockAt[9]), `seed ${r.seed}`).toBeLessThanOrEqual(profile === 'fast' ? 4 : 9);
      for (let l = 1; l < r.unlockAt.length; l++) {
        const step = (h(r.unlockAt[l]) - h(r.unlockAt[l - 1])) * 60;
        expect(step, `seed ${r.seed} layer ${l + 1}`).toBeLessThanOrEqual(profile === 'fast' ? 45 : 100);
      }
    }
  });

  it('takes hours, not minutes, to the first expedition (fast 2.5-4 h, casual 6-9 h)', () => {
    for (const r of runs) {
      const first = h(r.expeditionsAt[0]);
      expect(first).toBeGreaterThanOrEqual(profile === 'fast' ? 2.5 : 6);
      expect(first).toBeLessThanOrEqual(profile === 'fast' ? 4 : 9);
    }
  });

  it('the second run is faster than the first but not trivial (45-90 %), and later runs never drop under 20 %', () => {
    for (const r of runs) {
      const l = lens(r);
      expect(l.length, `seed ${r.seed}`).toBeGreaterThanOrEqual(2);
      const [a, b] = [at(l, 0), at(l, 1)];
      expect(b / a).toBeGreaterThanOrEqual(0.45);
      expect(b / a).toBeLessThanOrEqual(0.9);
      for (const x of l.slice(2)) expect(x / a, `seed ${r.seed}`).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('never goes 60 s without a new fossil, a fusion or a purchase in the first hour', () => {
    for (const r of runs) expect(r.maxGapHour, `seed ${r.seed}`).toBeLessThanOrEqual(60);
  });
});
