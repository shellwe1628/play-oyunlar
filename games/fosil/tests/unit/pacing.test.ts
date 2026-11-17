import { describe, expect, it } from 'vitest';
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
