/**
 * The depth round: Abyssal Trench (pressure), Star Crater (meteor cores), Time Rift (echoes),
 * the deep upgrade levels, the new goals and ranks. Honesty first: every new roll is printed.
 */
import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  at,
  ECHO,
  EXPEDITION,
  FOSSILS,
  LAYERS,
  METEOR,
  PRESSURE,
  RANKS,
  TOTAL_WEIGHT,
  UPGRADES,
  upgradeCost,
} from '../../src/sim/data';
import { DigSim, defaultSave, type BlockKind, type DigSave } from '../../src/sim/dig';
import { effectiveLuck, layerFossils, rollFossil, rollProbabilities } from '../../src/sim/loot';
import { STRINGS } from '../../src/strings';

const idx = (id: string): number => LAYERS.findIndex((l) => l.id === id);
const TRENCH = idx('trench');
const CRATER = idx('crater');
const RIFT = idx('rift');

function on(layer: number, kind: BlockKind = 'normal', mut: (s: DigSave) => void = () => {}, seed = 3): DigSim {
  const s = defaultSave();
  s.unlocked = layer;
  s.layer = layer;
  s.block = { kind, timer: -1 };
  if (kind === 'meteor') Object.assign(s.block, { x: 0.5, y: 0.5 });
  if (kind === 'echo') Object.assign(s.block, { echo: 2 });
  s.stats.rolls = 100;
  s.counts['topsoil-01'] = [0, 0, 0, Math.ceil(at(LAYERS, layer).hp / 64 / 4)];
  mut(s);
  return new DigSim(seed, s);
}

describe('the three new layers (data)', () => {
  it('follow the First Seas in order, each with its own twist, set bonus and 12 fossils', () => {
    expect([TRENCH, CRATER, RIFT]).toEqual([10, 11, 12]);
    expect([TRENCH, CRATER, RIFT].map((l) => at(LAYERS, l).twist)).toEqual(['pressure', 'meteor', 'echo']);
    for (const l of [TRENCH, CRATER, RIFT]) {
      const fs = layerFossils(l);
      expect(fs).toHaveLength(12);
      expect(fs.reduce((s, f) => s + f.weight, 0)).toBe(TOTAL_WEIGHT);
      for (const f of fs) expect(f.weight * f.odds).toBe(TOTAL_WEIGHT);
      // rarest last, at least a legendary, ids in the existing scheme
      for (let i = 1; i < fs.length; i++) expect(at(fs, i).odds).toBeGreaterThan(at(fs, i - 1).odds);
      expect(Math.max(...fs.map((f) => f.tier))).toBeGreaterThanOrEqual(5);
      fs.forEach((f, i) => expect(f.id).toBe(`${at(LAYERS, l).id}-${String(i + 1).padStart(2, '0')}`));
    }
  });

  it('keep the curve rising: every number grows layer over layer', () => {
    for (let l = 1; l < LAYERS.length; l++) {
      const a = at(LAYERS, l - 1);
      const b = at(LAYERS, l);
      expect(b.hp, b.id).toBeGreaterThan(a.hp);
      expect(b.powerScale, b.id).toBeGreaterThan(a.powerScale);
      expect(b.dust, b.id).toBeGreaterThan(a.dust);
      expect(b.unlockPower, b.id).toBeGreaterThan(a.unlockPower);
    }
  });

  it('print true odds: 1.2M seeded rolls per new layer match 1/odds (chi-square)', () => {
    for (const l of [TRENCH, CRATER, RIFT]) {
      const fs = layerFossils(l);
      const rng = createRng(77 + l);
      const n = new Map(fs.map((f) => [f.id, 0]));
      const N = 1_200_000;
      for (let i = 0; i < N; i++) {
        const f = rollFossil(l, 1, rng);
        n.set(f.id, (n.get(f.id) ?? 0) + 1);
      }
      let chi = 0;
      for (const f of fs) {
        const e = N / f.odds;
        chi += ((n.get(f.id) ?? 0) - e) ** 2 / e;
      }
      expect(chi, at(LAYERS, l).id).toBeLessThan(40);
    }
  });

  it('every new fossil has an English and a Turkish name, all distinct', () => {
    for (const lang of ['en', 'tr'] as const) {
      const table = STRINGS[lang] as Record<string, string>;
      const names = FOSSILS.map((f) => table[`fossil.${f.id}`]);
      for (const n of names) expect(n).toBeTruthy();
      expect(new Set(names).size).toBe(names.length);
      for (const l of [TRENCH, CRATER, RIFT]) expect(table[`layer.${at(LAYERS, l).id}`]).toBeTruthy();
    }
  });
});

describe(`pressure (Abyssal Trench): ×${PRESSURE.min} at no combo → ×${PRESSURE.max} at a full combo`, () => {
  it('scales tap damage by the combo shown before the tap', () => {
    const cold = on(TRENCH, 'pressure', (s) => (s.combo = 0));
    expect(cold.pressureMult).toBe(PRESSURE.min);
    expect(cold.tap().damage).toBeCloseTo(cold.digPower * PRESSURE.min, 6);
    const hot = on(TRENCH, 'pressure', (s) => (s.combo = 1));
    expect(hot.tapMult).toBe(PRESSURE.max);
    expect(hot.tap().damage).toBeCloseTo(hot.digPower * PRESSURE.max, 6);
    const half = on(TRENCH, 'pressure', (s) => (s.combo = 0.5));
    expect(half.tap().damage).toBeCloseTo(half.digPower * (PRESSURE.min + (PRESSURE.max - PRESSURE.min) / 2), 6);
    const plain = on(TRENCH, 'normal', (s) => (s.combo = 1));
    expect(plain.tap().damage).toBe(plain.digPower);
  });

  it('the assistant always strikes at the minimum', () => {
    const sim = on(TRENCH, 'pressure', (s) => {
      s.combo = 1;
      s.levels.assistant = 10;
    });
    const before = sim.blockDamage;
    const r = sim.tick(1);
    expect(r.assistantHits).toBe(1);
    expect(sim.blockDamage - before).toBeCloseTo(sim.digPower * PRESSURE.min, 6);
  });

  it(`about ${PRESSURE.chance * 100} % of Trench blocks are pressure blocks`, () => {
    const sim = on(TRENCH, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1e12]));
    let n = 0;
    let p = 0;
    for (let i = 0; i < 4000; i++) {
      if (sim.tap().broke) {
        n++;
        if (sim.block.kind === 'pressure') p++;
      }
    }
    expect(p / n).toBeGreaterThan(PRESSURE.chance * 0.75);
    expect(p / n).toBeLessThan(PRESSURE.chance * 1.15);
  });
});

describe(`meteor (Star Crater): the star core takes ×${METEOR.core}`, () => {
  it('a tap on the core deals ×3 and moves it; a tap elsewhere is a plain tap', () => {
    const sim = on(CRATER, 'meteor');
    const core = sim.meteorCore!;
    expect(core).toEqual({ x: 0.5, y: 0.5 });
    expect(sim.onCore({ x: 0.5 + METEOR.radius * 0.9, y: 0.5 })).toBe(true);
    expect(sim.onCore({ x: 0.5 + METEOR.radius * 1.1, y: 0.5 })).toBe(false);
    const hit = sim.tap(core);
    expect(hit.core).toBe(true);
    expect(hit.damage).toBe(sim.digPower * METEOR.core);
    expect(sim.meteorCore).not.toEqual(core);
    expect(sim.stats.cores).toBe(1);
    const miss = on(CRATER, 'meteor');
    const r = miss.tap({ x: 0.05, y: 0.05 });
    expect(r.core).toBe(false);
    expect(r.damage).toBe(miss.digPower);
    expect(on(CRATER, 'meteor').tap().core).toBe(false); // no position: no core
    expect(on(CRATER, 'normal').tap({ x: 0.5, y: 0.5 }).core).toBe(false);
  });

  it('new meteor blocks place the core inside the face, and the sim stays deterministic', () => {
    const a = on(CRATER, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1e12]), 5);
    const b = on(CRATER, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1e12]), 5);
    let seen = 0;
    for (let i = 0; i < 600; i++) {
      a.tap(a.meteorCore ?? undefined);
      b.tap(b.meteorCore ?? undefined);
      const c = a.meteorCore;
      if (c) {
        seen++;
        expect(c.x).toBeGreaterThanOrEqual(0.2);
        expect(c.x).toBeLessThanOrEqual(0.8);
        expect(c.y).toBeGreaterThanOrEqual(0.2);
        expect(c.y).toBeLessThanOrEqual(0.8);
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(a.toSave()).toEqual(b.toSave());
  });
});

describe('echo (Time Rift): one extra roll from the echoed layer, at its printed odds', () => {
  it('breaking an echo block rolls this layer and the echoed one, each find carrying its own luck', () => {
    const sim = on(RIFT, 'echo', (s) => (s.combo = 1));
    expect(sim.echoLayer).toBe(2);
    const shown = sim.echoLuck;
    expect(shown).toBe(effectiveLuck(2, sim.baseLuck * sim.comboMult));
    let r = sim.tap();
    while (!r.broke) r = sim.tap();
    expect(r.find!.fossil.layer).toBe(RIFT);
    expect(r.extra).toHaveLength(1);
    expect(at(r.extra, 0).fossil.layer).toBe(2);
    expect(at(r.extra, 0).block).not.toBe('cavein');
    expect(sim.stats.echoes).toBe(1);
  });

  it('echo rolls follow the echoed table exactly (chi-square at the luck each find carries)', () => {
    // Echo breaks of the Cretaceous by the assistant (no combo): the extra finds
    // must be distributed exactly as the Cretaceous table prints.
    const fs = layerFossils(2);
    const n = new Map(fs.map((f) => [f.id, 0]));
    let N = 0;
    const exp: number[] = [];
    const sim = on(RIFT, 'echo', (s) => {
      s.counts['topsoil-01'] = [0, 0, 0, 1e14]; // one hit per block
      s.levels.assistant = 35;
    });
    while (N < 1_500) {
      for (const f of sim.tick(20).finds) {
        if (f.fossil.layer !== 2 || f.pity) continue;
        // sets completed on the way can raise base luck: expect each find at the luck it carries
        rollProbabilities(2, f.luck).forEach((q, i) => (exp[i] = (exp[i] ?? 0) + q));
        n.set(f.fossil.id, (n.get(f.fossil.id) ?? 0) + 1);
        N++;
      }
    }
    let chi = 0;
    fs.forEach((f, i) => {
      const e = at(exp, i);
      if (e < 5) return;
      chi += ((n.get(f.id) ?? 0) - e) ** 2 / e;
    });
    expect(chi).toBeLessThan(40);
  }, 120_000);

  it(`echoes only ever name an earlier layer, about ${ECHO.chance * 100} % of Rift blocks`, () => {
    const sim = on(RIFT, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1e12]));
    const seen = new Set<number>();
    let n = 0;
    let e = 0;
    for (let i = 0; i < 6000; i++) {
      if (!sim.tap().broke) continue;
      n++;
      if (sim.block.kind === 'echo') {
        e++;
        seen.add(sim.echoLayer);
        expect(sim.echoLayer).toBeGreaterThanOrEqual(0);
        expect(sim.echoLayer).toBeLessThan(RIFT);
      }
    }
    expect(e / n).toBeGreaterThan(ECHO.chance * 0.75);
    expect(e / n).toBeLessThan(ECHO.chance * 1.2);
    expect(seen.size).toBeGreaterThan(8);
  });

  it('a loaded echo or meteor block is repaired, never invalid', () => {
    const bad = new DigSim(1, { ...defaultSave(), layer: RIFT, unlocked: RIFT, block: { kind: 'echo', timer: -1, echo: 99 } });
    expect(bad.echoLayer).toBe(RIFT - 1);
    const m = new DigSim(1, { ...defaultSave(), layer: CRATER, unlocked: CRATER, block: { kind: 'meteor', timer: -1, x: Number.NaN } as never });
    expect(m.meteorCore).toEqual({ x: 0.5, y: 0.5 });
    const top = new DigSim(1, { ...defaultSave(), block: { kind: 'echo', timer: -1, echo: 0 } });
    expect(top.block.kind).toBe('normal');
  });
});

describe('longer road', () => {
  it(`the expedition opens at the deepest layer (${at(LAYERS, EXPEDITION.needLayer).id})`, () => {
    expect(EXPEDITION.needLayer).toBe(LAYERS.length - 1);
    expect(on(RIFT - 1).canExpedition).toBe(false);
    expect(on(RIFT).canExpedition).toBe(true);
  });

  it('deep upgrade levels cost ×10,000 more from where the old cap was, so they never speed up the start', () => {
    for (const id of ['luck', 'assistant'] as const) {
      const u = UPGRADES[id];
      const from = u.late!.from;
      expect(u.maxLevel).toBeGreaterThan(from);
      expect(upgradeCost(id, from - 1)).toBe(Math.floor(u.baseCost * u.costGrowth ** (from - 1)));
      expect(upgradeCost(id, from)).toBe(Math.floor(u.baseCost * u.costGrowth ** from * u.late!.mult));
      expect(upgradeCost(id, u.maxLevel)).toBeNull();
    }
    expect(UPGRADES.luck.late!.from).toBe(12);
    expect(UPGRADES.assistant.late!.from).toBe(25);
  });

  it('new goals and ranks: depth 11-13, cores, echoes, 120 / 156 species, up to rank 15', () => {
    for (const id of ['depth-11', 'depth-12', 'depth-13', 'cores-100', 'echoes-25', 'species-156', 'sets-13', 'expeditions-10']) expect(ACHIEVEMENTS.some((a) => a.id === id), id).toBe(true);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(RANKS).toHaveLength(15);
    const cores = on(CRATER, 'meteor', (s) => (s.stats.cores = 99));
    let r = cores.tap(cores.meteorCore!);
    const events = [...r.events];
    while (!r.broke) events.push(...(r = cores.tap()).events);
    expect(cores.stats.cores).toBe(100);
    expect(events.some((e) => e.kind === 'quest' && e.id === 'cores-100')).toBe(true);
  });
});
