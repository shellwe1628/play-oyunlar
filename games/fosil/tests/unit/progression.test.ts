import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  BOSS,
  CAVEIN,
  CHAIN,
  DAILY,
  EXPEDITION,
  FEVER,
  GOLDEN,
  LAYERS,
  PITY,
  RANKS,
  RELIC,
  SCORE,
  TWIN,
  UNSTABLE,
  VEIN,
  at,
  rankOf,
} from '../../src/sim/data';
import { DigSim, defaultSave, scoreOf, type BlockKind, type DigSave } from '../../src/sim/dig';
import { effectiveLuck, layerFossils, LUCKY_TIER, rareWeight, rollRare } from '../../src/sim/loot';

function saveWith(mut: (s: DigSave) => void): DigSave {
  const s = defaultSave();
  mut(s);
  return s;
}

/** A sim parked on `layer` with the given block in front of it. */
function on(layer: number, kind: BlockKind = 'normal', mut: (s: DigSave) => void = () => {}): DigSim {
  return new DigSim(
    3,
    saveWith((s) => {
      s.unlocked = Math.max(layer, s.unlocked);
      s.layer = layer;
      s.block = { kind, timer: -1 };
      s.stats.rolls = 100;
      // enough plain power to break a block of this layer in about four taps (gold topsoil-01 = 64)
      s.counts['topsoil-01'] = [0, 0, 0, Math.ceil(at(LAYERS, layer).hp / 64 / 4)];
      mut(s);
    }),
  );
}

describe('lucky streak (pity)', () => {
  it(`after ${PITY} rolls without a 1 in 100+ find, the next roll is guaranteed 1 in 100 or rarer`, () => {
    const sim = on(0, 'normal', (s) => (s.dry = PITY));
    let r = sim.tap();
    while (!r.find) r = sim.tap();
    expect(r.find.pity).toBe(true);
    expect(r.find.fossil.tier).toBeGreaterThanOrEqual(LUCKY_TIER);
    expect(sim.dry).toBe(0);
    expect(r.events.some((e) => e.kind === 'pity')).toBe(true);
  });

  it('counts dry rolls and resets on any rare find; it never fires earlier', () => {
    const sim = on(0);
    let maxDry = 0;
    for (let i = 0; i < 4000; i++) {
      const r = sim.tap();
      for (const f of r.find ? [r.find, ...r.extra] : r.extra) {
        if (f.pity) expect(maxDry).toBe(PITY);
        maxDry = f.fossil.tier >= LUCKY_TIER ? 0 : maxDry + 1;
      }
      expect(sim.dry).toBe(maxDry);
    }
  });

  it('chooses among the rare fossils in exactly their printed proportions (not luck-scaled)', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const rares = layerFossils(l).filter((f) => f.tier >= LUCKY_TIER);
      const W = rareWeight(l);
      expect(W).toBe(rares.reduce((s, f) => s + f.weight, 0));
      const N = 200_000;
      const rng = createRng(500 + l);
      const counts = new Map<string, number>();
      for (let i = 0; i < N; i++) {
        const f = rollRare(l, rng);
        counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
      }
      for (const f of rares) {
        const p = f.weight / W;
        const exp = N * p;
        const obs = counts.get(f.id) ?? 0;
        if (exp >= 20) expect(Math.abs(obs - exp), `${f.id}`).toBeLessThan(5 * Math.sqrt(N * p * (1 - p)));
        else expect(obs).toBeLessThanOrEqual(Math.max(8, exp * 6));
      }
      for (const id of counts.keys()) expect(rares.some((f) => f.id === id)).toBe(true);
    }
  }, 60_000);
});

describe('combo fever', () => {
  it(`fills by your combo per tap; at ${FEVER.charge} it starts ${FEVER.seconds} s of ×${FEVER.damage} tap damage`, () => {
    const sim = on(0, 'normal', (s) => (s.combo = 1));
    const base = sim.digPower;
    let started = false;
    for (let i = 0; i < FEVER.charge + 1 && !started; i++) started = sim.tap().events.some((e) => e.kind === 'fever');
    expect(started).toBe(true);
    expect(sim.feverSeconds).toBe(FEVER.seconds);
    let p = sim.digPower;
    expect(sim.tap().damage).toBe(p * FEVER.damage);
    // the combo does not drain during fever
    sim.tick(5);
    expect(sim.combo).toBe(1);
    const end = sim.tick(FEVER.seconds);
    expect(end.events.some((e) => e.kind === 'feverEnd')).toBe(true);
    p = sim.digPower;
    expect(sim.tap().damage).toBe(p);
    expect(base).toBeGreaterThan(0);
  });

  it('a slower combo fills the meter more slowly', () => {
    const half = on(0, 'normal', (s) => (s.combo = 0.5 - 0.05));
    half.tap();
    expect(half.feverFill).toBeCloseTo(0.5 / FEVER.charge, 12);
  });
});

describe('chains', () => {
  it(`tap breaks within ${CHAIN.window} s chain: +${CHAIN.step * 100} % dust per link up to ×${CHAIN.max}`, () => {
    const sim = on(0, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1000])); // breaks every tap
    const d0 = sim.blockDust(0);
    const r1 = sim.tap();
    expect(r1.broke).toBe(true);
    sim.tick(0.2);
    const dust2 = sim.blockDust(0);
    const r2 = sim.tap();
    expect(r2.events).toContainEqual({ kind: 'chain', n: 2 });
    expect(r2.dust).toBe(Math.ceil(dust2 * (1 + CHAIN.step)));
    for (let i = 0; i < 30; i++) {
      sim.tick(0.1);
      sim.tap();
    }
    expect(sim.chainMult).toBe(CHAIN.max);
    sim.tick(CHAIN.window + 0.1);
    const r = sim.tap();
    expect(r.events.some((e) => e.kind === 'chain')).toBe(false);
    expect(d0).toBeGreaterThan(0);
  });
});

describe('special blocks', () => {
  it(`golden: ×${GOLDEN.hp} hp, ${GOLDEN.rolls} rolls, ×${GOLDEN.dust} dust`, () => {
    const sim = on(1, 'golden');
    expect(sim.blockHp).toBe(Math.ceil(sim.hpOf(1) * GOLDEN.hp));
    const dust = sim.blockDust(1);
    let r = sim.tap();
    while (!r.broke) r = sim.tap();
    expect(r.find).not.toBeNull();
    expect(r.extra).toHaveLength(GOLDEN.rolls - 1);
    expect(r.dust).toBe(Math.ceil(dust * GOLDEN.dust));
  });

  it(`golden blocks only appear after the first ${GOLDEN.after} finds, about 1 in ${1 / GOLDEN.chance}`, () => {
    const fresh = new DigSim(9);
    for (let i = 0; i < 2000 && fresh.stats.rolls < GOLDEN.after - 1; i++) {
      fresh.tap();
      expect(fresh.block.kind).toBe('normal');
    }
    const sim = on(0, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, 1000]));
    let gold = 0;
    let N = 0;
    for (let i = 0; i < 40_000; i++) {
      const r = sim.tap();
      if (!r.broke) continue;
      N++;
      if (sim.block.kind === 'golden') gold++;
    }
    expect(gold / N).toBeGreaterThan(GOLDEN.chance * 0.8);
    expect(gold / N).toBeLessThan(GOLDEN.chance * 1.2);
  });

  it(`hard vein (Coal Swamp): taps do ×${VEIN.weak}; holding grows it to ×${VEIN.maxCharge} at ${VEIN.fullHold} s`, () => {
    const p = on(4, 'vein').digPower;
    expect(on(4, 'vein').tap().damage).toBe(p * VEIN.weak);
    expect(on(4, 'vein').charge(VEIN.fullHold).damage).toBe(p * VEIN.maxCharge);
    expect(on(4, 'vein').charge(VEIN.fullHold / 2).damage).toBe(p * (VEIN.weak + (VEIN.maxCharge - VEIN.weak) / 2));
    expect(on(4, 'vein').charge(0).damage).toBe(p * VEIN.weak); // an instant release is a plain tap
    expect(on(4, 'vein').charge(10).damage).toBe(p * VEIN.maxCharge);
    const plain = on(4, 'normal');
    expect(plain.charge(VEIN.fullHold).damage).toBe(plain.digPower);
  });

  it(`unstable (Amber Forest): break it within ${UNSTABLE.window} s of the first hit for a bonus roll`, () => {
    const fast = on(5, 'unstable');
    let r = fast.tap();
    expect(fast.block.timer).toBe(UNSTABLE.window);
    while (!r.broke) r = fast.tap();
    expect(r.extra).toHaveLength(1);
    const slow = on(5, 'unstable');
    slow.tap();
    const t = slow.tick(UNSTABLE.window + 0.01);
    expect(t.events.some((e) => e.kind === 'settled')).toBe(true);
    expect(slow.block.kind).toBe('normal');
  });

  it(`twin (Salt Caves): ×${TWIN.hp} hp, two fossils`, () => {
    const sim = on(6, 'twin');
    expect(sim.blockHp).toBe(Math.ceil(sim.hpOf(6) * TWIN.hp));
    let r = sim.tap();
    while (!r.broke) r = sim.tap();
    expect(r.extra).toHaveLength(TWIN.rolls - 1);
  });

  it(`relic fragments (Crystal Geode): ${RELIC.fragments} make a relic, ×${RELIC.power} dig power each, ${RELIC.max} at most`, () => {
    const sim = on(7, 'normal', (s) => (s.fragments = RELIC.fragments - 1));
    const before = sim.digPower;
    let got = false;
    for (let i = 0; i < 400 && !got; i++) got = sim.tap().events.some((e) => e.kind === 'relic');
    expect(got).toBe(true);
    expect(sim.relics).toBe(1);
    expect(sim.pickMult / on(7).pickMult).toBeCloseTo(RELIC.power, 12);
    expect(sim.digPower).toBeGreaterThan(before);
    const full = on(7, 'normal', (s) => (s.fragments = RELIC.fragments * RELIC.max));
    for (let i = 0; i < 300; i++) expect(full.tap().events.some((e) => e.kind === 'fragment')).toBe(false);
    expect(full.relics).toBe(RELIC.max);
  });

  it(`cave-in (Magma Vents): rubble at ×${CAVEIN.hp} hp, no fossil, ×${CAVEIN.dust} dust`, () => {
    const sim = on(8, 'cavein');
    expect(sim.blockHp).toBe(Math.ceil(sim.hpOf(8) * CAVEIN.hp));
    const dust = sim.blockDust(8);
    const rolls = sim.stats.rolls;
    let r = sim.tap();
    while (!r.broke) r = sim.tap();
    expect(r.find).toBeNull();
    expect(r.extra).toHaveLength(0);
    expect(r.dust).toBe(Math.ceil(dust * CAVEIN.dust));
    expect(sim.stats.rolls).toBe(rolls);
  });

  it(`boss (First Seas): every ${BOSS.every}th block, ×${BOSS.hp} hp, ${BOSS.phases} rolls at boss luck ×${BOSS.luck}`, () => {
    const sim = on(9, 'boss', (s) => (s.combo = 1));
    expect(sim.blockHp).toBe(Math.ceil(sim.hpOf(9) * BOSS.hp));
    const expected = effectiveLuck(9, sim.baseLuck * sim.comboMult * BOSS.luck);
    expect(sim.bossLuck).toBe(expected);
    const finds = [];
    let phases = 0;
    let r = sim.tap();
    for (;;) {
      phases += r.events.filter((e) => e.kind === 'phase').length;
      finds.push(...r.extra, ...(r.find ? [r.find] : []));
      if (r.broke) break;
      r = sim.tap();
    }
    expect(phases).toBe(BOSS.phases - 1);
    expect(finds).toHaveLength(BOSS.phases);
    expect(finds[0]!.luck).toBe(expected);
    // the boss comes back on schedule
    const counter = on(9, 'normal', (s) => (s.broken[9] = BOSS.every - 2));
    let b = counter.tap();
    while (!b.broke) b = counter.tap();
    expect(counter.block.kind).toBe('boss');
  });

  it('twists only appear on their own layer', () => {
    for (let l = 0; l < LAYERS.length; l++) {
      const sim = on(l, 'normal', (s) => (s.counts['topsoil-01'] = [0, 0, 0, Math.ceil(at(LAYERS, l).hp)]));
      const kinds = new Set<string>();
      for (let i = 0; i < 600; i++) {
        sim.tap();
        kinds.add(sim.block.kind);
      }
      kinds.delete('normal');
      kinds.delete('golden');
      const twist = at(LAYERS, l).twist;
      const expect1 = { none: [], vein: ['vein'], unstable: ['unstable'], twin: ['twin'], relic: [], cavein: ['cavein'], boss: ['boss'] }[twist];
      expect([...kinds].sort(), `layer ${l}`).toEqual(expect1);
    }
  });
});

describe('expedition', () => {
  const deep = (): DigSim =>
    new DigSim(
      4,
      saveWith((s) => {
        s.unlocked = 9;
        s.layer = 9;
        s.dust = 1e12;
        s.levels.pick = 50;
        for (const f of layerFossils(0)) s.counts[f.id] = [1, 0, 0, 0];
        s.counts['deepsea-12'] = [1, 0, 0, 0];
        s.fragments = 5;
        s.stats.playSeconds = 3 * 3600;
      }),
    );

  it(`opens only once ${LAYERS[EXPEDITION.needLayer]!.id} is reached`, () => {
    expect(on(8).canExpedition).toBe(false);
    expect(on(8).expedition()).toBe(false);
    expect(deep().canExpedition).toBe(true);
  });

  it('restarts the run and keeps the museum, sets, relics and records; bonus +60 %, strata ×1.6', () => {
    const sim = deep();
    const museum = sim.discoveredCount;
    const score = sim.score.total;
    expect(sim.expedition()).toBe(true);
    expect(sim.layer).toBe(0);
    expect(sim.unlocked).toBe(0);
    // only the expedition achievement's reward is left in the purse
    expect(sim.dust).toBe(sim.lastEvents.reduce((a, e) => a + (e.kind === 'quest' ? e.dust : 0), 0));
    expect(sim.level('pick')).toBe(0);
    expect(sim.count('topsoil-01')).toBe(0);
    expect(sim.discovered('deepsea-12')).toBe(true);
    expect(sim.discoveredCount).toBe(museum);
    expect(sim.setComplete(0)).toBe(true);
    expect(sim.relics).toBe(1);
    expect(sim.expeditions).toBe(1);
    expect(sim.expeditionMult).toBe(1 + EXPEDITION.power);
    expect(sim.strataMult).toBe(1 + EXPEDITION.hard);
    expect(sim.hpOf(0)).toBe(Math.ceil(4 * sim.strataMult));
    expect(sim.unlockPowerOf(1)).toBe(300 * sim.strataMult);
    expect(sim.bestExpedition).toBe(3 * 3600);
    expect(sim.score.total).toBe(score - sim.score.depth + sim.score.depth + SCORE.expedition);
  });
});

describe('progress score and ranks', () => {
  it('score = species by tier + 15 per best grade + 150 per set + 100 per depth + 200 per relic + 1500 per expedition', () => {
    const s = defaultSave();
    s.discovered = ['topsoil-01', 'topsoil-12', 'deepsea-12'];
    s.best = { 'topsoil-01': 3, 'topsoil-12': 1, 'deepsea-12': 0 };
    s.sets = [0];
    s.deepest = 4;
    s.fragments = 11;
    s.expedition.count = 2;
    const tiers = s.discovered.map((id) => layerFossils(id.startsWith('deepsea') ? 3 : 0).find((f) => f.id === id)!.tier);
    const b = scoreOf(s);
    expect(b.species).toBe(tiers.reduce((a, t) => a + at(SCORE.species, t), 0));
    expect(b.grades).toBe(4 * SCORE.grade);
    expect(b.sets).toBe(SCORE.set);
    expect(b.depth).toBe(4 * SCORE.depth);
    expect(b.relics).toBe(2 * SCORE.relic);
    expect(b.expeditions).toBe(2 * SCORE.expedition);
    expect(b.total).toBe(b.species + b.grades + b.sets + b.depth + b.relics + b.expeditions);
  });

  it(`maps the score to ${RANKS.length} ranks with rising thresholds`, () => {
    expect(RANKS.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < RANKS.length; i++) expect(at(RANKS, i).score).toBeGreaterThan(at(RANKS, i - 1).score);
    expect(rankOf(0)).toBe(0);
    for (let i = 0; i < RANKS.length; i++) {
      expect(rankOf(at(RANKS, i).score)).toBe(i);
      if (i > 0) expect(rankOf(at(RANKS, i).score - 1)).toBe(i - 1);
    }
    expect(rankOf(1e12)).toBe(RANKS.length - 1);
  });

  it('announces each rank-up once, and the score is deterministic per seed', () => {
    const a = new DigSim(21);
    const b = new DigSim(21);
    const ranks: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const r = a.tap();
      b.tap();
      for (const e of r.events) if (e.kind === 'rank') ranks.push(e.rank);
    }
    expect(ranks.length).toBeGreaterThan(0);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    expect(a.score).toEqual(b.score);
    expect(a.rank).toBe(at(ranks, ranks.length - 1));
  });
});

describe('records', () => {
  it('keeps the five rarest species with the date of their first find', () => {
    const sim = on(0);
    sim.setClock(1_800_000_000_000);
    for (let i = 0; i < 6000; i++) sim.tap();
    const r = sim.records.rare;
    expect(r.length).toBe(5);
    for (let i = 1; i < r.length; i++) expect(at(r, i - 1).odds).toBeGreaterThanOrEqual(at(r, i).odds);
    expect(new Set(r.map((x) => x.id)).size).toBe(5);
    for (const x of r) expect(x.at).toBe(1_800_000_000_000);
  });

  it('times set completions from the moment the layer opened', () => {
    const sim = on(0, 'normal', (s) => {
      s.counts = {};
      for (const f of layerFossils(0).slice(1)) s.counts[f.id] = [1, 0, 0, 0];
      s.stats.playSeconds = 500;
      s.records.layerStart = [100];
    });
    sim.collect(layerFossils(0)[0]!.id);
    expect(sim.records.sets['0']).toBe(400);
  });
});

describe('daily dig', () => {
  it(`once a day; consecutive days grow the streak to ${DAILY.maxStreak}; a missed day restarts it`, () => {
    const sim = on(0);
    const d1 = sim.claimDaily(20_000)!;
    expect(d1.streak).toBe(1);
    expect(d1.dust).toBe(DAILY.dustBlocks * sim.blockDust(0));
    expect(sim.boostSeconds).toBe(DAILY.boostSeconds);
    expect(sim.claimDaily(20_000)).toBeNull();
    expect(sim.claimDaily(19_999)).toBeNull();
    for (let d = 1; d < 10; d++) sim.claimDaily(20_000 + d);
    expect(sim.dailyStreak).toBe(DAILY.maxStreak);
    expect(sim.claimDaily(20_011)!.streak).toBe(1);
  });
});

describe('achievements', () => {
  it('are granted once each, with their dust reward', () => {
    const sim = on(0, 'normal', (s) => (s.stats.rolls = 0));
    const got: string[] = [];
    for (let i = 0; i < 3000; i++) for (const e of sim.tap().events) if (e.kind === 'quest') got.push(e.id);
    expect(got).toContain('finds-10');
    expect(got).toContain('finds-100');
    expect(new Set(got).size).toBe(got.length);
    expect(sim.quests).toEqual(expect.arrayContaining(got));
    for (const id of sim.quests) expect(ACHIEVEMENTS.some((a) => a.id === id)).toBe(true);
  });
});
