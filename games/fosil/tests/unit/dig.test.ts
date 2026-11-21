import { describe, expect, it } from 'vitest';
import {
  COMBO,
  FOSSILS,
  GLINT,
  GRADE_MULT,
  LAYERS,
  OFFLINE,
  UPGRADES,
  fossilPower, at } from '../../src/sim/data';
import { DigSim, defaultSave, type DigSave } from '../../src/sim/dig';
import { layerFossils } from '../../src/sim/loot';

const L1 = layerFossils(0);

/** Tap until a block breaks; returns the find. */
function breakOne(sim: DigSim) {
  for (let i = 0; i < 10_000; i++) {
    const r = sim.tap();
    if (r.find) return r.find;
  }
  throw new Error('block never broke');
}

function saveWith(mut: (s: DigSave) => void): DigSave {
  const s = defaultSave();
  mut(s);
  return s;
}

describe('a fresh dig', () => {
  it('starts in Topsoil with bare-hands power 1, no dust and base luck', () => {
    const sim = new DigSim(1);
    expect(sim.layer).toBe(0);
    expect(sim.digPower).toBe(1);
    expect(sim.dust).toBe(0);
    expect(sim.baseLuck).toBe(1);
    expect(sim.unlocked).toBe(0);
  });

  it('each tap deals dig power; a block breaks after ceil(hp / power) taps and drops one fossil', () => {
    const sim = new DigSim(1);
    const hp = sim.blockHp;
    let taps = 0;
    let find = null;
    while (!find) {
      taps++;
      find = sim.tap().find ?? null;
    }
    expect(taps).toBe(Math.ceil(hp / 1));
    expect(find.fossil.layer).toBe(0);
    expect(find.isNew).toBe(true);
    expect(find.dust).toBeGreaterThan(0);
    expect(sim.dust).toBe(find.dust);
    expect(sim.count(find.fossil.id)).toBe(1);
  });

  it('breaks at most one block per tap, whatever the overkill', () => {
    const sim = new DigSim(1, saveWith((s) => (s.counts[at(L1, 0).id] = [0, 0, 0, 500])));
    expect(sim.digPower).toBeGreaterThan(sim.blockHp * 10);
    const before = sim.blocksBroken(0);
    sim.tap();
    expect(sim.blocksBroken(0)).toBe(before + 1);
  });

  it('is deterministic per seed', () => {
    const a = new DigSim(42);
    const b = new DigSim(42);
    for (let i = 0; i < 30; i++) expect(breakOne(a).fossil.id).toBe(breakOne(b).fossil.id);
  });
});

describe('dig power is the sum of the collection', () => {
  it('equals (1 + sum of fossil power by grade) times the pick multiplier', () => {
    const save = saveWith((s) => {
      s.counts[at(L1, 0).id] = [2, 1, 0, 0];
      s.counts[at(L1, 11).id] = [1, 0, 0, 0];
      s.counts[at(layerFossils(1), 3).id] = [0, 0, 1, 2];
      s.levels.pick = 3;
    });
    const sim = new DigSim(1, save);
    const f2 = at(layerFossils(1), 3);
    const sum =
      2 * fossilPower(at(L1, 0), 0) +
      fossilPower(at(L1, 0), 1) +
      fossilPower(at(L1, 11), 0) +
      fossilPower(f2, 2) +
      2 * fossilPower(f2, 3);
    expect(sim.collectionPower).toBeCloseTo(sum, 9);
    expect(sim.digPower).toBeCloseTo((1 + sum) * UPGRADES.pick.effect(3), 9);
  });

  it('grows with every find', () => {
    const sim = new DigSim(3);
    let last = sim.digPower;
    for (let i = 0; i < 10; i++) {
      breakOne(sim);
      expect(sim.digPower).toBeGreaterThan(last);
      last = sim.digPower;
    }
  });
});

describe('fusion', () => {
  it('three copies fuse into one of the next grade, cascading up to gold', () => {
    const sim = new DigSim(1);
    const id = at(L1, 0).id;
    expect(sim.collect(id).fusions).toBe(0);
    expect(sim.collect(id).fusions).toBe(0);
    const third = sim.collect(id);
    expect(third.fusions).toBe(1);
    expect(third.grade).toBe(1);
    expect(sim.grades(id)).toEqual([0, 1, 0, 0]);
    for (let i = 3; i < 9; i++) sim.collect(id);
    expect(sim.grades(id)).toEqual([0, 0, 1, 0]);
    for (let i = 9; i < 27; i++) sim.collect(id);
    expect(sim.grades(id)).toEqual([0, 0, 0, 1]);
    sim.collect(id);
    sim.collect(id);
    sim.collect(id);
    expect(sim.grades(id)).toEqual([0, 1, 0, 1]);
    for (let i = 0; i < 24; i++) sim.collect(id);
    expect(sim.grades(id)).toEqual([0, 0, 0, 2]); // gold copies accumulate
    expect(sim.count(id)).toBe(54);
  });

  it('a fused grade is worth more than the copies that made it', () => {
    for (let g = 0; g < 3; g++) expect(at(GRADE_MULT, g + 1)).toBeGreaterThan(3 * at(GRADE_MULT, g));
    const sim = new DigSim(1);
    const id = at(L1, 2).id;
    sim.collect(id);
    sim.collect(id);
    const before = sim.digPower;
    sim.collect(id);
    expect(sim.digPower - before).toBeGreaterThan(fossilPower(at(L1, 2), 0));
  });
});

describe('combo and luck', () => {
  it('combo rises while tapping, caps at full and doubles luck at most', () => {
    const sim = new DigSim(1);
    for (let i = 0; i < 200; i++) {
      sim.tap();
      sim.tick(0.1);
    }
    expect(sim.combo).toBe(1);
    expect(sim.luck).toBeCloseTo(2 * sim.baseLuck, 9);
    expect(COMBO.maxMult).toBe(2);
  });

  it('combo drains when you stop', () => {
    const sim = new DigSim(1);
    for (let i = 0; i < 30; i++) {
      sim.tap();
      sim.tick(0.1);
    }
    const c = sim.combo;
    sim.tick(1);
    expect(sim.combo).toBeLessThan(c);
    sim.tick(30);
    expect(sim.combo).toBe(0);
    expect(sim.luck).toBe(sim.baseLuck);
  });

  it('luck upgrade, rewarded boost and set bonus multiply base luck', () => {
    const sim = new DigSim(1, saveWith((s) => (s.levels.luck = 4)));
    expect(sim.baseLuck).toBeCloseTo(UPGRADES.luck.effect(4), 9);
    sim.grantLuckBoost(60);
    expect(sim.baseLuck).toBeCloseTo(UPGRADES.luck.effect(4) * 2, 9);
    sim.tick(61);
    expect(sim.baseLuck).toBeCloseTo(UPGRADES.luck.effect(4), 9);
  });
});

describe('glint', () => {
  it('appears 20-40 s apart for 3 s, and tapping it rolls once at 10x luck', () => {
    const sim = new DigSim(9, saveWith((s) => (s.stats.taps = 1))); // not a brand-new dig
    expect(sim.glint).toBeNull();
    expect(sim.tapGlint()).toBeNull();
    let t = 0;
    while (!sim.glint && t < 60) {
      sim.tick(0.1);
      t += 0.1;
    }
    expect(t).toBeGreaterThanOrEqual(GLINT.minGap - 0.11);
    expect(t).toBeLessThanOrEqual(GLINT.maxGap + 0.11);
    const g = sim.glint!;
    expect(g.x).toBeGreaterThan(0);
    expect(g.x).toBeLessThan(1);
    const find = sim.tapGlint();
    expect(find).not.toBeNull();
    expect(find!.source).toBe('glint');
    expect(find!.luck).toBeCloseTo(sim.luck * 10, 9); // combo unchanged since spawn: 10x the tap luck
    expect(sim.glint).toBeNull();
  });

  it('expires after its lifetime', () => {
    const sim = new DigSim(9);
    while (!sim.glint) sim.tick(0.1);
    sim.tick(GLINT.life + 0.05);
    expect(sim.glint).toBeNull();
  });
});

describe('upgrades', () => {
  it('cost dust, raise the level and get more expensive', () => {
    const sim = new DigSim(1, saveWith((s) => (s.dust = 1_000_000)));
    const c0 = sim.upgradeCost('pick')!;
    expect(sim.buy('pick')).toBe(true);
    expect(sim.level('pick')).toBe(1);
    expect(sim.dust).toBe(1_000_000 - c0);
    expect(sim.upgradeCost('pick')!).toBeGreaterThan(c0);
  });

  it('refuses when unaffordable or maxed', () => {
    const sim = new DigSim(1);
    expect(sim.buy('luck')).toBe(false);
    const maxed = new DigSim(1, saveWith((s) => {
      s.dust = 1e15;
      s.levels.offline = UPGRADES.offline.maxLevel;
    }));
    expect(maxed.upgradeCost('offline')).toBeNull();
    expect(maxed.buy('offline')).toBe(false);
  });

  it('the assistant digs on its own', () => {
    const sim = new DigSim(1, saveWith((s) => (s.levels.assistant = 3)));
    const r = sim.tick(60);
    expect(r.finds.length).toBeGreaterThan(0);
    expect(r.finds.every((f) => f.source === 'assistant')).toBe(true);
  });
});

describe('layers', () => {
  it('unlocks the next layer when dig power reaches its threshold, and only then can you travel', () => {
    const sim = new DigSim(1);
    expect(sim.travel(1)).toBe(false);
    const need = at(LAYERS, 1).unlockPower;
    const s = saveWith((d) => (d.counts[at(L1, 0).id] = [0, 0, 0, Math.ceil(need / fossilPower(at(L1, 0), 3))]));
    const rich = new DigSim(1, s);
    expect(rich.digPower).toBeGreaterThanOrEqual(need);
    expect(rich.unlocked).toBeGreaterThanOrEqual(1); // a loaded save past the threshold is unlocked at once
    // A find that pushes power over the threshold reports the unlock.
    const growing = new DigSim(2);
    let unlockedBy = null;
    for (let i = 0; i < 5000 && unlockedBy === null; i++) unlockedBy = growing.tap().find?.unlocked ?? null;
    expect(unlockedBy).toBe(1);
    expect(growing.digPower).toBeGreaterThanOrEqual(need);
    expect(rich.travel(1)).toBe(true);
    expect(rich.layer).toBe(1);
    expect(breakOne(rich).fossil.layer).toBe(1);
  });

  it('completing a layer set grants its permanent bonus once', () => {
    const s = saveWith((d) => {
      for (const f of L1.slice(1)) d.counts[f.id] = [1, 0, 0, 0];
    });
    const sim = new DigSim(1, s);
    expect(sim.setComplete(0)).toBe(false);
    const luck = sim.baseLuck;
    const r = sim.collect(at(L1, 0).id);
    expect(r.setCompleted).toBe(0);
    expect(sim.setComplete(0)).toBe(true);
    expect(sim.baseLuck).toBeGreaterThan(luck);
    expect(sim.collect(at(L1, 0).id).setCompleted).toBeNull();
  });
});

describe('offline haul', () => {
  const withAssistant = (lvl: number, offlineLvl = 0) =>
    new DigSim(5, saveWith((s) => {
      s.levels.assistant = lvl;
      s.levels.offline = offlineLvl;
    }));

  it('pays nothing without an assistant or for zero / negative time', () => {
    expect(new DigSim(1).claimOffline(3600).hits).toBe(0);
    expect(withAssistant(2).claimOffline(0).hits).toBe(0);
    expect(withAssistant(2).claimOffline(-500).hits).toBe(0);
    expect(withAssistant(2).claimOffline(Number.NaN).hits).toBe(0);
  });

  it('runs at a lower rate than active assistant play', () => {
    const sim = withAssistant(4);
    const haul = sim.claimOffline(600);
    expect(OFFLINE.efficiency).toBeLessThan(1);
    expect(haul.hits).toBe(Math.floor(600 * sim.assistantRate * OFFLINE.efficiency));
    expect(haul.hits).toBeLessThan(600 * sim.assistantRate);
  });

  it('respects the cap, which never exceeds 2 hours', () => {
    const capSec = withAssistant(4).offlineCap;
    expect(capSec).toBe(OFFLINE.baseCap);
    const a = withAssistant(4).claimOffline(capSec);
    const b = withAssistant(4).claimOffline(capSec * 20);
    expect(b.seconds).toBe(capSec);
    expect(b.hits).toBe(a.hits);
    const maxed = new DigSim(1, saveWith((s) => {
      s.levels.offline = UPGRADES.offline.maxLevel;
      for (const f of layerFossils(2)) s.counts[f.id] = [1, 0, 0, 0]; // set bonus: + cap
    }));
    expect(maxed.offlineCap).toBe(2 * 3600);
    expect(OFFLINE.maxCap).toBe(2 * 3600);
  });

  it('adds the haul to the collection and dust; doubling adds the dust once more', () => {
    const sim = withAssistant(5);
    const haul = sim.claimOffline(1800);
    expect(haul.blocks).toBeGreaterThan(0);
    expect(sim.dust).toBe(haul.dust + haul.questDust);
    const total = Object.values(haul.found).reduce((a, b) => a + b, 0);
    expect(total).toBe(haul.rolls);
    expect(haul.rolls).toBeGreaterThanOrEqual(haul.blocks);
    expect(sim.doubleOfflineDust()).toBe(true);
    expect(sim.dust).toBe(haul.dust * 2 + haul.questDust);
    expect(sim.doubleOfflineDust()).toBe(false);
  });
});

describe('save', () => {
  it('round-trips through JSON and keeps rolling identically', () => {
    const a = new DigSim(11, saveWith((s) => (s.levels.assistant = 2)));
    for (let i = 0; i < 25; i++) breakOne(a);
    a.tick(33.3);
    a.buy('pick');
    const json = JSON.parse(JSON.stringify(a.toSave())) as DigSave;
    const b = new DigSim(999, json); // the saved rng state wins over the seed
    expect(b.toSave()).toEqual(a.toSave());
    for (let i = 0; i < 20; i++) expect(breakOne(b).fossil.id).toBe(breakOne(a).fossil.id);
    expect(b.toSave()).toEqual(a.toSave());
  });

  it('repairs junk on load instead of crashing', () => {
    const junk = { ...defaultSave(), dust: -5, counts: { nope: [1, 2, 3, 4], [at(FOSSILS, 0).id]: [Number.NaN, 1, 0, 0] } } as unknown as DigSave;
    const sim = new DigSim(1, junk);
    expect(sim.dust).toBe(0);
    expect(sim.grades(at(FOSSILS, 0).id)).toEqual([0, 1, 0, 0]);
    expect(sim.toSave().counts).not.toHaveProperty('nope');
  });
});
