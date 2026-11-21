import { createRng } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { CHEST_KINDS } from '../../src/sim/arsenal';
import { CHEST_ODDS, chestRng, claimFreeChest, FREE_CHEST_MS, freeChestReady, freeChestWait, openChest, openQueuedChest, runChest, SLING_UNLOCK_SHARDS } from '../../src/sim/chests';
import { freshSave } from '../../src/sim/meta';

describe('chests', () => {
  it('odds bounds hold', () => {
    for (const kind of CHEST_KINDS) {
      const s = freshSave();
      s.chapter = 2;
      const odds = CHEST_ODDS[kind];
      const rng = createRng(7);
      for (let i = 0; i < 10_000; i++) {
        s.arsenal.weapons.sling = { owned: false, level: 1, shards: 0 };
        const loot = openChest(s, kind, rng);
        expect(loot.coins).toBeGreaterThanOrEqual(odds.coins[0]);
        expect(loot.coins).toBeLessThanOrEqual(odds.coins[1]);
        const n = loot.shards.reduce((t, x) => t + x.n, 0);
        expect(n).toBeGreaterThanOrEqual(odds.shards[0]);
        expect(n).toBeLessThanOrEqual(odds.shards[1]);
      }
    }
  });

  it('odds are sane data', () => {
    for (const kind of CHEST_KINDS) {
      const o = CHEST_ODDS[kind];
      expect(o.coins[0]).toBeLessThanOrEqual(o.coins[1]);
      expect(o.shards[0]).toBeGreaterThanOrEqual(1);
      expect(o.newWeaponChance).toBeGreaterThanOrEqual(0);
      expect(o.newWeaponChance).toBeLessThanOrEqual(1);
    }
  });

  it('adds loot to the save and is deterministic per save state', () => {
    const a = freshSave();
    const b = freshSave();
    const la = openChest(a, 'gold', chestRng(a, 'gold'));
    const lb = openChest(b, 'gold', chestRng(b, 'gold'));
    expect(la).toEqual(lb);
    expect(a.coins).toBe(la.coins);
    expect(a.arsenal.weapons.bow.shards).toBe(la.shards.reduce((t, x) => t + x.n, 0));
  });

  it('openQueuedChest removes the chest from the queue', () => {
    const s = freshSave();
    s.arsenal.chests.push('wood', 'gold');
    const r = openQueuedChest(s, 1);
    expect(r?.kind).toBe('gold');
    expect(s.arsenal.chests).toEqual(['wood']);
    expect(openQueuedChest(s, 5)).toBeNull();
    expect(s.arsenal.chests).toEqual(['wood']);
  });

  it('sling gets shards only from chapter 1 and unlocks at 10', () => {
    const s = freshSave();
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) openChest(s, 'boss', rng);
    expect(s.arsenal.weapons.sling.owned).toBe(false);
    expect(s.arsenal.weapons.sling.shards).toBe(0);
    s.chapter = 1;
    let unlocked = false;
    for (let i = 0; i < 300 && !unlocked; i++) unlocked = openChest(s, 'boss', rng).unlocked === 'sling';
    expect(unlocked).toBe(true);
    expect(s.arsenal.weapons.sling.owned).toBe(true);
    expect(s.arsenal.weapons.sling.level).toBe(1);
  });

  it('sling unlocks from shards', () => {
    const s = freshSave();
    s.chapter = 1;
    s.arsenal.weapons.sling.shards = SLING_UNLOCK_SHARDS - 1;
    const always = createRng(1);
    always.chance = () => true; // every roll takes the new-weapon branch
    const loot = openChest(s, 'wood', always);
    expect(loot.unlocked).toBe('sling');
    expect(s.arsenal.weapons.sling.owned).toBe(true);
    expect(s.arsenal.weapons.sling.shards).toBeGreaterThanOrEqual(0);
    // owned now: no second unlock
    expect(openChest(s, 'wood', always).unlocked).toBeNull();
  });

  it('runChest by wave reached', () => {
    expect(runChest(0)).toBe('wood');
    expect(runChest(7)).toBe('wood');
    expect(runChest(8)).toBe('silver');
    expect(runChest(21)).toBe('silver');
    expect(runChest(22)).toBe('gold');
    expect(runChest(99)).toBe('gold');
  });

  it('ad upgrade is optional', () => {
    const a = freshSave();
    expect(claimFreeChest(a, 1000, false)).toBe('wood');
    const b = freshSave();
    expect(claimFreeChest(b, 1000, true)).toBe('silver');
    expect(b.arsenal.freeChestAt).toBe(1000 + FREE_CHEST_MS);
    expect(claimFreeChest(b, 1001, false)).toBeNull();
  });

  it('free chest clock skew', () => {
    const s = freshSave();
    expect(freeChestReady(s.arsenal, 5)).toBe(true);
    const t0 = 10 * FREE_CHEST_MS;
    s.arsenal.freeChestAt = t0 + FREE_CHEST_MS;
    // clock moved back far: reset, never a wait longer than FREE_CHEST_MS
    const back = t0 - 1;
    expect(freeChestWait(s.arsenal, back)).toBe(FREE_CHEST_MS);
    expect(claimFreeChest(s, back, false)).toBeNull();
    expect(s.arsenal.freeChestAt).toBe(back + FREE_CHEST_MS);
    expect(freeChestReady(s.arsenal, back)).toBe(false);
    expect(freeChestReady(s.arsenal, back + FREE_CHEST_MS)).toBe(true);
    // a week ahead: one chest, not 42
    const week = back + 7 * 24 * 3600_000;
    expect(claimFreeChest(s, week, false)).toBe('wood');
    expect(s.arsenal.freeChestAt).toBe(week + FREE_CHEST_MS);
    expect(claimFreeChest(s, week + 1, false)).toBeNull();
    expect(freeChestWait(s.arsenal, week + FREE_CHEST_MS * 5)).toBe(0);
  });
});
