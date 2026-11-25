import { describe, expect, it } from 'vitest';
import { cardLife, HelperBrain, helperTier, pickTier, type SimView } from '../../src/fx/model';
import { FOSSILS } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { rollProbabilities } from '../../src/sim/loot';

/** A scripted seeded session; `present` is called every step with a read-only view, like the scene does. */
function session(present: ((v: SimView, dt: number, assistantHits: number) => void) | null): DigSave {
  const s = defaultSave();
  s.levels.assistant = 8;
  const sim = new DigSim(1234, s);
  const brain = new HelperBrain();
  for (let i = 0; i < 4000; i++) {
    sim.tap();
    const r = sim.tick(0.2);
    if (sim.glint && i % 7 === 0) sim.tapGlint();
    if (i % 50 === 0) for (const id of ['pick', 'luck', 'assistant'] as const) sim.buy(id);
    if (present) {
      present(sim, 0.2, r.assistantHits);
      brain.hits(r.assistantHits);
      if (r.finds.some((f) => f.source === 'assistant')) brain.found();
      if (r.finds.some((f) => f.fossil.odds >= 100)) brain.cheer();
      brain.update(0.2, sim.level('assistant'), i % 900 < 30);
    }
  }
  return sim.toSave();
}

/** Read every member of the view, the way the presentation layer does. */
function readAll(v: SimView): number {
  let x = v.layer + v.unlocked + v.digPower + v.luck + v.baseLuck + v.combo + v.comboMult + v.glintLuck + v.blockHp + v.blockDamage + v.assistantRate;
  x += v.glint ? v.glint.x + v.glint.life : 0;
  x += v.lastFind ? v.lastFind.luck : 0;
  x += v.stats.taps + v.level('pick') + v.level('assistant');
  for (const f of FOSSILS) x += (v.discovered(f.id) ? 1 : 0) + (v.grades(f.id)[0] ?? 0);
  for (let l = 0; l < 4; l++) x += v.setProgress(l).found + (v.setComplete(l) ? 1 : 0);
  return x;
}

describe('presentation does not change the sim', () => {
  it('a seeded session ends in the identical state with the presentation reading it every step', () => {
    const plain = session(null);
    let reads = 0;
    const presented = session((v) => {
      reads += readAll(v) > -1 ? 1 : 0;
      expect(pickTier(v.level('pick'))).toBeGreaterThanOrEqual(0);
      expect(helperTier(v.level('assistant'))).toBeGreaterThanOrEqual(0);
    });
    expect(reads).toBe(4000);
    expect(presented).toEqual(plain);
  });

  it('printed odds and the displayed luck are the same values with or without the presentation', () => {
    for (let l = 0; l < 4; l++) expect(rollProbabilities(l, 1).map((p) => Math.round(1 / p))).toEqual(FOSSILS.filter((f) => f.layer === l).map((f) => f.odds));
    const a = new DigSim(9);
    const b = new DigSim(9);
    for (let i = 0; i < 300; i++) {
      a.tap();
      b.tap();
      readAll(b);
      a.tick(0.1);
      b.tick(0.1);
      readAll(b);
      expect(b.luck).toBe(a.luck);
      expect(b.glintLuck).toBe(a.glintLuck);
    }
    expect(b.toSave()).toEqual(a.toSave());
  });

  it('the sim reports assistant hits per tick (read-only hook for the helper animation)', () => {
    const s = defaultSave();
    s.levels.assistant = 10; // 1 hit per second
    const sim = new DigSim(1, s);
    expect(sim.tick(2.05).assistantHits).toBe(2);
    expect(new DigSim(1).tick(5).assistantHits).toBe(0);
  });
});

describe('visual tiers and the helper', () => {
  it('pick and helper looks step up with their levels', () => {
    expect([0, 4, 5, 14, 15, 29, 30, 49, 50, 80].map(pickTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 1, 5, 6, 12, 13, 20, 21, 25].map(helperTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect([0, 1, 2, 3, 4, 5, 6].map(cardLife)).toEqual(['none', 'none', 'sheen', 'sheen', 'motes', 'glow', 'glow']);
  });

  it('is hidden without an assistant, swings at its own rhythm, naps and wakes', () => {
    const b = new HelperBrain();
    b.update(0.1, 0, false);
    expect(b.mood).toBe('hidden');
    b.update(0.1, 3, false);
    expect(b.mood).toBe('idle');
    b.hits(10); // a big tick: no more than 3 queued swings
    expect(b.swings).toBe(3);
    let strikes = 0;
    for (let i = 0; i < 20; i++) if (b.update(0.1, 3, false)) strikes++;
    expect(strikes).toBe(3); // one per 0.32 s, never all at once
    for (let i = 0; i < 10; i++) b.update(0.1, 3, false);
    expect(b.mood).toBe('idle');
    b.update(0.1, 3, true);
    expect(b.mood).toBe('nap');
    b.cheer();
    expect(b.mood).toBe('nap'); // asleep: no cheering
    b.update(0.1, 3, false);
    expect(b.mood).toBe('wake');
    for (let i = 0; i < 14; i++) b.update(0.1, 3, false);
    expect(b.mood).toBe('idle');
    b.cheer();
    expect(b.mood).toBe('cheer');
  });
});
