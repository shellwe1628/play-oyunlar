import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { saveOptions } from '../../src/save';
import { applyRunResult, buyUpgrade } from '../../src/sim/meta';

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
  it('fills fields missing from an older-shaped save with defaults', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { best: 3, coins: 9, runs: 1, upgrades: { hp: 0, dmg: 0, coins: 0, reroll: 0, starter: 0 } } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.data.best).toBe(3);
    expect(s.data.cosmetic).toBe('classic');
  });
  it('rejects a save whose coins are not a number', () => {
    const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 1, data: { best: 1, coins: 'x' } }) });
    const s = createSaveStore(saveOptions(storage, 'test'));
    expect(s.status).toBe('reset');
    expect(s.data.coins).toBe(0);
  });
});
