/**
 * Shared checks for worlds 2-4 (one test file per world so vitest runs them in parallel).
 * Solver table, human-model table, mechanic introduction, star goals.
 */
import { createRng } from '@oyun/core/pure';
import { beforeAll, describe, expect, it } from 'vitest';
import { wallsInBounds } from '../../src/sim/builder';
import { DT, NEAR_PX } from '../../src/sim/constants';
import { humanRate, reference } from '../../src/sim/human';
import { buildLevel, levelInfo, WORLD_SIZE } from '../../src/sim/levels';
import { MECHANICS, type Mechanic } from '../../src/sim/patterns';
import { analyse, K_REF, kinematics, prepare, replay, solve, type Analysis } from '../../src/sim/solver';
import type { Track } from '../../src/sim/track';

export const HUMAN_ATTEMPTS = 200;

/** Which mechanics a track contains. */
export function mechanicsIn(t: Track): Set<Mechanic> {
  const m = new Set<Mechanic>();
  if (t.pills.some((p) => p.amp === 0)) m.add('split');
  if (t.pills.some((p) => p.amp > 0)) m.add('piston');
  if (t.lasers.some((l) => l.duty < 1)) m.add('laser');
  if (t.spinners.length) m.add('spin');
  if (t.winds.length) m.add('wind');
  if (t.darks.length) m.add('dark');
  if (t.portals.length) m.add('portal');
  if (t.mirrors.length) m.add('mirror');
  return m;
}

export function comfortLine(t: Track): Uint8Array {
  const plan = solve(prepare(t), { minClear: 0, minHoldTicks: K_REF, comfort: { cap: 120, switchCost: 20 } });
  if (!plan) throw new Error('no comfort line');
  return plan.held;
}

export function worldSuite(world: number): void {
  const first = (world - 1) * WORLD_SIZE + 1;
  const ids = Array.from({ length: WORLD_SIZE }, (_, i) => first + i);
  const tracks = new Map<number, Track>();
  const res = new Map<number, Analysis>();
  const human = new Map<number, { rate: number; meanProgress: number }>();
  /** The previous world's first level and boss, for the step up between worlds. */
  const prev = new Map<number, Analysis>();

  beforeAll(() => {
    for (const id of ids) {
      const t = buildLevel(id);
      tracks.set(id, t);
      res.set(id, analyse(t));
      human.set(id, humanRate(t, reference(t, comfortLine(t)), HUMAN_ATTEMPTS, createRng(1000 + id)));
    }
    for (const id of [first - WORLD_SIZE, first - 1]) prev.set(id, analyse(buildLevel(id)));
    console.warn(
      `world ${world}: solver and human model (${HUMAN_ATTEMPTS} attempts, seed 1000+id)\n` +
        ids
          .map((id) => {
            const a = res.get(id)!;
            const h = human.get(id)!;
            const info = levelInfo(id);
            return `L${id}  ${(a.ticks * DT).toFixed(1)} s  margin ${a.marginPx.toFixed(2)} px  window ${a.windowMs.toFixed(1)} ms  speed ${info.speed}  human ${(h.rate * 100).toFixed(1)} % (progress ${(h.meanProgress * 100).toFixed(0)} %)${info.intro ? `  intro ${info.intro}` : ''}${info.boss ? '  BOSS' : ''}`;
          })
          .join('\n'),
    );
  }, 900_000);

  describe(`world ${world}`, () => {
    it('ten levels, the last one a boss, walls on screen, 35-50 s, three gems each', () => {
      for (const id of ids) {
        const t = tracks.get(id)!;
        expect(levelInfo(id).world).toBe(world);
        expect(levelInfo(id).boss, `level ${id}`).toBe(id === first + WORLD_SIZE - 1);
        expect(wallsInBounds(t), `level ${id}`).toBe(true);
        const s = kinematics(t).n * DT;
        expect(s, `level ${id}`).toBeGreaterThanOrEqual(35);
        expect(s, `level ${id}`).toBeLessThanOrEqual(50);
        expect(t.gems.length, `level ${id}`).toBe(3);
      }
    });

    it('every level replays to the finish on the autopilot, and all gems can be taken on a finishing run', () => {
      for (const id of ids) {
        const t = tracks.get(id)!;
        const a = res.get(id)!;
        const r = replay(t, a.plan.held);
        expect(r.finished, `level ${id}`).toBe(true);
        expect(r.minClear, `level ${id}`).toBeGreaterThanOrEqual(a.marginPx);
        expect(a.gemPlan, `level ${id}`).not.toBeNull();
        const g = replay(t, a.gemPlan!.held);
        expect([g.finished, g.gems], `level ${id}`).toEqual([true, 3]);
      }
    });

    it('the "clean" star is possible: a finishing plan exists with no near miss (margin above NEAR_PX)', () => {
      for (const id of ids) expect(res.get(id)!.marginPx, `level ${id}`).toBeGreaterThan(NEAR_PX + 1);
    });

    it('margin and window shrink strictly inside the world', () => {
      for (const id of ids.slice(1)) {
        expect(res.get(id)!.marginPx, `level ${id}`).toBeLessThan(res.get(id - 1)!.marginPx);
        expect(res.get(id)!.windowMs, `level ${id}`).toBeLessThan(res.get(id - 1)!.windowMs);
      }
    });

    it('steps up from the previous world: its first level and its boss are harder than theirs', () => {
      const p0 = prev.get(first - WORLD_SIZE)!;
      const pB = prev.get(first - 1)!;
      const f = res.get(first)!;
      const b = res.get(first + WORLD_SIZE - 1)!;
      expect(f.marginPx).toBeLessThan(p0.marginPx);
      expect(f.windowMs).toBeLessThan(p0.windowMs);
      expect(b.marginPx).toBeLessThan(pB.marginPx);
      expect(b.windowMs).toBeLessThan(pB.windowMs);
      // ...but the world opens easier than the boss before it (a calm start).
      expect(f.windowMs).toBeGreaterThan(pB.windowMs);
    });

    it('each new mechanic first appears on its intro level, alone among new ones and calm', () => {
      for (const id of ids) {
        const intro = levelInfo(id).intro;
        if (!intro) continue;
        for (let e = 1; e < id; e++) expect(mechanicsIn(buildLevel(e)).has(intro), `${intro} before level ${id} (in ${e})`).toBe(false);
        expect(mechanicsIn(tracks.get(id)!).has(intro), `level ${id}`).toBe(true);
        // The first segment of the mechanic on its intro level is at q 0.
        const seg = levelInfo(id).segs.find((s) => (intro === 'dark' ? s.dark : s.k === (intro === 'spin' ? 'spin' : intro)));
        expect(seg?.q ?? 0, `level ${id}`).toBe(0);
      }
      for (const m of MECHANICS) {
        const introLevel = Array.from({ length: 40 }, (_, i) => i + 1).find((id) => levelInfo(id).intro === m);
        expect(introLevel, m).toBeDefined();
      }
    });

    it('human model: every level is finished sometimes; the rate falls smoothly inside the world', () => {
      const r = ids.map((id) => human.get(id)!.rate);
      for (const [i, v] of r.entries()) expect(v, `level ${ids[i]}`).toBeGreaterThan(0);
      for (let i = 1; i < r.length; i++) {
        expect(r[i], `level ${ids[i]}`).toBeLessThanOrEqual(r[i - 1]! + 0.03);
        expect(r[i - 1]! - r[i]!, `drop into level ${ids[i]}`).toBeLessThanOrEqual(0.3);
      }
      // A calm start: the world's first level is finished most of the time.
      expect(r[0]).toBeGreaterThanOrEqual(0.7);
    });
  });
}
