import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { repairSave, saveOptions, SAVE_VERSION } from '../../src/save';
import { bowDamage } from '../../src/sim/bow';
import { applyRunResult, buyUpgrade, freshRecords } from '../../src/sim/meta';

describe('game save', () => {
  it('persists best wave, coins, upgrades, the bow and records through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => {
      applyRunResult(d, 6, 80);
      buyUpgrade(d, 'hp');
      d.bow.level = 4;
      d.bow.heat = 0.2;
      d.records.headChain = { n: 5, date: '2026-11-17' };
      d.feats.push('firstKo');
    });
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(SAVE_VERSION).toBe(4);
    expect(b.data.best).toBe(6);
    expect(b.data.coins).toBe(55);
    expect(b.data.upgrades.hp).toBe(1);
    expect(b.data.bow).toEqual({ level: 4, heat: 0.2, tries: 0 });
    expect(b.data.records.headChain).toEqual({ n: 5, date: '2026-11-17' });
    expect(b.data.feats).toEqual(['firstKo']);
  });

  it('v2 → v3: bought damage levels become an equivalent bow level; coins, best, cosmetics stay', () => {
    const v2 = { best: 11, coins: 340, runs: 9, upgrades: { hp: 2, dmg: 4, coins: 1, reroll: 1, starter: 0 }, cosmetic: 'beanie', dailyDate: '2026-11-16', dailyBest: 5 };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: v2 }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('migrated');
    expect([s.data.best, s.data.coins, s.data.runs, s.data.cosmetic, s.data.dailyBest]).toEqual([11, 340, 9, 'beanie', 5]);
    expect(s.data.upgrades).toEqual({ hp: 2, coins: 1, reroll: 1, starter: 0 });
    // four +10 % levels (+40 %) become bow +5 (+40 %): no damage lost
    expect(s.data.bow.level).toBe(5);
    expect(bowDamage(s.data.bow.level)).toBeGreaterThanOrEqual(1.4);
    expect(s.data.bow.heat).toBe(0);
    // the new progress fields start fresh
    expect(s.data.records).toEqual(freshRecords());
    expect(s.data.feats).toEqual([]);
    expect(s.data.bosses).toEqual([0, 0, 0, 0, 0, 0]);
    expect(s.data.chapter).toBe(0);
  });

  it('v2 → v3 for every old damage level: the bow never deals less', () => {
    for (let dmg = 0; dmg <= 8; dmg++) {
      const v2 = { best: 3, coins: 0, runs: 1, upgrades: { hp: 0, dmg, coins: 0, reroll: 0, starter: 0 }, cosmetic: 'classic', dailyDate: '', dailyBest: 0 };
      const s = createSaveStore(saveOptions(memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: v2 }) }), 'test'));
      expect(bowDamage(s.data.bow.level), `dmg ${dmg}`).toBeGreaterThanOrEqual(1 + 0.1 * dmg - 1e-9);
    }
  });

  it('a v1 save (missing upgrade ids) goes through both steps and keeps its damage as bow levels', () => {
    const v1 = { best: 7, coins: 120, runs: 4, upgrades: { hp: 2, dmg: 1 }, cosmetic: 'beanie', dailyDate: '', dailyBest: 0 };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: v1 }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('migrated');
    expect(s.data.coins).toBe(120);
    expect(s.data.best).toBe(7);
    expect(s.data.upgrades).toEqual({ hp: 2, coins: 0, reroll: 0, starter: 0 });
    expect(s.data.bow.level).toBe(2);
  });

  it('a current-version save missing newer fields is repaired, not reset', () => {
    const data = { best: 9, coins: 40, runs: 2, upgrades: { hp: 1 }, cosmetic: 'classic', dailyDate: '', dailyBest: 0, bow: { level: 3 } };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: SAVE_VERSION, data }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('loaded');
    expect(s.data.coins).toBe(40);
    const r = repairSave(s.data);
    expect(r.upgrades.starter).toBe(0);
    expect(r.bow).toEqual({ level: 3, heat: 0, tries: 0 });
    expect(r.records.chapter.length).toBe(6);
  });

  it('rejects a save whose coins are not a number', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: { best: 1, coins: 'x', upgrades: {} } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.coins).toBe(0);
  });
});
