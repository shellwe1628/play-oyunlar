import { describe, expect, it } from 'vitest';
import { freshArsenal, markWeaponsSeen, nextReveal, repairArsenal, takeReveal } from '../../src/sim/arsenal';
import { openQueuedChest } from '../../src/sim/chests';
import { freshSave, newBank } from '../../src/sim/meta';
import { dailyChallenge } from '../../src/sim/progress';
import { bankDailyChest, grantBossReward, grantFirstBossRewards, grantRunChest, SKY_CHAPTER } from '../../src/sim/rewards';
import { WEAPON_IDS, WEAPONS } from '../../src/sim/weapons';

describe('boss rewards', () => {
  it('the first boss of chapter c: a boss chest and the weapon with unlockBoss === c', () => {
    for (let c = 0; c < 5; c++) {
      const s = freshSave();
      const want = WEAPON_IDS.find((id) => WEAPONS[id].unlockBoss === c)!;
      expect(s.arsenal.weapons[want].owned).toBe(false);
      grantBossReward(s, c);
      expect(s.arsenal.chests).toEqual(['boss']);
      expect(s.arsenal.weapons[want].owned).toBe(true);
      expect(s.arsenal.weapons[want].level).toBe(1);
      expect(s.arsenal.celestial).toBe(false);
    }
  });

  it('an owned weapon stays as it is (level and shards kept)', () => {
    const s = freshSave();
    s.arsenal.weapons.sling = { owned: true, level: 6, shards: 3 };
    grantBossReward(s, 4);
    expect(s.arsenal.weapons.sling).toEqual({ owned: true, level: 6, shards: 3 });
    expect(s.arsenal.chests).toEqual(['boss']);
  });

  it('the sky boss (chapter index 5): a boss chest and the celestial look', () => {
    expect(SKY_CHAPTER).toBe(5);
    const s = freshSave();
    grantBossReward(s, SKY_CHAPTER);
    expect(s.arsenal.chests).toEqual(['boss']);
    expect(s.arsenal.celestial).toBe(true);
    expect(WEAPON_IDS.filter((id) => s.arsenal.weapons[id].owned)).toEqual(['bow']);
  });

  it('grantFirstBossRewards pays only chapters whose boss count went from 0 to more', () => {
    const s = freshSave();
    s.bosses[0] = 2; // beaten before
    const before = [...s.bosses];
    s.bosses[0] = 3; // again: nothing
    s.bosses[1] = 1; // first time
    s.bosses[5] = 2; // first time (twice in one bank)
    expect(grantFirstBossRewards(s, before)).toEqual([1, 5]);
    expect(s.arsenal.chests).toEqual(['boss', 'boss']);
    expect(s.arsenal.weapons.spear.owned).toBe(true);
    expect(s.arsenal.weapons.crossbow.owned).toBe(false);
    expect(s.arsenal.celestial).toBe(true);
    // banking again with the new counts as the base grants nothing more
    expect(grantFirstBossRewards(s, [...s.bosses])).toEqual([]);
    expect(s.arsenal.chests).toHaveLength(2);
  });
});

describe('run chest', () => {
  it('a run end queues runChest(reached), once per run', () => {
    const s = freshSave();
    const b = newBank(s);
    expect(grantRunChest(s, b, 5)).toBe('wood');
    expect(s.arsenal.chests).toEqual(['wood']);
    expect(grantRunChest(s, b, 5)).toBeNull();
    expect(s.arsenal.chests).toEqual(['wood']);
    const b2 = newBank(s);
    expect(grantRunChest(s, b2, 8)).toBe('silver');
    expect(grantRunChest(s, newBank(s), 22)).toBe('gold');
    expect(s.arsenal.chests).toEqual(['wood', 'silver', 'gold']);
  });

  it('a revived run that gets further upgrades its chest instead of adding a second', () => {
    const s = freshSave();
    s.arsenal.chests.push('gold'); // an older chest stays
    const b = newBank(s);
    grantRunChest(s, b, 6);
    expect(s.arsenal.chests).toEqual(['gold', 'wood']);
    // revived, died again on wave 7: still wood, nothing new
    expect(grantRunChest(s, b, 7)).toBeNull();
    // revived again, died on wave 9: the wood becomes silver
    expect(grantRunChest(s, b, 9)).toBe('silver');
    expect(s.arsenal.chests).toEqual(['gold', 'silver']);
    expect(grantRunChest(s, b, 30)).toBe('gold');
    expect(s.arsenal.chests).toEqual(['gold', 'gold']);
  });

  it('a run chest already opened is not given again on upgrade', () => {
    const s = freshSave();
    const b = newBank(s);
    grantRunChest(s, b, 3);
    s.arsenal.chests.length = 0; // opened between the death and the revive
    expect(grantRunChest(s, b, 9)).toBeNull();
    expect(s.arsenal.chests).toEqual([]);
  });

  it('the run chest opened before the revive: another queued chest of the same kind is never upgraded', () => {
    const s = freshSave();
    s.arsenal.chests.push('wood'); // an older wooden chest, still waiting
    const b = newBank(s);
    expect(grantRunChest(s, b, 3)).toBe('wood');
    expect(s.arsenal.runChest).toBe(1);
    // the result screen opens the run chest (exactly that one), then the run is revived and gets further
    expect(openQueuedChest(s, s.arsenal.runChest)?.kind).toBe('wood');
    expect(s.arsenal.runChest).toBe(-1);
    expect(grantRunChest(s, b, 9)).toBeNull();
    expect(s.arsenal.chests).toEqual(['wood']);
  });

  it('the run chest marker follows the line when an older chest is opened', () => {
    const s = freshSave();
    s.arsenal.chests.push('wood', 'gold');
    const b = newBank(s);
    grantRunChest(s, b, 4); // wood at index 2
    s.arsenal.chests.push('gold'); // the daily chest after it
    openQueuedChest(s, 0); // the older wooden chest
    expect(s.arsenal.runChest).toBe(1);
    expect(grantRunChest(s, b, 9)).toBe('silver');
    expect(s.arsenal.chests).toEqual(['gold', 'silver', 'gold']);
    // a chest behind it opened: the marker stays
    openQueuedChest(s, 2);
    expect(s.arsenal.runChest).toBe(1);
    expect(grantRunChest(s, b, 25)).toBe('gold');
    expect(s.arsenal.chests).toEqual(['gold', 'gold']);
  });
});

describe('daily chest', () => {
  it('meeting the daily goal queues a gold chest instead of coins, once a day; the streak still grows', () => {
    const s = freshSave();
    const key = '2026-11-17';
    const goal = dailyChallenge(key).goal;
    expect(bankDailyChest(s, key, goal - 1)).toBe(false);
    expect(s.arsenal.chests).toEqual([]);
    expect(s.dailyBest).toBe(goal - 1);
    expect(bankDailyChest(s, key, goal)).toBe(true);
    expect(s.arsenal.chests).toEqual(['gold']);
    expect(s.coins).toBe(0);
    expect(s.dailyStreak).toBe(1);
    expect(s.dailyDone).toBe(key);
    expect(bankDailyChest(s, key, 99)).toBe(false);
    expect(s.arsenal.chests).toEqual(['gold']);
    expect(bankDailyChest(s, '2026-11-18', 99)).toBe(true);
    expect(s.dailyStreak).toBe(2);
    expect(s.arsenal.chests).toEqual(['gold', 'gold']);
  });
});

describe('celestial in the arsenal', () => {
  it('fresh is false; repair keeps true and drops anything that is not true', () => {
    expect(freshArsenal().celestial).toBe(false);
    expect(repairArsenal({ ...freshArsenal(), celestial: true }).celestial).toBe(true);
    expect(repairArsenal({ ...freshArsenal(), celestial: 'yes' }).celestial).toBe(false);
    expect(repairArsenal({ ...freshArsenal(), celestial: 1 }).celestial).toBe(false);
    expect(repairArsenal(undefined).celestial).toBe(false);
  });
});

describe('reveals owed for boss unlocks', () => {
  it('a boss-unlocked weapon is queued for its reveal and marked unseen; an owned one is not', () => {
    const s = freshSave();
    grantBossReward(s, 0);
    expect(s.arsenal.reveals).toEqual(['crossbow']);
    expect(s.arsenal.unseen).toEqual(['crossbow']);
    const t = freshSave();
    t.arsenal.weapons.sling.owned = true;
    grantBossReward(t, 4);
    expect(t.arsenal.reveals).toEqual([]);
    expect(t.arsenal.unseen).toEqual([]);
  });

  it('the sky boss owes the celestial reveal once', () => {
    const s = freshSave();
    grantBossReward(s, SKY_CHAPTER);
    grantBossReward(s, SKY_CHAPTER);
    expect(s.arsenal.reveals).toEqual(['celestial']);
    expect(s.arsenal.unseen).toEqual([]);
  });

  it('takeReveal hands them out oldest first, then null; markWeaponsSeen clears the badge list', () => {
    const s = freshSave();
    grantFirstBossRewards(s, []);
    s.bosses[0] = 1;
    s.bosses[1] = 1;
    grantFirstBossRewards(s, [0, 0, 0, 0, 0, 0]);
    expect(nextReveal(s.arsenal)).toBe('crossbow');
    expect(takeReveal(s)).toBe('crossbow');
    expect(takeReveal(s)).toBe('spear');
    expect(takeReveal(s)).toBeNull();
    expect(nextReveal(s.arsenal)).toBeNull();
    expect(s.arsenal.unseen).toEqual(['crossbow', 'spear']);
    expect(markWeaponsSeen(s)).toBe(true);
    expect(s.arsenal.unseen).toEqual([]);
    expect(markWeaponsSeen(s)).toBe(false);
  });

  it('freshArsenal starts with none; repairArsenal keeps only valid, owned, unique entries', () => {
    expect(freshArsenal().reveals).toEqual([]);
    expect(freshArsenal().unseen).toEqual([]);
    const a = freshArsenal();
    a.weapons.crossbow.owned = true;
    a.celestial = true;
    const r = repairArsenal({ ...a, reveals: ['crossbow', 'crossbow', 'spear', 'celestial', 'nope', 3], unseen: ['crossbow', 'bow', 'firework', 'x', 'crossbow'] });
    expect(r.reveals).toEqual(['crossbow', 'celestial']);
    expect(r.unseen).toEqual(['crossbow']);
    const noCel = repairArsenal({ ...freshArsenal(), reveals: ['celestial'] });
    expect(noCel.reveals).toEqual([]);
    const junk = repairArsenal({ ...freshArsenal(), reveals: 'crossbow', unseen: { a: 1 } });
    expect(junk.reveals).toEqual([]);
    expect(junk.unseen).toEqual([]);
    expect(repairArsenal(undefined).reveals).toEqual([]);
  });
});
