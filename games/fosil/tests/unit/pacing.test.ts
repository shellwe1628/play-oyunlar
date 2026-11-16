import { describe, expect, it } from 'vitest';
import { median, runPolicy, type PacingMetrics } from './policy';

const SEEDS = Array.from({ length: Number(process.env.PACING_SEEDS ?? 20) }, (_, i) => i + 1);
const min = (s: number | null): number => (s === null ? Infinity : s / 60);

describe('pacing (scripted policy, 20 seeds)', () => {
  const runs: PacingMetrics[] = SEEDS.map((s) => runPolicy(s));
  const report = () =>
    runs
      .map((r) => `seed ${r.seed}: L1set ${min(r.l1SetAt).toFixed(1)} L2 ${min(r.unlockAt[1]).toFixed(1)} L3 ${min(r.unlockAt[2]).toFixed(1)} L4 ${min(r.unlockAt[3]).toFixed(1)} 10k ${min(r.first10kAt).toFixed(1)} (1/${r.first10kOdds}) gap ${r.maxGap.toFixed(1)}s@${(r.maxGapAt / 60).toFixed(1)}m rolls20 ${r.rollsAt20} lv ${JSON.stringify(r.levelsAt20)} P ${JSON.stringify(r.powerAt)}`)
      .join('\n');

  it('prints the measured pacing', () => {
    console.warn(report());
    const med = (f: (r: PacingMetrics) => number) => median(runs.map(f)).toFixed(2);
    console.warn(`MEDIAN L1set ${med((r) => min(r.l1SetAt))} L2 ${med((r) => min(r.unlockAt[1]))} L3 ${med((r) => min(r.unlockAt[2]))} L4 ${med((r) => min(r.unlockAt[3]))} first10k ${med((r) => min(r.first10kAt))} maxGap ${med((r) => r.maxGap)}`);
    if (process.env.PACING_TRACE) console.warn(runs[0]?.timeline.join('\n'));
    expect(runs.length).toBeGreaterThan(0);
  });

  const minutes = (f: (r: PacingMetrics) => number | null) => runs.map((r) => min(f(r)));

  it('completes the Topsoil set in about 3-5 minutes (median), most seeds within 6', () => {
    const t = minutes((r) => r.l1SetAt);
    expect(median(t)).toBeGreaterThanOrEqual(3);
    expect(median(t)).toBeLessThanOrEqual(5);
    expect(t.filter((x) => x <= 6).length / t.length).toBeGreaterThanOrEqual(0.6);
  });

  it('unlocks layer 2 within 2 minutes, layer 3 within 12 and layer 4 within 30, on every seed', () => {
    for (const x of minutes((r) => r.unlockAt[1])) expect(x).toBeLessThanOrEqual(2);
    for (const x of minutes((r) => r.unlockAt[2])) expect(x).toBeLessThanOrEqual(12);
    for (const x of minutes((r) => r.unlockAt[3])) expect(x).toBeLessThanOrEqual(30);
  });

  it('expects the first find at 1 in 10,000 or rarer around minute 15-25 (median)', () => {
    const t = median(minutes((r) => r.first10kAt));
    expect(t).toBeGreaterThanOrEqual(15);
    expect(t).toBeLessThanOrEqual(25);
  });

  it('never goes 60 seconds without a new fossil, a fusion or an upgrade in the first 20 minutes', () => {
    for (const r of runs) expect(r.maxGap, `seed ${r.seed}`).toBeLessThanOrEqual(60);
  });
});
