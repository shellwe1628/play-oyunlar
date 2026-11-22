/**
 * Dig Rush: 45 seconds of light blocks on the current layer. Honesty first: a rush find is a tap
 * find from the same table at the luck on screen. Then the rules, the balance guard, the
 * wall-clock cooldown and the save.
 */
import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { cooldown } from '../../src/sim/clock';
import { OFFLINE_MIN_SECONDS } from '../../src/session';
import { at, BOSS, CHAIN, FOSSIL_BY_ID, GLINT, GOLDEN, LAYERS, PITY, RELIC, RUSH, UNSTABLE, WEAK } from '../../src/sim/data';
import { DigSim, defaultSave, type BlockKind, type DigSave, type Find, type RushResult } from '../../src/sim/dig';
import { layerFossils, LUCKY_TIER, rollProbabilities } from '../../src/sim/loot';
import { flatSave, measureRush, saveOn, type RushMeasure } from './rushPlayer';

const H = 3600_000;
const T0 = 1_800_000_000_000; // some wall-clock time

/** A dig with the rush on offer, parked on `layer`, breaking a normal block in about `taps` taps. */
function ready(layer = 0, mut: (s: DigSave) => void = () => {}, taps = 4, seed = 3): DigSim {
  const s = defaultSave();
  for (const f of layerFossils(0).slice(0, RUSH.species)) s.counts[f.id] = [1, 0, 0, 0];
  s.unlocked = layer;
  s.layer = layer;
  s.stats.rolls = 400; // golden blocks may appear
  s.stats.taps = 400;
  s.glintIn = 1e6;
  s.counts['topsoil-01'] = [1, 0, 0, Math.ceil(at(LAYERS, layer).hp / 64 / taps)];
  mut(s);
  return new DigSim(seed, s);
}

/** Tap `perStep` times, then tick 0.1 s, until the rush is over. Returns every find and break. */
function runRush(sim: DigSim, perStep = 1, each: (find: Find, shown: number) => void = () => {}): { finds: Find[]; breaks: number; dust: number; result: RushResult } {
  const finds: Find[] = [];
  let breaks = 0;
  let dust = 0;
  while (sim.rushActive) {
    for (let k = 0; k < perStep && sim.rushActive; k++) {
      const shown = sim.luck;
      const r = sim.tap();
      if (r.broke) breaks++;
      dust += r.dust;
      for (const f of r.find ? [r.find, ...r.extra] : r.extra) {
        finds.push(f);
        each(f, shown);
      }
    }
    sim.tick(0.1);
  }
  const result = sim.takeRushResult();
  if (!result) throw new Error('no result');
  return { finds, breaks, dust, result };
}

describe('the rush is offered early and starts with a tap', () => {
  it(`is offered once Topsoil has ${RUSH.species} species, not before`, () => {
    const three = new DigSim(1, { ...defaultSave(), counts: Object.fromEntries(layerFossils(0).slice(0, RUSH.species - 1).map((f) => [f.id, [1, 0, 0, 0]])) });
    expect(three.rushOpen).toBe(false);
    expect(three.rushReady).toBe(false);
    expect(three.startRush()).toBe(false);
    expect(three.rushActive).toBe(false);
    const four = ready();
    expect(four.rushOpen).toBe(true);
    expect(four.rushReady).toBe(true);
    expect(four.rushWait).toBe(0);
  });

  it('a brand-new player meets it within the first minutes of tapping', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new DigSim(seed);
      let t = 0;
      while (!sim.rushOpen && t < 600) {
        sim.tap();
        sim.tick(0.4); // 2.5 taps per second
        t += 0.4;
      }
      expect(t, `seed ${seed}`).toBeLessThan(90);
    }
  });

  it(`lasts ${RUSH.seconds} s of play, counts down, and cannot be started twice`, () => {
    const sim = ready();
    expect(sim.startRush()).toBe(true);
    expect(sim.rushActive).toBe(true);
    expect(sim.rushLeft).toBe(RUSH.seconds);
    expect(sim.startRush()).toBe(false);
    sim.tick(10);
    expect(sim.rushLeft).toBeCloseTo(RUSH.seconds - 10, 9);
    sim.tick(RUSH.seconds - 10.1);
    expect(sim.rushActive).toBe(true);
    sim.tick(0.2);
    expect(sim.rushActive).toBe(false);
    expect(sim.rushLeft).toBe(0);
    expect(sim.rushCount).toBe(1);
  });
});

describe(`rush blocks: ${RUSH.hp * 100} % of the normal health, plain or golden only`, () => {
  it('a rush block has 30 % of the health of a normal block of the layer (literal numbers)', () => {
    // written out, not derived from the constant: a lighter rush block must fail here
    expect(RUSH.hp).toBe(0.3);
    const literal: Record<number, number> = { 0: 2, 1: 1800, 3: 1_350_000, 6: 660_000_000 };
    for (const layer of [0, 1, 3, 6, 9, 12]) {
      const sim = ready(layer, (s) => (s.stats.rolls = 0)); // no golden in this one
      const normal = sim.blockHp;
      expect(normal).toBe(sim.hpOf(layer));
      expect(sim.rushHp).toBe(Math.max(1, Math.ceil(normal * 0.3)));
      sim.startRush();
      expect(sim.blockHp).toBe(Math.max(1, Math.ceil(normal * 0.3)));
      const want = literal[layer];
      if (want !== undefined) expect(sim.blockHp, at(LAYERS, layer).id).toBe(want);
    }
  });

  it('special blocks rest during a rush on every layer; golden ones still turn up', () => {
    for (let layer = 0; layer < LAYERS.length; layer++) {
      const sim = ready(layer, (s) => (s.counts['topsoil-01'] = [1, 0, 0, 1e13]), 1, 11 + layer);
      sim.startRush();
      const kinds = new Map<BlockKind, number>();
      let n = 0;
      while (sim.rushActive) {
        for (let k = 0; k < 20; k++) {
          kinds.set(sim.block.kind, (kinds.get(sim.block.kind) ?? 0) + 1);
          sim.tap();
          n++;
        }
        sim.tick(0.1);
      }
      expect([...kinds.keys()].sort(), at(LAYERS, layer).id).toEqual(['golden', 'normal']);
      const golden = (kinds.get('golden') ?? 0) / n;
      expect(golden).toBeGreaterThan(GOLDEN.chance * 0.6);
      expect(golden).toBeLessThan(GOLDEN.chance * 1.5);
    }
  });

  it('a golden rush block has ×1.5 of the rush health, two fossils and ×5 dust', () => {
    const sim = ready(2, () => {}, 4, 5);
    sim.startRush();
    const plainHp = Math.ceil(sim.hpOf(2) * RUSH.hp);
    let seen = false;
    for (let i = 0; i < 4000 && sim.rushActive && !seen; i++) {
      if (sim.block.kind !== 'golden') {
        sim.tap();
        continue;
      }
      seen = true;
      expect(sim.blockHp).toBe(Math.ceil(sim.hpOf(2) * GOLDEN.hp * RUSH.hp));
      expect(sim.blockHp).toBeGreaterThan(plainHp);
      const base = sim.blockDust(2);
      let r = sim.tap();
      while (!r.broke) r = sim.tap();
      expect(r.extra).toHaveLength(GOLDEN.rolls - 1);
      expect(r.dust).toBe(Math.ceil(base * GOLDEN.dust * RUSH.dust * sim.chainMult));
    }
    expect(seen).toBe(true);
  });

  it('does not harden the stratum or move the boss on, and gives back the block that was being dug', () => {
    const seas = LAYERS.findIndex((l) => l.twist === 'boss');
    const sim = ready(seas, (s) => {
      s.block = { kind: 'boss', timer: -1 };
      s.broken[seas] = BOSS.every - 1;
    });
    // half-way through the boss
    while (sim.blockDamage < sim.blockHp / 2) sim.tap();
    const before = { broken: sim.blocksBroken(seas), hp: sim.hpOf(seas), damage: sim.blockDamage, dust: sim.blockDust(seas) };
    sim.startRush();
    expect(sim.block.kind).not.toBe('boss');
    expect(sim.blockDamage).toBe(0);
    const { breaks, result } = runRush(sim, 3);
    expect(breaks).toBeGreaterThan(20);
    expect(result.blocks).toBe(breaks);
    expect(sim.blocksBroken(seas)).toBe(before.broken);
    expect(sim.hpOf(seas)).toBe(before.hp);
    expect(sim.blockDust(seas)).toBe(before.dust);
    expect(sim.block.kind).toBe('boss');
    expect(sim.blockDamage).toBe(before.damage);
  });

  it('no relic fragments in a rush (Crystal Geode); a rush stays on its layer', () => {
    const geode = LAYERS.findIndex((l) => l.twist === 'relic');
    const sim = ready(geode, (s) => (s.counts['topsoil-01'] = [1, 0, 0, 1e12]), 1);
    sim.startRush();
    expect(sim.travel(0)).toBe(false);
    expect(sim.layer).toBe(geode);
    const { breaks } = runRush(sim, 5);
    expect(breaks).toBeGreaterThan(1000 * RELIC.chance); // plenty of chances
    expect(sim.fragments).toBe(0);
    expect(sim.travel(0)).toBe(true);
  });

  it('weak spots, fever and chains work in a rush', () => {
    const sim = ready(3, () => {}, 40);
    sim.startRush();
    let precise = 0;
    let chained = 0;
    let fever = false;
    while (sim.rushActive) {
      for (let k = 0; k < 2 && sim.rushActive; k++) {
        const spot = sim.weakSpot;
        const mult = sim.weakMult;
        const power = sim.digPower * sim.tapMult;
        const r = sim.tap(spot ?? undefined);
        if (r.precise) {
          precise++;
          expect(r.damage).toBeCloseTo(power * mult, 3);
        }
        if (r.events.some((e) => e.kind === 'chain')) chained++;
        if (r.events.some((e) => e.kind === 'fever')) fever = true;
      }
      sim.tick(0.1);
    }
    expect(precise).toBeGreaterThanOrEqual(Math.floor(RUSH.seconds / (WEAK.maxGap + WEAK.life)) - 1);
    expect(chained).toBeGreaterThan(10);
    expect(fever).toBe(true);
    expect(CHAIN.max).toBe(2);
  });
});

describe('rush finds are real, and rolled at the luck on screen (honesty)', () => {
  it('every break rolls once at the luck shown before the tap, marked as a rush find, and goes to the museum', () => {
    const sim = ready(1, (s) => (s.levels.luck = 4));
    const rolls0 = sim.stats.rolls;
    const copies0 = layerFossils(1).reduce((n, f) => n + sim.count(f.id), 0);
    sim.startRush();
    let golden = 0;
    const { finds, breaks, result } = runRush(sim, 2, (f, shown) => {
      expect(f.luck).toBeCloseTo(shown, 12);
      expect(f.source).toBe('tap');
      expect(f.rush).toBe(true);
      expect(f.fossil.layer).toBe(1);
      if (f.block === 'golden') golden++;
    });
    expect(finds.length).toBeGreaterThan(40);
    expect(golden % GOLDEN.rolls).toBe(0);
    expect(finds).toHaveLength(breaks + golden / GOLDEN.rolls); // one per block, two for a golden one
    expect(result.rolls).toBe(finds.length);
    expect(sim.stats.rolls - rolls0).toBe(finds.length);
    expect(layerFossils(1).reduce((n, f) => n + sim.count(f.id), 0) - copies0).toBe(finds.length);
    expect(finds.some((f) => f.fusions > 0)).toBe(true); // they fuse like any other copy
    // after the rush a find is an ordinary one again
    let r = sim.tap();
    while (!r.find) r = sim.tap();
    expect(r.find.rush).toBeUndefined();
  });

  it('the combo, the charm and the boost count exactly as for a normal tap; nothing else adds luck', () => {
    const sim = ready(2, (s) => {
      s.levels.luck = 2;
      s.boost = 600;
    });
    const calm = sim.luck; // no combo yet
    sim.startRush();
    expect(sim.luck).toBe(calm); // starting a rush changes no luck
    expect(sim.baseLuck).toBe(1.5 * 2);
    for (let i = 0; i < 30; i++) sim.tap();
    expect(sim.luck).toBeCloseTo(sim.baseLuck * sim.comboMult, 12);
  });

  it('rush finds follow the printed table (chi-square at the luck each find carries)', () => {
    const fs = layerFossils(1);
    const n = new Map(fs.map((f) => [f.id, 0]));
    const exp: number[] = [];
    let N = 0;
    const sim = ready(1, (s) => (s.counts['topsoil-01'] = [1, 0, 0, 1e6]), 1, 21);
    let clock = T0;
    while (N < 12_000) {
      sim.setClock((clock += 4 * H));
      expect(sim.startRush()).toBe(true);
      runRush(sim, 10, (f) => {
        if (f.pity) return;
        rollProbabilities(1, f.luck).forEach((q, i) => (exp[i] = (exp[i] ?? 0) + q));
        n.set(f.fossil.id, (n.get(f.fossil.id) ?? 0) + 1);
        N++;
      });
    }
    let chi = 0;
    fs.forEach((f, i) => {
      const e = at(exp, i);
      if (e < 5) return;
      chi += ((n.get(f.id) ?? 0) - e) ** 2 / e;
    });
    expect(chi).toBeLessThan(40);
  }, 60_000);
});

describe('the result and the personal best', () => {
  it('lists blocks, dust and finds rarest first, once', () => {
    const sim = ready(1);
    sim.startRush();
    const { finds, breaks, dust, result } = runRush(sim, 3);
    expect(result.layer).toBe(1);
    expect(result.blocks).toBe(breaks);
    expect(result.dust).toBe(dust); // what the blocks paid (goal rewards are not part of it)
    expect(result.dust).toBeGreaterThan(0);
    const total = result.finds.reduce((s, f) => s + f.n, 0);
    expect(total).toBe(finds.length);
    for (let i = 1; i < result.finds.length; i++) expect(at(result.finds, i - 1).fossil.odds).toBeGreaterThanOrEqual(at(result.finds, i).fossil.odds);
    for (const f of result.finds) {
      expect(FOSSIL_BY_ID.has(f.fossil.id)).toBe(true);
      expect(f.isNew).toBe(finds.some((x) => x.fossil.id === f.fossil.id && x.isNew));
    }
    expect(sim.takeRushResult()).toBeNull(); // taken once
  });

  it('keeps the most blocks ever broken in one rush', () => {
    const sim = ready(1);
    sim.setClock(T0);
    sim.startRush();
    const first = runRush(sim, 1).result;
    expect(first.best).toBe(0);
    expect(first.record).toBe(true);
    expect(sim.rushBest).toBe(first.blocks);
    sim.setClock(T0 + 4 * H);
    sim.startRush();
    const slow = runRush(sim, 0).result; // not a tap
    expect(slow.blocks).toBe(0);
    expect(slow.record).toBe(false);
    expect(slow.best).toBe(first.blocks);
    expect(sim.rushBest).toBe(first.blocks);
    sim.setClock(T0 + 8 * H);
    sim.startRush();
    const fastOne = runRush(sim, 6).result;
    expect(fastOne.blocks).toBeGreaterThan(first.blocks);
    expect(fastOne.record).toBe(true);
    expect(sim.rushBest).toBe(fastOne.blocks);
    expect(sim.rushCount).toBe(3);
  });

  it('leaving the dig screen ends it; what it broke still counts', () => {
    const sim = ready(1);
    sim.startRush();
    for (let i = 0; i < 40; i++) sim.tap();
    const blocks = sim.rushBlocks;
    expect(blocks).toBeGreaterThan(0);
    const r = sim.stopRush()!;
    expect(r.blocks).toBe(blocks);
    expect(r.ended).toBe('left');
    expect(sim.rushActive).toBe(false);
    expect(sim.rushBest).toBe(blocks);
    expect(sim.stopRush()).toBeNull();
  });
});

describe(`cooldown: one rush every ${RUSH.cooldown / 3600} h of wall-clock time`, () => {
  it('counts wall-clock time from the start of the rush, not play time', () => {
    const sim = ready();
    sim.setClock(T0);
    expect(sim.startRush()).toBe(true);
    expect(sim.rushWait).toBe(RUSH.cooldown);
    sim.tick(RUSH.seconds + 1); // the rush itself
    sim.tick(4 * 3600); // hours of play time with a stopped wall clock: nothing
    expect(sim.rushWait).toBe(RUSH.cooldown);
    expect(sim.rushReady).toBe(false);
    expect(sim.startRush()).toBe(false);
    sim.setClock(T0 + 1 * H);
    expect(sim.rushWait).toBe(2 * 3600);
    sim.setClock(T0 + 3 * H - 1000);
    expect(sim.rushWait).toBe(1);
    expect(sim.rushReady).toBe(false);
    sim.setClock(T0 + 3 * H);
    expect(sim.rushWait).toBe(0);
    expect(sim.rushReady).toBe(true);
    expect(sim.startRush()).toBe(true);
    expect(sim.rushWait).toBe(RUSH.cooldown);
  });

  it('winding the device clock back and forth earns no extra rush', () => {
    const sim = ready();
    sim.setClock(T0);
    sim.startRush();
    sim.tick(RUSH.seconds + 1);
    // clock pushed 10 h forward: the one rush that was due anyway
    sim.setClock(T0 + 10 * H);
    expect(sim.startRush()).toBe(true);
    sim.tick(RUSH.seconds + 1);
    // back to the real time: no rush, and the wait does not shrink while the clock is behind
    sim.setClock(T0 + 1 * H);
    expect(sim.rushReady).toBe(false);
    expect(sim.rushWait).toBe(RUSH.cooldown);
    sim.setClock(T0 + 9 * H);
    expect(sim.rushWait).toBe(RUSH.cooldown);
    // forward again to the same future time: still nothing
    sim.setClock(T0 + 10 * H);
    expect(sim.startRush()).toBe(false);
    // set far back, then to the same future once more
    sim.setClock(T0 - 100 * H);
    sim.setClock(T0 + 10 * H);
    expect(sim.startRush()).toBe(false);
    // only time beyond the latest ever seen counts
    sim.setClock(T0 + 12 * H);
    expect(sim.rushWait).toBe(3600);
    sim.setClock(T0 + 13 * H);
    expect(sim.startRush()).toBe(true);
    expect(sim.rushCount).toBe(2); // two finished, the third (the first honest one since) running
  });

  it('the cooldown survives a reload, and the clock rule with it', () => {
    const sim = ready();
    sim.setClock(T0);
    sim.startRush();
    sim.tick(RUSH.seconds + 1);
    sim.setClock(T0 + 5 * H); // wound forward...
    sim.startRush();
    sim.tick(RUSH.seconds + 1);
    const again = new DigSim(1, JSON.parse(JSON.stringify(sim.toSave())) as DigSave);
    again.setClock(T0 + 1 * H); // ...and back before reopening the app
    expect(again.rushReady).toBe(false);
    expect(again.rushWait).toBe(RUSH.cooldown);
    again.setClock(T0 + 8 * H);
    expect(again.rushReady).toBe(true);
    expect(again.rushBest).toBe(sim.rushBest);
    expect(again.rushCount).toBe(2);
  });

  it('the pure rule: the wait is counted from the latest time ever seen', () => {
    expect(cooldown(0, 0, T0)).toEqual({ seconds: 0, seen: T0 }); // no cooldown running
    expect(cooldown(T0 + 3 * H, T0, T0)).toEqual({ seconds: 10_800, seen: T0 });
    expect(cooldown(T0 + 3 * H, T0, T0 + 1 * H)).toEqual({ seconds: 7200, seen: T0 + 1 * H });
    expect(cooldown(T0 + 3 * H, T0 + 1 * H, T0 - 50 * H)).toEqual({ seconds: 7200, seen: T0 + 1 * H }); // rewound
    expect(cooldown(T0 + 3 * H, T0 + 1 * H, T0 + 4 * H)).toEqual({ seconds: 0, seen: T0 + 4 * H });
    expect(cooldown(T0 + 3 * H, T0, Number.NaN)).toEqual({ seconds: 10_800, seen: T0 });
  });
});

describe('the rush in the save', () => {
  // A save exactly as the build before this round wrote it (no `rush`, no `weak`), mid-game.
  const old = (() => {
    const sim = new DigSim(7);
    for (let i = 0; i < 2500; i++) {
      sim.tap();
      if (i % 5 === 0) sim.tick(1);
      if (i % 100 === 0) sim.buy('pick');
    }
    const d = sim.toSave() as unknown as Record<string, unknown>;
    delete d.weak;
    delete d.rush;
    d.lastSeen = T0;
    return d;
  })();

  it('a save from before the rush loads with nothing lost, no best, and the rush on offer', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: SAVE_VERSION, data: old }) });
    const store = createSaveStore(saveOptions(storage, 'test'));
    expect(store.status).toBe('loaded'); // additive fields: no version bump, no migration
    const sim = new DigSim(1, store.data);
    const s = sim.toSave();
    for (const key of Object.keys(old)) expect(s[key as keyof DigSave], key).toEqual(old[key]);
    expect(s.rush).toEqual({ left: 0, blocks: 0, dust: 0, rolls: 0, found: {}, fresh: [], held: null, best: 0, count: 0, readyAt: 0, seen: T0, rng: s.rush.rng });
    expect(sim.rushBest).toBe(0);
    expect(sim.rushActive).toBe(false);
    expect(sim.rushOpen).toBe(true); // they have long had four Topsoil species
    expect(sim.rushReady).toBe(true);
    // and it plays on: the stored save is written back with the new fields and loads again
    expect(sim.startRush()).toBe(true);
    sim.tick(RUSH.seconds + 1);
    store.update((d) => Object.assign(d, sim.toSave()));
    const again = new DigSim(1, createSaveStore(saveOptions(storage, 'test')).data);
    expect(again.toSave()).toEqual(sim.toSave());
    expect(again.rushReady).toBe(false);
  });

  it('a rush that was running when the app closed is over on load: its blocks count, the old block is back', () => {
    const sim = ready(2);
    sim.tap(); // some damage on the block being dug
    const held = { kind: sim.block.kind, damage: sim.blockDamage };
    expect(held.damage).toBeGreaterThan(0);
    sim.setClock(T0);
    sim.startRush();
    for (let i = 0; i < 30; i++) sim.tap();
    const blocks = sim.rushBlocks;
    const dust = sim.dust;
    const again = new DigSim(1, JSON.parse(JSON.stringify(sim.toSave())) as DigSave);
    expect(again.rushActive).toBe(false);
    expect(again.rushBest).toBe(blocks);
    expect(again.rushCount).toBe(1);
    expect(again.block.kind).toBe(held.kind);
    expect(again.blockDamage).toBe(held.damage);
    expect(again.blockHp).toBe(again.hpOf(2));
    expect(again.dust).toBe(dust); // what it found and earned is kept
    expect(again.rushWait).toBe(RUSH.cooldown);
    expect(new DigSim(2, JSON.parse(JSON.stringify(again.toSave())) as DigSave).toSave()).toEqual(again.toSave());
  });

  it('repairs junk instead of crashing', () => {
    const junk = { ...defaultSave(), rush: { left: 'x', blocks: -4, best: Number.NaN, count: 2.7, readyAt: -5, seen: 'never', rng: 1.5, held: 7 } } as unknown as DigSave;
    const sim = new DigSim(1, junk);
    expect(sim.rushActive).toBe(false);
    expect(sim.rushBest).toBe(0);
    expect(sim.rushCount).toBe(2);
    expect(sim.rushWait).toBe(0);
  });
});

describe('the assistant keeps digging the block that was set aside', () => {
  const withHelper = (layer: number, mut: (s: DigSave) => void = () => {}): DigSim =>
    ready(layer, (s) => {
      s.levels.assistant = 20; // 2 hits a second
      mut(s);
    });

  it('its work in a rush is exactly what it would have been without the rush', () => {
    // same save, nobody taps: one dig rushes, the other does not
    const rush = withHelper(3);
    const plain = withHelper(3);
    expect(rush.startRush()).toBe(true);
    const a: string[] = [];
    const b: string[] = [];
    let hits = 0;
    for (let i = 0; i < 460; i++) {
      const ra = rush.tick(0.1);
      const rb = plain.tick(0.1);
      hits += ra.assistantHits;
      expect(ra.assistantHits).toBe(rb.assistantHits);
      for (const f of ra.finds) a.push(`${f.fossil.id}@${f.luck}`);
      for (const f of rb.finds) b.push(`${f.fossil.id}@${f.luck}`);
    }
    expect(rush.rushActive).toBe(false);
    expect(hits).toBeGreaterThan(80);
    expect(a.length).toBeGreaterThan(10);
    expect(a).toEqual(b);
    // the same blocks broken, the same dust, the main stream in the same place...
    expect(rush.blocksBroken(3)).toBe(plain.blocksBroken(3));
    expect(rush.dust).toBe(plain.dust);
    expect(rush.toSave().rng).toBe(plain.toSave().rng);
    // ...and the block that comes back is the one the assistant got to, with its damage
    expect(rush.block).toEqual(plain.block);
    expect(rush.blockDamage).toBe(plain.blockDamage);
    // nobody tapped: the rush itself broke nothing
    const result = rush.takeRushResult()!;
    expect(result.blocks).toBe(0);
    expect(result.rolls).toBe(0);
    expect(rush.rushBest).toBe(0);
  });

  it('never touches a rush block, and the block on screen is not reported as broken', () => {
    const sim = withHelper(3);
    sim.startRush();
    expect(sim.blockHp).toBe(sim.rushHp);
    let breaks = 0;
    let hits = 0;
    for (let i = 0; i < 300; i++) {
      const r = sim.tick(0.1);
      breaks += r.breaks;
      hits += r.assistantHits;
      expect(sim.blockDamage).toBe(0);
      // (30 % of the layer's normal health as it is now: the assistant's own blocks harden the stratum as always)
      expect(sim.blockHp).toBe(sim.rushHp);
    }
    expect(hits).toBeGreaterThan(50);
    expect(breaks).toBe(0); // `breaks` is about the block on screen
    expect(sim.blocksBroken(3)).toBeGreaterThan(5); // the set-aside layer block did break, as always
    expect(sim.rushBlocks).toBe(0);
  });

  it('its finds are assistant finds at the assistant luck shown, never rush finds; only your breaks count for the rush', () => {
    const sim = withHelper(2, (s) => (s.levels.luck = 4));
    sim.startRush();
    let mine = 0;
    let myBreaks = 0;
    let theirs = 0;
    while (sim.rushActive) {
      for (let k = 0; k < 2 && sim.rushActive; k++) {
        const r = sim.tap();
        if (r.broke) myBreaks++;
        for (const f of r.find ? [r.find, ...r.extra] : r.extra) {
          expect(f.source).toBe('tap');
          expect(f.rush).toBe(true);
          mine++;
        }
      }
      const shown = sim.assistantLuck;
      expect(sim.luck).toBeGreaterThan(shown); // the combo is up: tap luck and assistant luck differ
      for (const f of sim.tick(0.1).finds) {
        expect(f.source).toBe('assistant');
        expect(f.luck).toBeCloseTo(shown, 12);
        expect(f.rush).toBeUndefined();
        theirs++;
      }
    }
    expect(theirs).toBeGreaterThan(5);
    const result = sim.takeRushResult()!;
    expect(result.blocks).toBe(myBreaks);
    expect(result.rolls).toBe(mine);
    expect(sim.rushBest).toBe(myBreaks);
  });

  it('what the next set-aside block is stays unannounced until the rush is over', () => {
    const seas = LAYERS.findIndex((l) => l.twist === 'boss');
    const sim = withHelper(seas, (s) => {
      s.levels.assistant = 35;
      s.counts['topsoil-01'] = [1, 0, 0, 1e12]; // the assistant breaks a block with every hit
    });
    sim.startRush();
    const kinds = new Set<string>();
    for (let i = 0; i < 440; i++) for (const e of sim.tick(0.1).events) kinds.add(e.kind);
    expect(sim.blocksBroken(seas)).toBeGreaterThan(BOSS.every); // it met a boss on the way
    for (const k of kinds) expect(['quest', 'rank', 'pity', 'fragment', 'relic']).toContain(k);
  });

  it('an unstable block set aside keeps its window running: a rush does not freeze it', () => {
    const forest = LAYERS.findIndex((l) => l.twist === 'unstable');
    // not yet hit, no assistant: it waits untouched
    const idle = ready(forest, (s) => (s.block = { kind: 'unstable', timer: -1 }), 40);
    idle.startRush();
    idle.tick(RUSH.seconds + 1);
    expect(idle.block).toEqual({ kind: 'unstable', timer: -1 });
    // hit once before the rush: the 6 s run on while you rush, exactly as without it
    const started = ready(forest, (s) => (s.block = { kind: 'unstable', timer: -1 }), 40);
    started.tap();
    expect(started.block.timer).toBe(UNSTABLE.window);
    const damage = started.blockDamage;
    started.startRush();
    started.tick(2);
    started.stopRush();
    expect(started.block.kind).toBe('unstable');
    expect(started.block.timer).toBeCloseTo(UNSTABLE.window - 2, 9);
    expect(started.blockDamage).toBe(damage);
    const late = ready(forest, (s) => (s.block = { kind: 'unstable', timer: -1 }), 40);
    late.tap();
    late.startRush();
    late.tick(UNSTABLE.window + 1);
    late.stopRush();
    expect(late.block.kind).toBe('normal'); // it settled meanwhile, as it would have
  });
});

describe(`away from the app: under ${RUSH.away} s the rush waits, longer ends it`, () => {
  it('the threshold is the one below which time away gets no popup', () => {
    expect(RUSH.away).toBe(OFFLINE_MIN_SECONDS);
    expect(RUSH.away).toBe(60);
  });

  it('a short absence does not end the rush: its clock did not run, and time away dug only the set-aside block', () => {
    const sim = ready(2, (s) => (s.levels.assistant = 20));
    sim.setClock(T0);
    sim.startRush();
    for (let i = 0; i < 12; i++) sim.tap();
    sim.tick(5);
    const before = { left: sim.rushLeft, blocks: sim.rushBlocks, damage: sim.blockDamage, broken: sim.blocksBroken(2), kind: sim.block.kind };
    const haul = sim.claimOffline(RUSH.away - 0.5);
    expect(sim.rushActive).toBe(true);
    expect(sim.takeRushResult()).toBeNull();
    expect(sim.rushLeft).toBe(before.left);
    // the assistant's away hits are credited as always, on the block that was set aside
    expect(haul.hits).toBeGreaterThan(20);
    expect(haul.blocks).toBeGreaterThan(0);
    expect(sim.blocksBroken(2)).toBe(before.broken + haul.blocks);
    // not one of them landed on a rush block
    expect(sim.rushBlocks).toBe(before.blocks);
    expect(sim.blockDamage).toBe(before.damage);
    expect(sim.blockHp).toBe(Math.ceil(sim.rushHp * (before.kind === 'golden' ? GOLDEN.hp : 1)));
    expect(sim.block.kind).toBe(before.kind);
    for (const f of haul.notable) expect(f.rush).toBeUndefined();
    // and the rush plays on to its end
    sim.tick(before.left - 0.5);
    expect(sim.rushActive).toBe(true);
    sim.tick(1);
    expect(sim.rushActive).toBe(false);
    expect(sim.takeRushResult()!.ended).toBe('time');
  });

  it(`${RUSH.away} s or more end it, and the result says why; the haul is an ordinary one`, () => {
    for (const away of [RUSH.away, 600]) {
      const sim = ready(2, (s) => (s.levels.assistant = 20));
      sim.setClock(T0);
      sim.startRush();
      for (let i = 0; i < 12; i++) sim.tap();
      const blocks = sim.rushBlocks;
      const broken = sim.blocksBroken(2);
      const haul = sim.claimOffline(away);
      expect(sim.rushActive).toBe(false);
      const result = sim.takeRushResult()!;
      expect(result.ended).toBe('away');
      expect(result.blocks).toBe(blocks);
      expect(sim.rushBest).toBe(blocks);
      expect(sim.blockHp).toBeGreaterThanOrEqual(sim.hpOf(2)); // back on a block of the layer, at its full health
      expect(sim.blocksBroken(2)).toBe(broken + haul.blocks);
      expect(sim.rushWait).toBe(RUSH.cooldown);
    }
  });

  it('the clock running out and leaving the dig screen are told apart too', () => {
    const a = ready(1);
    a.startRush();
    a.tick(RUSH.seconds);
    expect(a.takeRushResult()!.ended).toBe('time');
    const b = ready(1);
    b.startRush();
    expect(b.stopRush()!.ended).toBe('left');
  });
});

describe('edges the review asked for', () => {
  it('the lucky streak fires inside a rush: guaranteed 1 in 100 or rarer, from the rush stream', () => {
    const sim = ready(1, (s) => {
      s.dry = PITY;
      s.counts['topsoil-01'] = [1, 0, 0, 1e6];
    });
    const main = sim.toSave().rng;
    sim.startRush();
    const r = sim.tap();
    expect(r.find!.pity).toBe(true);
    expect(r.find!.rush).toBe(true);
    expect(r.find!.fossil.tier).toBeGreaterThanOrEqual(LUCKY_TIER);
    expect(r.events.some((e) => e.kind === 'pity')).toBe(true);
    expect(sim.dry).toBe(0);
    expect(sim.toSave().rng).toBe(main);
    // and it counts dry rolls in a rush like anywhere else
    const next = sim.tap().find!;
    expect(sim.dry).toBe(next.fossil.tier >= LUCKY_TIER ? 0 : 1);
  });

  it('a glint that is up when a rush starts stays a glint: its own luck, its own find, gone on time', () => {
    const sim = ready(1, (s) => {
      s.glintIn = 0.05;
      s.levels.luck = 4;
    });
    sim.tick(0.1);
    expect(sim.glint).not.toBeNull();
    const shown = sim.glintLuck;
    sim.startRush();
    expect(sim.glint).not.toBeNull();
    expect(sim.glintLuck).toBe(shown);
    for (let i = 0; i < 20; i++) sim.tap(); // the combo climbs: the glint's luck was fixed when it appeared
    expect(sim.glintLuck).toBe(shown);
    const rolls = sim.rushFinds;
    const f = sim.tapGlint()!;
    expect(f.source).toBe('glint');
    expect(f.luck).toBeCloseTo(shown, 12);
    expect(f.rush).toBeUndefined();
    expect(sim.rushFinds).toBe(rolls); // not a rush find
    expect(sim.glint).toBeNull();
    // left alone instead, it fades after its 3 s; no new one comes during the rush
    const other = ready(1, (s) => (s.glintIn = 0.05));
    other.tick(0.1);
    other.startRush();
    other.tick(GLINT.life - 0.2);
    expect(other.glint).not.toBeNull();
    expect(other.tick(0.3).glintExpired).toBe(true);
    let appeared = 0;
    while (other.rushActive) if (other.tick(0.1).glintAppeared) appeared++;
    expect(appeared).toBe(0);
  });

  it('no new glint appears while a rush runs; the glint timer picks up where it was', () => {
    const sim = ready(1, (s) => (s.glintIn = 5));
    sim.startRush();
    let glints = 0;
    for (let i = 0; i < 300; i++) if (sim.tick(0.1).glintAppeared) glints++;
    expect(sim.rushActive).toBe(true);
    expect(glints).toBe(0);
    sim.tick(RUSH.seconds);
    expect(sim.rushActive).toBe(false);
    let after = 0;
    for (let i = 0; i < 100; i++) if (sim.tick(0.1).glintAppeared) after++;
    expect(after).toBe(1); // 5 s after the rush, as it was 5 s away before it
  });

  it('an expedition started during a rush closes the rush first', () => {
    const rift = LAYERS.length - 1;
    const sim = ready(rift);
    expect(sim.canExpedition).toBe(true);
    sim.startRush();
    for (let i = 0; i < 20; i++) sim.tap();
    const blocks = sim.rushBlocks;
    expect(blocks).toBeGreaterThan(0);
    expect(sim.expedition()).toBe(true);
    expect(sim.rushActive).toBe(false);
    expect(sim.rushBest).toBe(blocks);
    expect(sim.rushCount).toBe(1);
    expect(sim.layer).toBe(0);
    expect(sim.block).toEqual({ kind: 'normal', timer: -1 });
    expect(sim.blockHp).toBe(sim.hpOf(0)); // a normal Topsoil block of the new stratum
    expect(sim.takeRushResult()).toBeNull(); // no card for a rush you left
    expect(new DigSim(1, JSON.parse(JSON.stringify(sim.toSave())) as DigSave).rushBest).toBe(blocks);
  });

  it('a meteor block coming back from a rush clears a weak spot that was showing; the sharp eye is kept', () => {
    const crater = LAYERS.findIndex((l) => l.twist === 'meteor');
    const sim = ready(crater, (s) => {
      s.block = { kind: 'meteor', timer: -1, x: 0.5, y: 0.5 };
      s.weak = { ...s.weak, in: 0.05, streak: 3 };
    });
    expect(sim.sharpEye).toBe(3);
    sim.startRush(); // rush blocks are plain: a weak spot can show
    sim.tick(0.1);
    expect(sim.weakSpot).not.toBeNull();
    sim.stopRush();
    expect(sim.block.kind).toBe('meteor');
    expect(sim.weakSpot).toBeNull(); // not left hidden under the star core...
    for (let i = 0; i < 100; i++) sim.tick(0.1);
    expect(sim.sharpEye).toBe(3); // ...to run out unseen and end the streak
    // the same when the app closed mid-rush with a spot showing
    const saved = ready(crater, (s) => {
      s.block = { kind: 'meteor', timer: -1, x: 0.5, y: 0.5 };
      s.weak = { ...s.weak, in: 0.05, streak: 2 };
    });
    saved.startRush();
    saved.tick(0.1);
    expect(saved.weakSpot).not.toBeNull();
    const loaded = new DigSim(1, JSON.parse(JSON.stringify(saved.toSave())) as DigSave);
    expect(loaded.block.kind).toBe('meteor');
    expect(loaded.weakSpot).toBeNull();
    for (let i = 0; i < 100; i++) loaded.tick(0.1);
    expect(loaded.sharpEye).toBe(2);
  });

  it('a loaded cooldown is never longer than one cooldown from the last time the save was seen', () => {
    const base = defaultSave();
    // a damaged or once-wrong `readyAt` far in the future, and a `seen` beyond the stored last-seen
    const far = new DigSim(1, { ...base, lastSeen: T0, rush: { ...base.rush, readyAt: T0 + 5000 * H, seen: T0 + 4000 * H } });
    expect(far.rushWait).toBe(RUSH.cooldown);
    far.setClock(T0 + 1 * H);
    expect(far.rushWait).toBe(RUSH.cooldown - 3600);
    far.setClock(T0 + 3 * H);
    expect(far.rushWait).toBe(0);
    // an honest one is untouched
    const fine = new DigSim(1, { ...base, lastSeen: T0, rush: { ...base.rush, readyAt: T0 + 2 * H, seen: T0 } });
    expect(fine.rushWait).toBe(2 * 3600);
    // without a stored last-seen (never saved by the session) the save's own `seen` stands
    const bare = new DigSim(1, { ...base, rush: { ...base.rush, readyAt: T0 + 9 * H, seen: T0 } });
    expect(bare.rushWait).toBe(RUSH.cooldown);
  });
});

describe('balance guard: a rush is worth about 4 minutes of the same play at most', () => {
  // (1) The pacing profiles (5 taps/s; 2.5 taps/s in bursts), each from its own save on layers
  //     1, 3 and 6, also tapping every weak spot ("aiming").
  // (2) What the review found weak: a save with no assistant whose player never shops, where a
  //     normal block takes exactly T taps (the worst is a T that the rush share cuts to one tap).
  // (3) A later save back on a layer it has outgrown (blocks break in one tap there anyway).
  // Each: one rush against four minutes of normal play, and against the same 45 s of normal play.
  interface Row extends RushMeasure {
    name: string;
  }
  const rows: Row[] = [];
  for (const profile of ['fast', 'casual'] as const) {
    for (const layer of [0, 2, 5])
      for (const seed of [1, 2]) {
        const save = saveOn(seed, profile, layer);
        if (!save) throw new Error(`${profile} never reached layer ${layer + 1}`);
        rows.push({ name: `${profile} L${layer + 1}`, ...measureRush(save, profile, false, seed) });
        rows.push({ name: `${profile} L${layer + 1} aiming`, ...measureRush(save, profile, true, seed) });
      }
    for (const layer of [1, 3, 6]) for (const taps of [1, 2, 3, 4, 5, 6, 8, 10, 12]) rows.push({ name: `${profile} no assistant L${layer + 1}, ${taps} taps a block`, ...measureRush(flatSave(layer, taps), profile, false, 1, false) });
    const deep = saveOn(1, profile, 5);
    if (!deep) throw new Error('layer 6 not reached');
    for (const back of [0, 2]) {
      const sim = new DigSim(1, structuredClone(deep));
      sim.travel(back);
      rows.push({ name: `${profile} layer-6 save back on L${back + 1}`, ...measureRush(sim.toSave(), profile, false, 1) });
    }
  }
  const pacing = rows.filter((r) => !r.name.includes('no assistant') && !r.name.includes('back on'));
  const flat = rows.filter((r) => r.name.includes('no assistant'));
  const revisit = rows.filter((r) => r.name.includes('back on'));

  it('prints the measured table', () => {
    for (const m of rows)
      console.warn(
        `rush ${m.name}: ${m.rush.blocks} blocks, ${m.rush.rolls} finds = ${m.minutesByBlocks.toFixed(2)} min of normal play by blocks (${m.normal.blocks} in 4 min), ${m.minutesByRolls.toFixed(2)} by finds, ${m.minutesByDust.toFixed(2)} by dust; ×${m.gain.toFixed(2)} the finds of the same 45 s without it`,
      );
    const max = (list: Row[], f: (r: Row) => number): string => Math.max(...list.map(f)).toFixed(2);
    console.warn(`rush guard: pacing players at most ${max(pacing, (r) => r.minutesByBlocks)} min by blocks, ${max(pacing, (r) => r.minutesByRolls)} by finds, ${max(pacing, (r) => r.minutesByDust)} by dust`);
    console.warn(`rush guard: no assistant, never shops: at most ${max(flat, (r) => r.minutesByBlocks)} min by blocks, ${max(flat, (r) => r.minutesByRolls)} by finds, ${max(flat, (r) => r.minutesByDust)} by dust`);
    expect(pacing).toHaveLength(24);
    expect(flat).toHaveLength(54);
    expect(revisit).toHaveLength(4);
  });

  it('the pacing players: never more than 4 minutes by blocks, finds or dust', () => {
    for (const m of pacing) {
      expect(m.minutesByBlocks, m.name).toBeLessThanOrEqual(4);
      expect(m.minutesByRolls, m.name).toBeLessThanOrEqual(4);
      expect(m.minutesByDust, m.name).toBeLessThanOrEqual(4);
    }
  });

  it('the worst case found (no assistant, never shops, any taps per block): never more than 5 minutes', () => {
    // This is the case that catches a rush block made too light: at a fifth of the health these
    // reach 6.4 minutes, at a quarter 5.4.
    for (const m of flat) {
      expect(m.minutesByBlocks, m.name).toBeLessThanOrEqual(5);
      expect(m.minutesByRolls, m.name).toBeLessThanOrEqual(5);
      expect(m.minutesByDust, m.name).toBeLessThanOrEqual(5);
    }
    expect(Math.max(...flat.map((m) => m.minutesByBlocks))).toBeGreaterThan(4); // and it is a real worst case
  });

  it('a rush never pays less than the same 45 s without it', () => {
    // (finds; 5 % for the luck of which blocks turn golden in two different streams)
    for (const m of rows) expect(m.gain, m.name).toBeGreaterThanOrEqual(0.95);
    // for the pacing players and the no-assistant saves it is always clearly worth starting
    for (const m of [...pacing, ...flat]) expect(m.gain, m.name).toBeGreaterThan(1.25);
  });

  it('on a layer you have outgrown it is worth just those 45 s: no more, no less', () => {
    for (const m of revisit) {
      expect(m.gain, m.name).toBeGreaterThanOrEqual(0.95);
      expect(m.gain, m.name).toBeLessThanOrEqual(1.05);
      expect(m.minutesByBlocks, m.name).toBeLessThan(1);
    }
  });

  it('a tap breaks at most one block, so your rush blocks are at most your taps', () => {
    for (const m of flat) expect(m.rush.blocks, m.name).toBeLessThanOrEqual(m.rush.taps); // no assistant: every block is a tap
  });

  it('the cooldown keeps it a side dish: under 3 % of the play it interrupts', () => {
    // one rush (at most 5 minutes of normal play) per cooldown of wall-clock time
    expect(5 / (RUSH.cooldown / 60)).toBeLessThan(0.03);
    expect(RUSH.cooldown).toBeGreaterThanOrEqual(3 * 3600);
  });
});
