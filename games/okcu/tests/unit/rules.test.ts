import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, CARDS, drawOffer, statsFor, synergyFor, type CardId } from '../../src/sim/cards';
import { HELMET_HEAD_MUL, resolveHit } from '../../src/sim/combat';
import { applyRunResult, bankDaily, bankProgress, bankStart, buyUpgrade, COSMETICS, dailyKey, freshSave, newBank, NO_META, runOutcome, unlockedCosmetics, UPGRADE_IDS, upgradeCost } from '../../src/sim/meta';
import { CHAPTER_DEFS, levelOf, stageDef, stageOf } from '../../src/sim/chapters';
import { bossHp, enemyAccuracy, enemyDamageMul, enemyHp, enemyTiming, graceStep, helmetChance, waveGrace } from '../../src/sim/waves';

describe('damage and effect table', () => {
  it('head knocks out any regular archer outright, with slow motion', () => {
    for (const type of ['archer', 'shield', 'jumper', 'bomber'] as const) {
      const h = resolveHit(type, 'head', 1);
      expect(h.ko).toBe(true);
      expect(h.slowmo).toBe(true);
    }
  });
  it('body is solid damage, arm spoils aim, leg staggers and shoves', () => {
    const body = resolveHit('archer', 'body', 1);
    const arm = resolveHit('archer', 'arm', 1);
    const leg = resolveHit('archer', 'leg', 1);
    expect(body.damage).toBe(40);
    expect(body.ko).toBe(false);
    expect(arm.damage).toBe(24);
    expect(arm.aimPenalty).toBeGreaterThan(0);
    expect(leg.damage).toBe(24);
    expect(leg.shove).toBeGreaterThan(0);
    expect(leg.stagger).toBeGreaterThan(0);
    expect(body.aimPenalty).toBe(0);
  });
  it('damage multiplier scales damage', () => {
    expect(resolveHit('archer', 'body', 1.5).damage).toBe(60);
  });
  it('the boss is armoured everywhere except its weak spot; its head is not a knockout', () => {
    const head = resolveHit('boss', 'head', 1);
    expect(head.ko).toBe(false);
    expect(head.damage).toBeLessThan(40);
    expect(resolveHit('boss', 'body', 1).damage).toBeLessThan(25);
    const weak = resolveHit('boss', 'weak', 1);
    expect(weak.damage).toBeGreaterThan(100);
    expect(weak.slowmo).toBe(true);
  });
  it('the same parts hurt the player, which is never knocked out by one hit', () => {
    const head = resolveHit('player', 'head', 1);
    expect(head.ko).toBe(false);
    expect(head.damage).toBeGreaterThan(resolveHit('player', 'body', 1).damage);
    expect(resolveHit('player', 'arm', 1).wobble).toBeGreaterThan(0);
    expect(resolveHit('player', 'leg', 1).stagger).toBeGreaterThan(0);
  });
});

describe('cards', () => {
  const base = statsFor([], NO_META);
  const one = (id: CardId, n = 1) => statsFor(Array<CardId>(n).fill(id), NO_META);
  it('there are eighteen cards (six change how you play)', () => {
    expect(CARD_IDS.length).toBe(18);
  });
  it('every card changes something and stacks', () => {
    for (const id of CARD_IDS) {
      const a = JSON.stringify(one(id, 1));
      expect(a, id).not.toBe(JSON.stringify(base));
      if (CARDS[id].max > 1) expect(JSON.stringify(one(id, 2)), id).not.toBe(a);
    }
  });
  it('each card does what it says', () => {
    expect(one('heavy').dmgMul).toBeCloseTo(1.3);
    expect(one('heavy', 2).dmgMul).toBeCloseTo(1.69);
    expect(one('heavy').impulseMul).toBeGreaterThan(1);
    expect(one('double').volleys).toBe(2);
    expect(one('double', 2).volleys).toBe(3);
    expect(one('split').splitPairs).toBe(1);
    expect(one('fire').fireDps).toBeGreaterThan(0);
    expect(one('fire', 2).fireDps).toBeGreaterThan(one('fire').fireDps);
    expect(one('bounce').bounces).toBe(1);
    expect(one('pierce', 2).pierce).toBe(2);
    expect(one('quick').reload).toBeCloseTo(base.reload * 0.72);
    expect(one('vitality').maxHp).toBe(base.maxHp + 25);
    expect(one('magnet').appleRadiusMul).toBeGreaterThan(1);
    expect(one('magnet').appleHealMul).toBeGreaterThan(1);
    expect(one('shield', 2).shieldCharges).toBe(2);
    expect(one('longsight').previewMul).toBeGreaterThan(1);
    expect(one('vampire', 3).lifesteal).toBe(3 * one('vampire').lifesteal);
    expect(one('seeker').seek).toBeGreaterThan(0);
    expect(one('overdraw').overdraw).toBeGreaterThan(1);
    expect(one('chain').chainShare).toBeGreaterThan(0);
    expect(one('keen').crit).toBeCloseTo(base.crit + 0.08);
    expect(one('zen').focusGain).toBeGreaterThan(base.focusGain);
    expect(one('zen').focusTime).toBeGreaterThan(base.focusTime);
    expect(one('boom').boomDmg).toBeGreaterThan(0);
  });
  it('synergies switch on with both cards and show on the card that completes them', () => {
    expect(statsFor(['fire', 'boom'], NO_META).inferno).toBe(true);
    expect(statsFor(['fire'], NO_META).inferno).toBe(false);
    expect(statsFor(['pierce', 'chain'], NO_META).chainJumps).toBe(2);
    expect(statsFor(['chain'], NO_META).chainJumps).toBe(1);
    expect(statsFor(['split', 'seeker'], NO_META).swarm).toBe(true);
    expect(statsFor(['heavy', 'overdraw'], NO_META).siege).toBe(true);
    expect(statsFor(['keen', 'longsight'], NO_META).critMul).toBeGreaterThan(statsFor(['keen'], NO_META).critMul);
    expect(synergyFor(['fire'], 'boom')).toBe('inferno');
    expect(synergyFor(['boom'], 'fire')).toBe('inferno');
    expect(synergyFor(['fire', 'boom'], 'boom')).toBeNull();
    expect(synergyFor([], 'fire')).toBeNull();
  });
  it('cards combine (heavy + double + split)', () => {
    const s = statsFor(['heavy', 'double', 'split', 'heavy'], NO_META);
    expect(s.dmgMul).toBeCloseTo(1.69);
    expect(s.volleys * (1 + 2 * s.splitPairs)).toBe(6);
  });
  it('an offer is three distinct cards and never a maxed one', () => {
    const rng = createRng(4);
    const held: CardId[] = Array<CardId>(CARDS.magnet.max).fill('magnet');
    for (let i = 0; i < 300; i++) {
      const o = drawOffer(rng, held, 3);
      expect(new Set(o).size).toBe(3);
      expect(o).not.toContain('magnet');
    }
  });
});

describe('permanent upgrades', () => {
  it('costs rise on a curve and stop at the cap', () => {
    for (const id of UPGRADE_IDS) {
      const c0 = upgradeCost(id, 0);
      expect(c0).not.toBeNull();
      const c1 = upgradeCost(id, 1);
      if (c1 !== null) expect(c1).toBeGreaterThan(c0 as number);
    }
    expect(upgradeCost('reroll', 1)).toBeNull();
    expect(upgradeCost('hp', 0)).toBe(25);
  });
  it('the cheapest upgrade is within reach of one or two short runs', () => {
    const cheapest = Math.min(...UPGRADE_IDS.map((id) => upgradeCost(id, 0) as number));
    expect(cheapest).toBeLessThanOrEqual(30);
  });
  it('buying spends coins, raises the level and refuses when poor or maxed', () => {
    const s = freshSave();
    s.coins = 100;
    expect(buyUpgrade(s, 'hp')).toBe(true);
    expect(s.coins).toBe(75);
    expect(s.upgrades.hp).toBe(1);
    s.coins = 5;
    expect(buyUpgrade(s, 'hp')).toBe(false);
    s.coins = 1000;
    expect(buyUpgrade(s, 'reroll')).toBe(true);
    expect(buyUpgrade(s, 'reroll')).toBe(false);
  });
  it('effects: start health, the bow\'s damage, coin gain, rerolls, starting card', () => {
    const lv = { hp: 2, coins: 1, reroll: 1, starter: 1, bow: 3 };
    const s = statsFor([], lv);
    expect(s.maxHp).toBe(130);
    expect(s.dmgMul).toBeCloseTo(1.24);
    expect(UPGRADE_IDS).not.toContain('dmg');
    expect(s.coinMul).toBeCloseTo(1.2);
    expect(s.rerolls).toBe(2);
    expect(statsFor([], NO_META).rerolls).toBe(1);
    expect(s.starterCard).toBe(true);
  });
  it('a run result banks coins and records the best wave', () => {
    const s = freshSave();
    expect(applyRunResult(s, 4, 37)).toEqual({ best: 4, newBest: true });
    expect(applyRunResult(s, 3, 10)).toEqual({ best: 4, newBest: false });
    expect(s.coins).toBe(47);
    expect(s.runs).toBe(2);
  });
  it('a first run that ends on wave 1 records the best but shows no new-best badge', () => {
    const s = freshSave();
    expect(applyRunResult(s, 1, 0)).toEqual({ best: 1, newBest: false });
  });
  it('cosmetics unlock by best wave milestones', () => {
    expect(COSMETICS.length).toBe(12);
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(12);
    expect(unlockedCosmetics(0).length).toBe(1);
    expect(unlockedCosmetics(5).length).toBe(2);
    expect(unlockedCosmetics(25).length).toBe(6);
    expect(unlockedCosmetics(0, 3).map((c) => c.id)).toEqual(['classic', 'flower']);
    expect(unlockedCosmetics(30, 25).length).toBe(12);
  });
});

describe('chapters and stages', () => {
  it('four chapters of seven stages: an elite at stage 4, a boss with its own mechanic at 7, then endless', () => {
    expect(CHAPTER_DEFS.map((c) => c.id)).toEqual(['meadow', 'snow', 'desert', 'night']);
    expect(CHAPTER_DEFS.map((c) => c.boss)).toEqual(['shields', 'giant', 'summoner', 'warden']);
    expect(CHAPTER_DEFS.map((c) => c.bonus)).toEqual(['gallery', 'apples', 'defend', 'gallery']);
    for (const c of CHAPTER_DEFS) {
      expect(c.stages.length).toBe(7);
      expect(c.stages[3]!.enemies[0]).toBe('elite');
      expect(c.stages[6]!.enemies).toEqual(['boss']);
      for (const st of c.stages) expect(st.enemies.length).toBeLessThanOrEqual(st.ledges.length);
    }
    expect(stageOf(1)).toEqual({ chapter: 0, stage: 1, endless: false, theme: 0 });
    expect(stageOf(14)).toEqual({ chapter: 1, stage: 7, endless: false, theme: 1 });
    expect(stageOf(29)).toEqual({ chapter: 4, stage: 1, endless: true, theme: 0 });
    expect(stageOf(36).theme).toBe(1);
  });
  it('the opening teaches one thing at a time', () => {
    const rng = createRng(1);
    expect(stageDef(1, rng).enemies).toEqual(['archer']);
    expect(stageDef(2, rng).enemies).toEqual(['archer', 'archer']);
    expect(stageDef(3, rng).enemies).toEqual(['shield', 'archer']);
  });
  it('each world brings new behaviour: wind and sliding ledges in the snow, swinging ledges and cover in the desert', () => {
    const snow = CHAPTER_DEFS[1]!.stages;
    expect(snow.every((s) => (s.wind ?? 0) > 0)).toBe(true);
    expect(snow.some((s) => s.ledges.some((l) => l.slide))).toBe(true);
    const desert = CHAPTER_DEFS[2]!.stages;
    expect(desert.some((s) => s.ledges.some((l) => l.swing))).toBe(true);
    expect(desert.some((s) => s.enemies.includes('cover'))).toBe(true);
    expect(desert.some((s) => s.enemies.includes('catcher'))).toBe(true);
    expect(CHAPTER_DEFS[3]!.stages.some((s) => s.enemies.includes('ward'))).toBe(true);
    expect(CHAPTER_DEFS[0]!.stages.some((s) => s.enemies.includes('healer'))).toBe(true);
    expect(CHAPTER_DEFS.some((c) => c.stages.some((s) => s.props?.some((p) => p.kind === 'barrel')))).toBe(true);
    expect(CHAPTER_DEFS.some((c) => c.stages.some((s) => s.props?.some((p) => p.kind === 'rock')))).toBe(true);
  });
  it('endless stages stay bounded and keep a boss every seventh wave', () => {
    const rng = createRng(2);
    for (let w = 29; w <= 120; w++) {
      const d = stageDef(w, rng);
      expect(d.enemies.length).toBeGreaterThanOrEqual(1);
      expect(d.enemies.length).toBeLessThanOrEqual(4);
      expect(d.enemies.includes('boss')).toBe(stageOf(w).stage === 7);
    }
  });
  it('difficulty level: a gentle first chapter, then steeper chapters and endless', () => {
    expect([1, 7, 8, 14, 15, 21, 22, 28, 29, 30].map(levelOf)).toEqual([1, 2.2, 3.5, 9.5, 10.5, 16.5, 17, 23, 23.5, 25]);
    for (let w = 2; w < 80; w++) expect(levelOf(w)).toBeGreaterThan(levelOf(w - 1));
  });
  it('enemy accuracy tightens and draws quicken as waves go on, with floors', () => {
    let prev = enemyAccuracy(1);
    let prevT = enemyTiming(1);
    for (let w = 2; w <= 40; w++) {
      const a = enemyAccuracy(w);
      const t = enemyTiming(w);
      expect(a.angle).toBeLessThanOrEqual(prev.angle);
      expect(t.draw).toBeLessThanOrEqual(prevT.draw);
      prev = a;
      prevT = t;
    }
    expect(enemyAccuracy(1).angle).toBeGreaterThan(2.5 * enemyAccuracy(15).angle);
    expect(enemyAccuracy(60).angle).toBeGreaterThan(0.01);
    expect(enemyTiming(60).draw).toBeGreaterThanOrEqual(0.75);
  });
  it('enemy health grows with the level; the first archer falls to one body hit', () => {
    expect(enemyHp('archer', 1)).toBeLessThanOrEqual(resolveHit('archer', 'body', 1).damage);
    expect(enemyHp('archer', 10)).toBeGreaterThan(enemyHp('archer', 2));
    expect(bossHp('shields', 0)).toBeLessThan(bossHp('warden', 0));
    expect(bossHp('giant', 1)).toBeGreaterThan(bossHp('giant', 0));
  });
});

describe('exact values (so a changed number fails a test)', () => {
  it('player damage table and enemy head damage', () => {
    expect(resolveHit('player', 'head', 1).damage).toBe(45);
    expect(resolveHit('player', 'body', 1).damage).toBe(28);
    expect(resolveHit('player', 'arm', 1).damage).toBe(18);
    expect(resolveHit('player', 'leg', 1).damage).toBe(18);
    expect(resolveHit('player', 'arm', 1).wobble).toBe(3);
    expect(resolveHit('player', 'leg', 1).stagger).toBe(0.5);
    expect(resolveHit('archer', 'head', 1).damage).toBe(50);
    expect(resolveHit('archer', 'leg', 1).stagger).toBe(0.45);
    expect(resolveHit('archer', 'leg', 1).shove).toBe(1);
    expect(resolveHit('archer', 'arm', 1).aimPenalty).toBe(0.05);
  });
  it('helmet: a head hit is 1.6 × a body hit (64) and never a knockout', () => {
    const h = resolveHit('archer', 'head', 1, true);
    expect(HELMET_HEAD_MUL).toBe(1.6);
    expect(h.damage).toBe(64);
    expect(h.ko).toBe(false);
    expect(h.slowmo).toBe(true);
    expect(resolveHit('archer', 'body', 1, true).damage).toBe(40);
  });
  it('boss armour', () => {
    expect(resolveHit('boss', 'weak', 1).damage).toBe(130);
    expect(resolveHit('boss', 'body', 1).damage).toBe(6);
    expect(resolveHit('boss', 'leg', 1).shove).toBe(0);
  });
  it('card values and caps', () => {
    const one = (id: CardId, n = 1) => statsFor(Array<CardId>(n).fill(id), NO_META);
    expect(Object.fromEntries(CARD_IDS.map((id) => [id, CARDS[id].max]))).toEqual({
      heavy: 5, double: 2, split: 2, fire: 4, bounce: 3, pierce: 3, quick: 4, vitality: 6, magnet: 2, shield: 2, longsight: 2, vampire: 3,
    });
    expect(one('heavy').impulseMul).toBeCloseTo(1.35);
    expect(one('fire').fireDps).toBe(14);
    expect(one('fire', 2).fireDps).toBe(20);
    expect(one('fire').fireTime).toBe(3);
    expect(one('vampire').lifesteal).toBe(3);
    expect(one('magnet').appleRadiusMul).toBeCloseTo(2.1);
    expect(one('magnet').appleHealMul).toBeCloseTo(1.6);
    expect(one('longsight').previewMul).toBeCloseTo(1.6);
    expect(one('quick', 2).reload).toBeCloseTo(0.5 * 0.72 * 0.72);
    expect(statsFor([], NO_META).maxHp).toBe(100);
  });
  it('upgrade costs grow on the curve and stop at the max level', () => {
    expect([0, 1, 2, 3].map((l) => upgradeCost('hp', l))).toEqual([25, 39, 60, 93]);
    expect([0, 1, 2].map((l) => upgradeCost('coins', l))).toEqual([35, 56, 90]);
    expect(upgradeCost('reroll', 0)).toBe(60);
    expect(upgradeCost('starter', 0)).toBe(90);
    const max = { hp: 8, coins: 6, reroll: 1, starter: 1 } as const;
    for (const id of UPGRADE_IDS) {
      expect(upgradeCost(id, max[id] - 1), id).not.toBeNull();
      expect(upgradeCost(id, max[id]), id).toBeNull();
    }
  });
  it('cosmetic thresholds and the daily key', () => {
    expect(COSMETICS.map((c) => (c.runs > 0 ? `r${c.runs}` : `w${c.wave}`))).toEqual(['w0', 'w5', 'w10', 'w15', 'w20', 'w25', 'r3', 'r6', 'r10', 'r15', 'r25', 'w30']);
    expect(dailyKey(2026, 3, 7)).toBe('2026-03-07');
    expect(dailyKey(2026, 11, 17)).toBe('2026-11-17');
  });
  it('enemy curves at a few levels', () => {
    expect(enemyAccuracy(1).angle).toBeCloseTo(0.34, 6);
    expect(enemyAccuracy(3).angle).toBeCloseTo(0.05 + 0.29 * 0.72 ** 2, 6);
    expect(enemyAccuracy(1).speed).toBeCloseTo(0.075, 6);
    expect(enemyAccuracy(3).speed).toBeCloseTo(0.02 + 0.055 * 0.64, 6);
    expect(enemyAccuracy(60).angle).toBeGreaterThanOrEqual(0.05);
    expect(enemyTiming(1).draw).toBeCloseTo(1.6, 6);
    expect(enemyTiming(5).draw).toBeCloseTo(1.28, 6);
    expect(enemyTiming(20).draw).toBe(0.75);
    expect(enemyTiming(20).cool).toBe(1);
    expect(enemyHp('archer', 1)).toBe(40);
    expect(enemyHp('archer', 2)).toBe(64);
    expect(enemyHp('archer', 11)).toBe(Math.round(40 * 7 * 1.12 ** 3));
    expect(bossHp('shields', 0)).toBe(170);
    expect(bossHp('warden', 0)).toBe(520);
    expect(bossHp('giant', 2)).toBe(714);
    expect(enemyDamageMul(1)).toBeCloseTo(0.45, 6);
    expect(enemyDamageMul(5)).toBeCloseTo(0.89 * 1.065 ** 4, 6);
    expect(enemyDamageMul(9)).toBeCloseTo(1.065 ** 8, 6);
    expect(waveGrace(1)).toBeCloseTo(1.6, 6);
    expect(waveGrace(20)).toBe(1);
    expect(graceStep(2)).toBeCloseTo(1.4, 6);
    expect(graceStep(20)).toBe(0.5);
    expect(helmetChance(13)).toBe(0);
    expect(helmetChance(14)).toBeCloseTo(0.2, 6);
    expect(helmetChance(18)).toBe(1);
  });
});

describe('banking a run (nothing lost on quit, nothing counted twice)', () => {
  it('banks coin deltas and the best wave as the run goes', () => {
    const s = freshSave();
    s.best = 3;
    const bank = newBank(s);
    bankStart(s, bank);
    bankStart(s, bank);
    expect(s.runs).toBe(1);
    bankProgress(s, bank, 2, 10); // cleared wave 1
    bankProgress(s, bank, 3, 25); // cleared wave 2
    bankProgress(s, bank, 3, 25); // quit/hide again: no change
    expect(s.coins).toBe(25);
    expect(s.best).toBe(3);
    bankProgress(s, bank, 4, 31); // died on wave 4
    expect(s.coins).toBe(31);
    expect(s.best).toBe(4);
    expect(runOutcome(s, bank, 4)).toEqual({ best: 4, newBest: true });
  });
  it('the daily best resets on a new day', () => {
    const s = freshSave();
    bankDaily(s, '2026-11-17', 4);
    bankDaily(s, '2026-11-17', 3);
    expect(s.dailyBest).toBe(4);
    bankDaily(s, '2026-11-18', 2);
    expect([s.dailyDate, s.dailyBest]).toEqual(['2026-11-18', 2]);
  });
});
