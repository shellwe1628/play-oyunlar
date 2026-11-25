/**
 * Weak spots and the Dig Rush must not shift any rng stream that existed before them: a session
 * that uses neither has to play out exactly as it did before the round. The literals below were
 * recorded from the sim as it was before weak spots and the rush were added.
 */
import { describe, expect, it } from 'vitest';
import { RUSH } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

describe('existing rng streams are where they were before weak spots and the rush', () => {
  it('the seeded fx session (taps, ticks, glints, purchases, assistant) ends in the recorded state', () => {
    const s = defaultSave();
    s.levels.assistant = 8;
    const sim = new DigSim(1234, s);
    const ids: string[] = [];
    let weakSeen = 0;
    for (let i = 0; i < 4000; i++) {
      const r = sim.tap();
      if (r.find) ids.push(r.find.fossil.id);
      const t = sim.tick(0.2);
      if (t.weakAppeared) weakSeen++;
      for (const f of t.finds) ids.push(f.fossil.id);
      if (sim.glint && i % 7 === 0) {
        const g = sim.tapGlint();
        if (g) ids.push(g.fossil.id);
      }
      if (i % 50 === 0) for (const id of ['pick', 'luck', 'assistant'] as const) sim.buy(id);
    }
    const a = sim.toSave();
    // recorded before the round (same script, same seed)
    expect(a.rng).toBe(1751558544);
    expect(a.stats.rolls).toBe(703);
    expect(a.dust).toBe(3289);
    expect(ids).toHaveLength(683);
    expect(hash(ids.join(','))).toBe(320829508);
    expect(hash(JSON.stringify(a.counts))).toBe(2338702029);
    expect(a.broken[0]).toBe(644);
    expect(a.unlocked).toBe(1);
    expect(a.glintIn).toBe(30.003366387449155);
    // ...while weak spots did come and go the whole time, unused
    expect(weakSeen).toBeGreaterThan(50);
    expect(sim.preciseHits).toBe(0);
  });

  it('a fresh dig tapped without aiming finds the recorded fossils in the recorded order', () => {
    const b = new DigSim(42);
    const ids: string[] = [];
    for (let i = 0; i < 600; i++) {
      const r = b.tap();
      if (r.find) ids.push(r.find.fossil.id);
      b.tick(0.05);
    }
    const s = b.toSave();
    expect(s.rng).toBe(3527672974);
    expect(s.stats.rolls).toBe(81);
    expect(s.dust).toBe(3065);
    expect(ids.slice(0, 8)).toEqual(['topsoil-03', 'topsoil-03', 'topsoil-06', 'topsoil-04', 'topsoil-01', 'topsoil-03', 'topsoil-02', 'topsoil-04']);
    expect(hash(ids.join(','))).toBe(2016703050);
    expect(s.broken[0]).toBe(81);
  });

  it('weak spots follow their own stream: the same seed shows the same spots however the dig is played', () => {
    const spots = (play: (sim: DigSim, i: number) => void): string[] => {
      const sim = new DigSim(77);
      const out: string[] = [];
      for (let i = 0; i < 12_000 && out.length < 25; i++) {
        play(sim, i);
        if (sim.tick(0.05).weakAppeared) out.push(`${sim.weakSpot!.x},${sim.weakSpot!.y}`);
      }
      return out;
    };
    const idle = spots(() => {});
    const tapping = spots((sim) => void sim.tap()); // rolls, glints and blocks all differ
    const buying = spots((sim, i) => {
      sim.tap();
      if (sim.glint) sim.tapGlint();
      if (i % 40 === 0) sim.buy('pick');
    });
    expect(idle).toHaveLength(25);
    expect(tapping).toEqual(idle);
    expect(buying).toEqual(idle);
  });

  it('precise hits take nothing from the main stream: the rolls come in the same order', () => {
    // one hit per block, so damage cannot change which roll lands where
    const mk = (): DigSim => {
      const s = defaultSave();
      s.counts['topsoil-01'] = [0, 0, 0, 1e9];
      return new DigSim(5, s);
    };
    const plain = mk();
    const aimed = mk();
    const a: string[] = [];
    const b: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const ra = plain.tap();
      const rb = aimed.tap(aimed.weakSpot ?? undefined);
      if (ra.find) a.push(ra.find.fossil.id);
      if (rb.find) b.push(rb.find.fossil.id);
      plain.tick(0.1);
      aimed.tick(0.1);
    }
    expect(aimed.preciseHits).toBeGreaterThan(20);
    expect(b).toEqual(a);
    expect(aimed.toSave().rng).toBe(plain.toSave().rng);
  });

  it('a whole rush takes nothing from the main stream', () => {
    const save = (): DigSave => {
      const s = defaultSave();
      for (const f of layerFossils(0).slice(0, RUSH.species)) s.counts[f.id] = [1, 0, 0, 0];
      s.stats.rolls = 500; // golden blocks may appear
      s.glintIn = 30;
      return s;
    };
    const sim = new DigSim(9, save());
    const before = sim.toSave().rng;
    expect(sim.startRush()).toBe(true);
    let finds = 0;
    while (sim.rushActive) {
      for (let k = 0; k < 3; k++) if (sim.rushActive && sim.tap().find) finds++;
      sim.tick(0.1);
    }
    expect(finds).toBeGreaterThan(50);
    expect(sim.toSave().rng).toBe(before);
  });
});
