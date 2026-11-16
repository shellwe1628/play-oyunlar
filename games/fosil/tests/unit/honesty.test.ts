import { describe, expect, it } from 'vitest';
import { at, FOSSILS, fossilPower, LAYERS } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { layerFossils, rollProbabilities } from '../../src/sim/loot';

const L1 = layerFossils(0);
const saveWith = (mut: (s: DigSave) => void): DigSave => {
  const s = defaultSave();
  mut(s);
  return s;
};

/** Tap until a block breaks; before each tap remember the luck the HUD shows for taps. */
function tapFind(sim: DigSim): { shown: number; luck: number } {
  for (let i = 0; i < 10_000; i++) {
    const shown = sim.luck;
    const r = sim.tap();
    if (r.find) return { shown, luck: r.find.luck };
  }
  throw new Error('no break');
}

describe('the luck applied is the luck shown, for every roll source', () => {
  it('tap: the breaking tap rolls at the luck on screen before it, then raises the combo', () => {
    const sim = new DigSim(3, saveWith((s) => (s.levels.luck = 2)));
    for (let k = 0; k < 40; k++) {
      const { shown, luck } = tapFind(sim);
      expect(luck).toBeCloseTo(shown, 12);
    }
    expect(sim.combo).toBeGreaterThan(0.5); // the combo did build up meanwhile
  });

  it('glint: the label value at any moment equals what the tap applies, even as the combo drains', () => {
    const sim = new DigSim(9, saveWith((s) => (s.levels.luck = 3)));
    for (let i = 0; i < 30; i++) {
      sim.tap();
      sim.tick(0.05);
    }
    while (!sim.glint) sim.tick(0.05);
    const atSpawn = sim.glintLuck;
    sim.tick(1.5); // combo drains while the glint is up: the glint's luck is fixed at spawn
    expect(sim.glintLuck).toBe(atSpawn);
    const shown = sim.glintLuck;
    const f = sim.tapGlint()!;
    expect(f.source).toBe('glint');
    expect(f.luck).toBeCloseTo(shown, 12);
  });

  it('assistant: rolls at the assistant luck the sim exposes (no combo), never the tap chip', () => {
    const sim = new DigSim(4, saveWith((s) => {
      s.levels.assistant = 20;
      s.levels.luck = 4;
    }));
    for (let i = 0; i < 40; i++) {
      sim.tap();
      sim.tick(0.02);
    }
    expect(sim.luck).toBeGreaterThan(sim.assistantLuck); // combo makes them differ
    let checked = 0;
    for (let i = 0; i < 200 && checked < 10; i++) {
      const shown = sim.assistantLuck;
      const r = sim.tick(0.25);
      for (const f of r.finds) {
        expect(f.source).toBe('assistant');
        expect(f.luck).toBeCloseTo(shown, 12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('offline: rolls at the offline luck the sim exposes, which excludes the rewarded boost', () => {
    const sim = new DigSim(5, saveWith((s) => {
      s.levels.assistant = 6;
      s.levels.luck = 4; // ×2 base
      s.boost = 60;
    }));
    expect(sim.baseLuck).toBeCloseTo(4, 12); // ×2 upgrade × ×2 boost
    const shown = sim.offlineLuck;
    expect(shown).toBeCloseTo(2, 12);
    const haul = sim.claimOffline(600);
    expect(haul.blocks).toBeGreaterThan(0);
    expect(haul.lucks).toEqual([shown]);
  });

  it('an offline haul that completes a set is rolled entirely at the luck it shows; the bonus applies after', () => {
    let switched = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = new DigSim(seed, saveWith((s) => {
        for (const f of L1.slice(0, 11)) s.counts[f.id] = [1, 0, 0, 0]; // all but topsoil-12
        s.levels.assistant = 25;
      }));
      const shown = sim.offlineLuck;
      expect(shown).toBe(1);
      const haul = sim.claimOffline(7200);
      expect(haul.lucks).toEqual([shown]); // the lucks the haul's finds actually used
      if (sim.setComplete(0)) {
        switched++;
        expect(sim.offlineLuck).toBe(1.25); // the set bonus takes effect after the haul
      }
    }
    expect(switched).toBeGreaterThanOrEqual(2); // the case really happens in this sample
  });

  it('the rewarded boost keeps running while the app is closed', () => {
    const sim = new DigSim(5, saveWith((s) => (s.boost = 60)));
    sim.claimOffline(45);
    expect(sim.boostSeconds).toBe(15);
    sim.claimOffline(100);
    expect(sim.boostSeconds).toBe(0);
  });

  it('every find reports the dig power it added', () => {
    const sim = new DigSim(2);
    for (let i = 0; i < 20; i++) {
      const before = sim.digPower;
      const f = tapFind(sim);
      void f;
      const last = sim.lastFind!;
      void last;
      expect(sim.digPower).toBeGreaterThan(before);
    }
    const s2 = new DigSim(2);
    s2.collect(at(L1, 0).id);
    s2.collect(at(L1, 0).id);
    const before = s2.digPower;
    let find = null;
    while (!find) find = s2.tap().find;
    expect(find.powerGain).toBeCloseTo(s2.digPower - before, 9);
  });
});

describe('literal rules (mutation-proof)', () => {
  it('an upgrade costing 15 cannot be bought with 14 dust and can with 15', () => {
    const a = new DigSim(1, saveWith((s) => (s.dust = 14)));
    expect(a.upgradeCost('pick')).toBe(15);
    expect(a.canBuy('pick')).toBe(false);
    expect(a.buy('pick')).toBe(false);
    expect(a.dust).toBe(14);
    const b = new DigSim(1, saveWith((s) => (s.dust = 15)));
    expect(b.canBuy('pick')).toBe(true);
    expect(b.buy('pick')).toBe(true);
    expect(b.dust).toBe(0);
    expect(b.upgradeCost('pick')).toBe(24);
  });

  it('a new game shows its first glint after 8 s; later gaps are 20-40 s; a glint lasts 3 s', () => {
    const sim = new DigSim(9);
    sim.tick(7.9);
    expect(sim.glint).toBeNull();
    sim.tick(0.2);
    expect(sim.glint).not.toBeNull();
    sim.tick(2.9);
    expect(sim.glint).not.toBeNull();
    sim.tick(0.2);
    expect(sim.glint).toBeNull();
    for (let n = 0; n < 5; n++) {
      let t = 0;
      while (!sim.glint) {
        sim.tick(0.05);
        t += 0.05;
      }
      expect(t).toBeGreaterThanOrEqual(19.9);
      expect(t).toBeLessThanOrEqual(40.1);
      sim.tick(3.1);
    }
  });

  it('luck boosts 1 in 100 and rarer, not 1 in 50 or commoner', () => {
    const p1 = rollProbabilities(0, 1);
    const p3 = rollProbabilities(0, 3);
    layerFossils(0).forEach((f, i) => {
      const ratio = at(p3, i) / at(p1, i);
      if (f.odds >= 100) expect(ratio).toBeCloseTo(3, 9);
      else expect(ratio).toBeLessThan(1);
    });
    expect(layerFossils(0).map((f) => f.odds)).toContain(50);
    expect(layerFossils(0).map((f) => f.odds)).toContain(100);
  });

  it('a broken block resets damage to 0', () => {
    const sim = new DigSim(1);
    sim.tap();
    expect(sim.blockDamage).toBe(1);
    let r = sim.tap();
    while (!r.find) r = sim.tap();
    expect(sim.blockDamage).toBe(0);
  });

  it('block HP per layer: base and the quadratic ramp', () => {
    const at0 = new DigSim(1);
    expect([0, 1, 2, 3].map((l) => at0.hpOf(l))).toEqual([4, 6000, 150_000, 4_500_000]);
    const deep = new DigSim(1, saveWith((s) => (s.broken = [100, 100, 100, 100])));
    expect(deep.hpOf(0)).toBe(Math.ceil(4 * (1 + 0.28 * 100) ** 2));
    expect(deep.hpOf(1)).toBe(Math.ceil(6000 * (1 + 0.009 * 100) ** 2));
    expect(deep.hpOf(2)).toBe(Math.ceil(150_000 * (1 + 0.004 * 100) ** 2));
    expect(deep.hpOf(3)).toBe(Math.ceil(4_500_000 * (1 + 0.003 * 100) ** 2));
  });

  it('layer 2 opens at exactly 300 power: not at 299', () => {
    const snail = at(L1, 0);
    expect(fossilPower(snail, 0)).toBe(1);
    expect(LAYERS.map((l) => l.unlockPower)).toEqual([0, 300, 20_000, 1_400_000]);
    const below = new DigSim(1, saveWith((s) => (s.counts[snail.id] = [298, 0, 0, 0])));
    expect(below.digPower).toBe(299);
    expect(below.unlocked).toBe(0);
    const exact = new DigSim(1, saveWith((s) => (s.counts[snail.id] = [299, 0, 0, 0])));
    expect(exact.digPower).toBe(300);
    expect(exact.unlocked).toBe(1);
  });

  it('the Topsoil set bonus is luck ×1.25', () => {
    const sim = new DigSim(1, saveWith((s) => {
      for (const f of L1) s.counts[f.id] = [1, 0, 0, 0];
    }));
    expect(sim.baseLuck).toBe(1.25);
  });

  it('away time is capped at 2 hours even when upgrades and bonuses add up to more', () => {
    const maxed = new DigSim(1, saveWith((s) => {
      s.levels.offline = 6; // 30 + 6 × 15 = 120 min
      for (const f of layerFossils(2)) s.counts[f.id] = [1, 0, 0, 0]; // +30 min would make 150
    }));
    expect(maxed.offlineCap).toBe(7200);
    const lvl4 = new DigSim(1, saveWith((s) => (s.levels.offline = 4)));
    expect(lvl4.offlineCap).toBe(5400);
  });

  it('every fossil in the game is reachable at the luck cap', () => {
    for (let l = 0; l < 4; l++) for (const p of rollProbabilities(l, 1e6)) expect(p).toBeGreaterThan(0);
    expect(FOSSILS).toHaveLength(48);
  });
});

describe('tips', () => {
  it('each tip is shown once and remembered through a save', () => {
    const sim = new DigSim(1);
    expect(sim.markTip('odds')).toBe(true);
    expect(sim.markTip('odds')).toBe(false);
    const again = new DigSim(1, JSON.parse(JSON.stringify(sim.toSave())) as DigSave);
    expect(again.markTip('odds')).toBe(false);
    expect(again.markTip('combo')).toBe(true);
  });
});
