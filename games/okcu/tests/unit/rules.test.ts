import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CARD_IDS, CARDS, drawOffer, statsFor, type CardId } from '../../src/sim/cards';
import { resolveHit } from '../../src/sim/combat';
import { applyRunResult, buyUpgrade, COSMETICS, freshSave, NO_META, unlockedCosmetics, UPGRADE_IDS, upgradeCost } from '../../src/sim/meta';
import { enemyAccuracy, enemyHp, enemyTiming, waveEnemies } from '../../src/sim/waves';

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
  it('there are twelve cards', () => {
    expect(CARD_IDS.length).toBe(12);
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
  it('effects: start health, damage, coin gain, rerolls, starting card', () => {
    const lv = { hp: 2, dmg: 3, coins: 1, reroll: 1, starter: 1 };
    const s = statsFor([], lv);
    expect(s.maxHp).toBe(130);
    expect(s.dmgMul).toBeCloseTo(1.3);
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
    expect(COSMETICS.length).toBe(6);
    expect(unlockedCosmetics(0).length).toBe(1);
    expect(unlockedCosmetics(5).length).toBe(2);
    expect(unlockedCosmetics(25).length).toBe(6);
  });
});

describe('waves', () => {
  it('each new enemy type is introduced alone', () => {
    const rng = createRng(1);
    expect(waveEnemies(1, rng)).toEqual(['archer']);
    expect(waveEnemies(3, rng)).toEqual(['shield']);
    expect(waveEnemies(4, rng)).toEqual(['jumper']);
    expect(waveEnemies(5, rng)).toEqual(['boss']);
    expect(waveEnemies(6, rng)).toEqual(['bomber']);
  });
  it('every fifth wave has a boss; counts are bounded', () => {
    const rng = createRng(2);
    for (let w = 1; w <= 60; w++) {
      const e = waveEnemies(w, rng);
      expect(e.includes('boss')).toBe(w % 5 === 0);
      expect(e.length).toBeLessThanOrEqual(4);
      expect(e.length).toBeGreaterThanOrEqual(1);
    }
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
    expect(enemyTiming(60).draw).toBeGreaterThanOrEqual(0.5);
  });
  it('enemy health grows with the wave; the wave 1 archer falls to one body hit', () => {
    expect(enemyHp('archer', 1)).toBeLessThanOrEqual(resolveHit('archer', 'body', 1).damage);
    expect(enemyHp('archer', 10)).toBeGreaterThan(enemyHp('archer', 2));
    expect(enemyHp('boss', 5)).toBeGreaterThanOrEqual(300);
  });
});
