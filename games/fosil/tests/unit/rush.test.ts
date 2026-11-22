/**
 * Dig Rush: 45 seconds of light blocks on the current layer. Honesty first: a rush find is a tap
 * find from the same table at the luck on screen. Then the rules, the balance guard, the
 * wall-clock cooldown and the save.
 */
import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions, SAVE_VERSION } from '../../src/save';
import { cooldown } from '../../src/sim/clock';
import { at, BOSS, CHAIN, FOSSIL_BY_ID, GOLDEN, LAYERS, RELIC, RUSH, WEAK } from '../../src/sim/data';
import { DigSim, defaultSave, type BlockKind, type DigSave, type Find, type RushResult } from '../../src/sim/dig';
import { layerFossils, rollProbabilities } from '../../src/sim/loot';
import { measureRush, saveOn, type RushMeasure } from './rushPlayer';

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
  it('a rush block has a fifth of the health of a normal block of the layer', () => {
    for (const layer of [0, 1, 3, 6, 9, 12]) {
      const sim = ready(layer, (s) => (s.stats.rolls = 0)); // no golden in this one
      const normal = sim.blockHp;
      expect(normal).toBe(sim.hpOf(layer));
      sim.startRush();
      expect(sim.blockHp).toBe(Math.max(1, Math.ceil(normal * RUSH.hp)));
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

  it('the assistant stands back and no new glint appears while it runs', () => {
    const sim = ready(1, (s) => {
      s.levels.assistant = 30;
      s.glintIn = 5;
    });
    sim.startRush();
    let hits = 0;
    let glints = 0;
    for (let i = 0; i < 300; i++) {
      const r = sim.tick(0.1);
      hits += r.assistantHits;
      if (r.glintAppeared) glints++;
    }
    expect(sim.rushActive).toBe(true);
    expect(hits).toBe(0);
    expect(glints).toBe(0);
    expect(sim.blockDamage).toBe(0);
    // afterwards both are back
    sim.tick(RUSH.seconds);
    expect(sim.rushActive).toBe(false);
    let after = 0;
    let glintAfter = 0;
    for (let i = 0; i < 100; i++) {
      const r = sim.tick(0.1);
      after += r.assistantHits;
      if (r.glintAppeared) glintAfter++;
    }
    expect(after).toBeGreaterThan(20);
    expect(glintAfter).toBe(1);
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

  it('leaving the dig screen or the app ends it; what it broke still counts', () => {
    const sim = ready(1);
    sim.startRush();
    for (let i = 0; i < 40; i++) sim.tap();
    const blocks = sim.rushBlocks;
    expect(blocks).toBeGreaterThan(0);
    const r = sim.stopRush()!;
    expect(r.blocks).toBe(blocks);
    expect(sim.rushActive).toBe(false);
    expect(sim.rushBest).toBe(blocks);
    expect(sim.stopRush()).toBeNull();
    // time away: the rush is over before the assistant digs, and the haul is an ordinary one
    const away = ready(1, (s) => (s.levels.assistant = 10));
    away.setClock(T0);
    away.startRush();
    for (let i = 0; i < 10; i++) away.tap();
    const broken = away.blocksBroken(1);
    const haul = away.claimOffline(600);
    expect(away.rushActive).toBe(false);
    expect(away.takeRushResult()!.blocks).toBeGreaterThan(0);
    expect(haul.blocks).toBeGreaterThan(0);
    expect(away.blocksBroken(1)).toBe(broken + haul.blocks);
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

describe('balance guard: one rush is worth at most about 4 minutes of the same play', () => {
  // The pacing profiles (5 taps/s; 2.5 taps/s in bursts), each from its own save on layers 1, 3
  // and 6: one rush against four minutes of normal play on that layer. `aim` = also tapping
  // every weak spot, which the pacing profiles never do.
  const rows: RushMeasure[] = [];
  const aimed: RushMeasure[] = [];
  for (const profile of ['fast', 'casual'] as const)
    for (const layer of [0, 2, 5])
      for (const seed of [1, 2]) {
        const save = saveOn(seed, profile, layer);
        if (!save) throw new Error(`${profile} never reached layer ${layer + 1}`);
        rows.push(measureRush(save, profile, false, seed));
        aimed.push(measureRush(save, profile, true, seed));
      }

  it('prints the measured table', () => {
    for (const [name, list] of [['plain', rows], ['aiming', aimed]] as const)
      for (const m of list)
        console.warn(
          `rush ${name} ${m.profile} L${m.layer + 1}: ${m.rush.blocks} blocks, ${m.rush.rolls} finds in one rush = ${m.minutesByBlocks.toFixed(2)} min of normal play by blocks (${m.normal.blocks} in 4 min), ${m.minutesByRolls.toFixed(2)} by finds, ${m.minutesByDust.toFixed(2)} by dust`,
        );
    expect(rows).toHaveLength(12);
  });

  it('in blocks broken: never more than 4 minutes, and always worth starting (more than 45 s)', () => {
    for (const m of [...rows, ...aimed]) {
      expect(m.minutesByBlocks, `${m.profile} L${m.layer + 1}`).toBeLessThanOrEqual(4);
      expect(m.minutesByBlocks, `${m.profile} L${m.layer + 1}`).toBeGreaterThan(RUSH.seconds / 60);
    }
  });

  it('in finds and in dust: never more than 4 minutes either (dust does not flood the upgrade curve)', () => {
    for (const m of [...rows, ...aimed]) {
      expect(m.minutesByRolls, `${m.profile} L${m.layer + 1}`).toBeLessThanOrEqual(4);
      expect(m.minutesByDust, `${m.profile} L${m.layer + 1}`).toBeLessThanOrEqual(4);
    }
  });

  it('a tap breaks at most one block, so a rush is at most as many blocks as taps', () => {
    for (const m of [...rows, ...aimed]) expect(m.rush.blocks).toBeLessThanOrEqual(m.rush.taps);
  });

  it('the cooldown keeps it a side dish: under 3 % of the play it interrupts', () => {
    // one rush (at most 4 minutes of normal play) per cooldown of wall-clock time
    expect(4 / (RUSH.cooldown / 60)).toBeLessThan(0.03);
    expect(RUSH.cooldown).toBeGreaterThanOrEqual(3 * 3600);
  });
});
