import { createRng } from '@oyun/core/pure';
import { beforeAll, describe, expect, it } from 'vitest';
import { TrackBuilder } from '../../src/sim/builder';
import { humanAttempt, humanRate, NOISE_S, REACT_S, reference } from '../../src/sim/human';
import { buildLevel, LEVEL_COUNT } from '../../src/sim/levels';
import { K_REF, prepare, solve } from '../../src/sim/solver';

/** The line a person flies: the middle, few changes (comfort objective). */
function comfortLine(track: ReturnType<typeof buildLevel>): Uint8Array {
  const plan = solve(prepare(track), { minClear: 0, minHoldTicks: K_REF, comfort: { cap: 120, switchCost: 20 } });
  if (!plan) throw new Error('no comfort line');
  return plan.held;
}

const ATTEMPTS = 200;
const rates: number[] = [];
const progress: number[] = [];

beforeAll(() => {
  for (let id = 1; id <= LEVEL_COUNT; id++) {
    const t = buildLevel(id);
    const r = humanRate(t, reference(t, comfortLine(t)), ATTEMPTS, createRng(1000 + id));
    rates.push(r.rate);
    progress.push(r.meanProgress);
  }
  console.warn(
    `human model (react ${REACT_S * 1000} ms, timing noise ±${NOISE_S * 1000} ms, ${ATTEMPTS} attempts)\n` +
      rates.map((r, i) => `L${String(i + 1).padStart(2)}  finished ${(r * 100).toFixed(1).padStart(5)} %  mean progress ${(progress[i]! * 100).toFixed(0).padStart(3)} %`).join('\n'),
  );
}, 300_000);

describe('human model', () => {
  it('with no timing noise it finishes every level (the model itself is sound)', () => {
    for (const id of [1, 5, 10]) {
      const t = buildLevel(id);
      expect(humanAttempt(t, reference(t, comfortLine(t)), { rng: createRng(1), noiseS: 0 }).finished, `level ${id}`).toBe(true);
    }
  });

  it('corrects its own drift instead of oscillating (a long noisy straight is survived)', () => {
    const t = new TrackBuilder({ speed: 520 }).straight(200, 220).zig(30, 260, 120).finish();
    const r = humanRate(t, reference(t, comfortLine(t)), 50, createRng(3));
    expect(r.rate).toBeGreaterThan(0.9);
  });

  it('level 1 is finished in at least half of the attempts, level 2 in at least 30 %', () => {
    expect(rates[0]).toBeGreaterThanOrEqual(0.5);
    expect(rates[1]).toBeGreaterThanOrEqual(0.3);
  });

  it('falls smoothly to a few percent at level 10, never zero', () => {
    for (let i = 1; i < LEVEL_COUNT; i++) expect(rates[i], `level ${i + 1}`).toBeLessThanOrEqual(rates[i - 1]! + 0.03);
    expect(rates[LEVEL_COUNT - 1]).toBeGreaterThan(0);
    expect(rates[LEVEL_COUNT - 1]).toBeLessThanOrEqual(0.15);
    for (let i = 3; i < LEVEL_COUNT; i++) expect(rates[i - 1]! - rates[i]!, `drop into level ${i + 1}`).toBeLessThanOrEqual(0.3);
  });
});
