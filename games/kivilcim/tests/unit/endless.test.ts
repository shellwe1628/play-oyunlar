import { describe, expect, it } from 'vitest';
import { wallsInBounds } from '../../src/sim/builder';
import { DT } from '../../src/sim/constants';
import { buildEndless, ENDLESS_SPEED, dailyKey, dailySeed } from '../../src/sim/endless';
import { PORT_H } from '../../src/sim/patterns';
import { K_REF, prepare, replay, solve } from '../../src/sim/solver';
import { segmentAt, wallXAt } from '../../src/sim/track';

describe('endless generator', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = buildEndless(42, { segments: 12 });
    const b = buildEndless(42, { segments: 12 });
    const c = buildEndless(43, { segments: 12 });
    expect(Array.from(a.track.lx)).toEqual(Array.from(b.track.lx));
    expect(Array.from(a.track.lx)).not.toEqual(Array.from(c.track.lx));
  });

  it('speed creeps up with height and is capped', () => {
    const { track } = buildEndless(1, { segments: 4 });
    expect(track.speed.creep).toBeGreaterThan(0);
    expect(track.speed.max).toBe(ENDLESS_SPEED.max);
  });

  it('every join between segments is the standard port (centre 360, half-width PORT_H)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { track, joins } = buildEndless(seed, { segments: 20 });
      expect(joins.length).toBe(20);
      for (const y of joins) {
        const i = segmentAt(track.wy, y);
        expect(wallXAt(track.wy, track.lx, i, y), `seed ${seed} y ${y}`).toBeCloseTo(360 - PORT_H, 6);
        expect(wallXAt(track.wy, track.rx, i, y), `seed ${seed} y ${y}`).toBeCloseTo(360 + PORT_H, 6);
      }
      expect(wallsInBounds(track)).toBe(true);
    }
  });

  it('gate effects never cross a join (every segment ends in the normal state)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { track, joins } = buildEndless(seed, { segments: 30 });
      let mult = 'normal';
      let mini = false;
      let flip = false;
      let gi = 0;
      for (const y of joins) {
        while (gi < track.gates.length && track.gates[gi]!.y <= y) {
          const k = track.gates[gi++]!.kind;
          if (k === 'fast' || k === 'slow' || k === 'normal') mult = k;
          if (k === 'mini') mini = true;
          if (k === 'big') mini = false;
          if (k === 'flip') flip = !flip;
        }
        expect([mult, mini, flip], `seed ${seed} join ${y}`).toEqual(['normal', false, false]);
      }
    }
  });

  it('difficulty rises: later segments are tighter on average', () => {
    const { qs } = buildEndless(7, { segments: 40 });
    const avg = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
    expect(avg(qs.slice(30))).toBeGreaterThan(avg(qs.slice(0, 10)) + 0.3);
  });

  // The large sample: no impossible join at any speed. Each sampled run is solved end to end
  // with human-tempo inputs (every press/release ≥ 100 ms), at the real creeping speed and at
  // constant minimum and maximum speed (bars are re-phased for whichever speed profile runs).
  const speeds = [
    { name: 'creep', speed: undefined },
    { name: 'min', speed: { base: ENDLESS_SPEED.base, creep: 0, max: ENDLESS_SPEED.base } },
    { name: 'max', speed: { base: ENDLESS_SPEED.max, creep: 0, max: ENDLESS_SPEED.max } },
  ];
  for (const sp of speeds) {
    it(`a seeded sample of 40 runs x 14 segments is completable at ${sp.name} speed`, () => {
      const failures: number[] = [];
      for (let seed = 100; seed < 140; seed++) {
        const { track } = buildEndless(seed, { segments: 14, ...(sp.speed ? { speed: sp.speed } : {}) });
        const plan = solve(prepare(track), { minClear: 0, minHoldTicks: K_REF });
        if (!plan || !replay(track, plan.held).finished) failures.push(seed);
      }
      expect(failures).toEqual([]);
    }, 120_000);
  }

  it('deep runs (the hardest pool, segments 30-45) are completable at max speed', () => {
    const failures: number[] = [];
    for (let seed = 500; seed < 508; seed++) {
      const { track } = buildEndless(seed, { segments: 45, speed: { base: ENDLESS_SPEED.max, creep: 0, max: ENDLESS_SPEED.max } });
      const plan = solve(prepare(track), { minClear: 0, minHoldTicks: K_REF });
      if (!plan || !replay(track, plan.held).finished) failures.push(seed);
    }
    expect(failures).toEqual([]);
  }, 120_000);

  it('a 45-segment run lasts minutes, longer than anyone survives', () => {
    const { track } = buildEndless(3, { segments: 45 });
    expect(prepare(track).tl.n * DT).toBeGreaterThan(120);
  });
});

describe('daily shaft', () => {
  it('uses one key per local calendar date', () => {
    expect(dailyKey(new Date(2026, 10, 17, 0, 5))).toBe('2026-11-17');
    expect(dailyKey(new Date(2026, 10, 17, 23, 55))).toBe('2026-11-17');
    expect(dailyKey(new Date(2026, 0, 3, 12))).toBe('2026-01-03');
  });
  it('the same date gives the same seed, a different date a different one', () => {
    expect(dailySeed('2026-11-17')).toBe(dailySeed('2026-11-17'));
    expect(dailySeed('2026-11-17')).not.toBe(dailySeed('2026-11-18'));
  });
});
