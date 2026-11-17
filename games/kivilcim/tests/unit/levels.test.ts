import { beforeAll, describe, expect, it } from 'vitest';
import { wallsInBounds } from '../../src/sim/builder';
import { DT } from '../../src/sim/constants';
import { buildLevel, LEVEL_COUNT, levelInfo } from '../../src/sim/levels';
import { analyse, kinematics, replay, type Analysis } from '../../src/sim/solver';
import type { GateKind, Track } from '../../src/sim/track';

const ids = Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
const tracks = new Map<number, Track>();
const results = new Map<number, Analysis>();

beforeAll(() => {
  for (const id of ids) {
    const t = buildLevel(id);
    tracks.set(id, t);
    results.set(id, analyse(t));
  }
  const rows = ids.map((id) => {
    const a = results.get(id)!;
    const secs = a.ticks * DT;
    return `L${String(id).padStart(2)}  ${secs.toFixed(1).padStart(5)} s  margin ${a.marginPx.toFixed(2).padStart(6)} px  window ${a.windowMs.toFixed(1).padStart(6)} ms  speed ${levelInfo(id).speed}`;
  });
  console.warn(`solver table\n${rows.join('\n')}`);
}, 240_000);

describe('levels 1-10', () => {
  it('there are ten levels', () => {
    expect(LEVEL_COUNT).toBe(10);
  });

  it('are deterministic', () => {
    const a = buildLevel(4);
    const b = buildLevel(4);
    expect(Array.from(a.lx)).toEqual(Array.from(b.lx));
    expect(a.gems).toEqual(b.gems);
    expect(a.bars).toEqual(b.bars);
  });

  it('keep every wall on screen', () => {
    for (const id of ids) expect(wallsInBounds(tracks.get(id)!), `level ${id}`).toBe(true);
  });

  it('last 35-50 seconds', () => {
    for (const id of ids) {
      const s = kinematics(tracks.get(id)!).n * DT;
      expect(s, `level ${id}`).toBeGreaterThanOrEqual(35);
      expect(s, `level ${id}`).toBeLessThanOrEqual(50);
    }
  });

  it('have exactly three gems each', () => {
    for (const id of ids) expect(tracks.get(id)!.gems.length, `level ${id}`).toBe(3);
  });

  it('are all completable: the autopilot timeline replays to the finish', () => {
    for (const id of ids) {
      const r = replay(tracks.get(id)!, results.get(id)!.plan.held);
      expect(r.finished, `level ${id}`).toBe(true);
      expect(r.progress).toBe(1);
      expect(r.minClear, `level ${id}`).toBeGreaterThanOrEqual(results.get(id)!.marginPx);
    }
  });

  it('have all three gems reachable on a finishing run', () => {
    for (const id of ids) {
      const plan = results.get(id)!.gemPlan;
      expect(plan, `level ${id}`).not.toBeNull();
      const r = replay(tracks.get(id)!, plan!.held);
      expect(r.finished, `level ${id}`).toBe(true);
      expect(r.gems, `level ${id}`).toBe(3);
    }
  });

  it('safety margin gets strictly smaller from level 1 to 10', () => {
    for (const id of ids.slice(1)) {
      expect(results.get(id)!.marginPx, `level ${id} vs ${id - 1}`).toBeLessThan(results.get(id - 1)!.marginPx);
    }
  });

  it('reaction window gets strictly shorter from level 1 to 10', () => {
    for (const id of ids.slice(1)) {
      expect(results.get(id)!.windowMs, `level ${id} vs ${id - 1}`).toBeLessThan(results.get(id - 1)!.windowMs);
    }
  });

  it('level 1 is gentle and level 10 is demanding but still humanly playable', () => {
    const l1 = results.get(1)!;
    const l10 = results.get(10)!;
    expect(l1.marginPx).toBeGreaterThanOrEqual(40);
    expect(l1.windowMs).toBeGreaterThanOrEqual(420);
    expect(l10.marginPx).toBeLessThanOrEqual(20);
    expect(l10.marginPx).toBeGreaterThanOrEqual(4);
    expect(l10.windowMs).toBeGreaterThanOrEqual(130);
  });

  it('the first 30% of level 1 has no blocks or bars and a wide corridor', () => {
    const t = tracks.get(1)!;
    const end = t.length * 0.3;
    expect(t.blocks.filter((b) => b.y < end + 100)).toEqual([]);
    expect(t.bars.filter((b) => b.y < end + 100)).toEqual([]);
    for (let i = 0; i < t.wy.length; i++) {
      if (t.wy[i]! > end) break;
      expect(t.rx[i]! - t.lx[i]!, `vertex ${i}`).toBeGreaterThanOrEqual(200);
    }
  });

  it('introduces each gate family alone before combining it', () => {
    const family = (k: GateKind): string => (k === 'fast' || k === 'slow' || k === 'normal' ? 'speed' : k === 'flip' || k === 'unflip' ? 'flip' : 'size');
    const firstLevel = new Map<string, number>();
    for (const id of ids) for (const g of tracks.get(id)!.gates) if (!firstLevel.has(family(g.kind))) firstLevel.set(family(g.kind), id);
    expect([...firstLevel.keys()].sort()).toEqual(['flip', 'size', 'speed']);
    for (const [fam, id] of firstLevel) {
      const gates = tracks.get(id)!.gates;
      // While the family's first effect is active, no other family's gate appears.
      const start = gates.findIndex((g) => family(g.kind) === fam);
      const rest = gates.slice(start + 1);
      const endIdx = rest.findIndex((g) => family(g.kind) === fam);
      const inside = rest.slice(0, endIdx < 0 ? rest.length : endIdx);
      expect(inside.filter((g) => family(g.kind) !== fam), `level ${id} ${fam}`).toEqual([]);
      // Families are introduced on different levels.
    }
    expect(new Set(firstLevel.values()).size).toBe(3);
  });

  it('every level ends in its normal state (all gate effects closed)', () => {
    for (const id of ids) {
      let mult = 'normal';
      let mini = false;
      let flip = false;
      for (const g of tracks.get(id)!.gates) {
        if (g.kind === 'fast' || g.kind === 'slow' || g.kind === 'normal') mult = g.kind;
        if (g.kind === 'mini') mini = true;
        if (g.kind === 'big') mini = false;
        if (g.kind === 'flip') flip = true;
        if (g.kind === 'unflip') flip = false;
      }
      expect([mult, mini, flip], `level ${id}`).toEqual(['normal', false, false]);
    }
  });
});
