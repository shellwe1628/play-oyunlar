import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { mergeUpgrades, saveOptions } from '../../src/save';
import { applyRunResult, buyUpgrade, NO_META } from '../../src/sim/meta';

describe('game save', () => {
  it('persists best wave, coins and upgrades through the versioned store', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => {
      applyRunResult(d, 6, 80);
      buyUpgrade(d, 'hp');
    });
    const b = createSaveStore(saveOptions(storage, 'test'));
    expect(b.data.best).toBe(6);
    expect(b.data.coins).toBe(55);
    expect(b.data.upgrades.hp).toBe(1);
  });
  it('a v1 save missing an upgrade id keeps its coins and best wave (migration merges defaults)', () => {
    const v1 = { best: 7, coins: 120, runs: 4, upgrades: { hp: 2, dmg: 1 }, cosmetic: 'beanie', dailyDate: '', dailyBest: 0 };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: v1 }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('migrated');
    expect(s.data.coins).toBe(120);
    expect(s.data.best).toBe(7);
    expect(s.data.upgrades).toEqual({ ...NO_META, hp: 2, dmg: 1 });
  });
  it('a current-version save missing a newly added upgrade id is not reset', () => {
    const data = { best: 9, coins: 40, runs: 2, upgrades: { hp: 1, dmg: 0, coins: 0, reroll: 0 }, cosmetic: 'classic', dailyDate: '', dailyBest: 0 };
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('loaded');
    expect(s.data.coins).toBe(40);
    expect(mergeUpgrades(s.data).upgrades.starter).toBe(0);
  });
  it('fills fields missing from an older-shaped save with defaults', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { best: 3, coins: 9, runs: 1, upgrades: { hp: 0, dmg: 0, coins: 0, reroll: 0, starter: 0 } } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.best).toBe(3);
    expect(s.data.cosmetic).toBe('classic');
  });
  it('rejects a save whose coins are not a number', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 2, data: { best: 1, coins: 'x', upgrades: {} } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.coins).toBe(0);
  });
});
