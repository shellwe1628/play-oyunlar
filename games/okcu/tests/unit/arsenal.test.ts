import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { repairSave, saveOptions, SAVE_VERSION } from '../../src/save';
import { canUpgrade, freshArsenal, migrateArsenal, selectWeapon, upgradeCost, upgradeWeapon } from '../../src/sim/arsenal';
import { freshSave, metaOf3d, type SaveData } from '../../src/sim/meta';
import { progressScore } from '../../src/sim/progress';
import { WEAPON_IDS, WEAPON_MAX } from '../../src/sim/weapons';

const owned = (s: SaveData): string[] => WEAPON_IDS.filter((id) => s.arsenal.weapons[id].owned);

/** an old (pre-arsenal) save, as repairSave sees it after the v3 → v4 step */
function oldSave(edit: (s: SaveData) => void): SaveData {
  const s = freshSave();
  edit(s);
  const raw = JSON.parse(JSON.stringify(s)) as Partial<SaveData>;
  delete raw.arsenal;
  const storage = memoryStorage({ 'oyun:test:save': JSON.stringify({ v: 3, data: raw }) });
  const store = createSaveStore(saveOptions(storage, 'test'));
  return repairSave(store.data);
}

describe('arsenal', () => {
  it('fresh save has only the bow', () => {
    const s = freshSave();
    expect(owned(s)).toEqual(['bow']);
    expect(s.arsenal.selected).toBe('bow');
    expect(s.arsenal.weapons.bow).toEqual({ owned: true, level: 1, shards: 0 });
    expect(s.arsenal.freeChestAt).toBe(0);
    expect(s.arsenal.chests).toEqual([]);
    expect(s.arsenal.rankFloor).toBe(0);
    // a new player is created already migrated: no welcome chest meant for upgrading players
    expect(s.arsenal.migrated).toBe(true);
    migrateArsenal(s);
    expect(s.arsenal.chests).toEqual([]);
    expect(metaOf3d(s)).toMatchObject({ weapon: 'bow', wlevel: 1 });
  });

  it('a brand-new player opening the store gets no welcome chest', () => {
    const store = createSaveStore(saveOptions(memoryStorage(), 'test'));
    expect(store.status).toBe('fresh');
    const d = repairSave(store.data);
    migrateArsenal(d);
    expect(d.arsenal.chests).toEqual([]);
    expect(owned(d)).toEqual(['bow']);
  });

  it('migrates a maxed save without loss', () => {
    const s = oldSave((d) => {
      d.bow.level = 25;
      d.bosses = d.bosses.map(() => 1);
      d.coins = 50000;
      d.feats = ['forge25'];
    });
    expect(SAVE_VERSION).toBe(4);
    expect(s.arsenal.migrated).toBe(false);
    const before = progressScore(s).total;
    migrateArsenal(s);
    expect(s.arsenal.weapons.bow.level).toBe(20);
    expect(owned(s)).toEqual([...WEAPON_IDS]);
    for (const id of WEAPON_IDS) if (id !== 'bow') expect(s.arsenal.weapons[id].level, id).toBe(1);
    expect(s.coins).toBe(50000);
    expect(s.feats).toEqual(['forge25']);
    expect(s.bow.level).toBe(25); // the 2D game's bow stays as it was
    expect(s.arsenal.chests).toEqual(['gold']);
    expect(s.arsenal.selected).toBe('bow');
    expect(s.arsenal.rankFloor).toBe(before);
    expect(s.arsenal.migrated).toBe(true);
    expect(metaOf3d(s)).toMatchObject({ weapon: 'bow', wlevel: 20, bow: 25 });
  });

  it('unlocks only the weapons whose chapter boss was beaten (unlockBoss is a chapter index)', () => {
    const s = oldSave((d) => {
      d.bow.level = 6;
      d.bosses = [3, 0, 1, 0, 2, 0];
    });
    migrateArsenal(s);
    // chapter index 0 → crossbow, index 2 → boomerang, index 4 → sling
    expect(owned(s)).toEqual(['bow', 'crossbow', 'boomerang', 'sling']);
    expect(s.arsenal.weapons.bow.level).toBeGreaterThan(1);
  });

  it('migration runs once', () => {
    const s = oldSave((d) => {
      d.bow.level = 10;
    });
    migrateArsenal(s);
    const level = s.arsenal.weapons.bow.level;
    s.arsenal.weapons.bow.level = 3; // whatever happens later is not overwritten by a second call
    migrateArsenal(s);
    expect(s.arsenal.chests).toEqual(['gold']);
    expect(s.arsenal.weapons.bow.level).toBe(3);
    expect(level).toBeGreaterThan(1);
  });

  it('the migrated arsenal survives a reload', () => {
    const storage = memoryStorage();
    const a = createSaveStore(saveOptions(storage, 'test'));
    a.update((d) => {
      d.arsenal.weapons.spear = { owned: true, level: 7, shards: 4 };
      d.arsenal.selected = 'spear';
      d.arsenal.chests.push('silver');
    });
    const b = repairSave(createSaveStore(saveOptions(storage, 'test')).data);
    expect(b.arsenal.weapons.spear).toEqual({ owned: true, level: 7, shards: 4 });
    expect(b.arsenal.selected).toBe('spear');
    expect(b.arsenal.chests).toEqual(['silver']);
    expect(metaOf3d(b)).toMatchObject({ weapon: 'spear', wlevel: 7 });
  });

  it('repairSave fills a missing or corrupt arsenal', () => {
    const missing = repairSave({ best: 2, coins: 5, upgrades: { hp: 0, coins: 0, reroll: 0, starter: 0 } });
    expect({ ...missing.arsenal, migrated: true }).toEqual(freshArsenal());
    // no arsenal at all = a save from before it: still to be migrated
    expect(missing.arsenal.migrated).toBe(false);

    const garbage = repairSave({ ...freshSave(), arsenal: 'nope' as unknown as SaveData['arsenal'] });
    expect({ ...garbage.arsenal, migrated: true }).toEqual(freshArsenal());

    const bad = {
      selected: 'laser',
      weapons: {
        bow: { owned: false, level: 99, shards: -3 },
        crossbow: { owned: true, level: 0.5, shards: 2.7 },
        spear: { owned: 'yes', level: 'high' },
        firework: null,
        laser: { owned: true, level: 5, shards: 1 },
      },
      chests: ['wood', 'diamond', 3, 'boss'],
      freeChestAt: -10,
      adCoinsDay: 7,
      adCoinsUsed: 'x',
      shopDay: '2026-11-21',
      shopBought: [1, 'two', 3.5, -1, 2],
      rankFloor: NaN,
      migrated: true,
    };
    const r = repairSave({ ...freshSave(), arsenal: bad as unknown as SaveData['arsenal'] }).arsenal;
    expect(Object.keys(r.weapons).sort()).toEqual([...WEAPON_IDS].sort());
    expect(r.weapons.bow).toEqual({ owned: true, level: WEAPON_MAX, shards: 0 }); // the bow is always owned
    expect(r.weapons.crossbow).toEqual({ owned: true, level: 1, shards: 2 });
    expect(r.weapons.spear).toEqual({ owned: false, level: 1, shards: 0 });
    expect(r.weapons.firework).toEqual({ owned: false, level: 1, shards: 0 });
    expect(r.selected).toBe('bow');
    expect(r.chests).toEqual(['wood', 'boss']);
    expect(r.freeChestAt).toBe(0);
    expect(r.adCoinsDay).toBe('');
    expect(r.adCoinsUsed).toBe(0);
    expect(r.shopDay).toBe('2026-11-21');
    expect(r.shopBought).toEqual([1, 2]);
    expect(r.rankFloor).toBe(0);
    expect(r.migrated).toBe(true);

    // a selected weapon that is not owned falls back to the bow
    const notOwned = repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), selected: 'spear' } }).arsenal;
    expect(notOwned.selected).toBe('bow');
  });
});

describe('weapon upgrades', () => {
  const rich = (): SaveData => {
    const s = freshSave();
    s.coins = 100000;
    s.arsenal.weapons.bow.shards = 1000;
    return s;
  };

  it('upgrade spends and always succeeds', () => {
    expect(upgradeCost(1)).toEqual({ shards: 2, coins: 50 });
    const s = freshSave();
    s.coins = 120;
    s.arsenal.weapons.bow.shards = 5;
    expect(canUpgrade(s, 'bow')).toBe(true);
    expect(upgradeWeapon(s, 'bow')).toBe(true);
    expect(s.arsenal.weapons.bow).toEqual({ owned: true, level: 2, shards: 3 });
    expect(s.coins).toBe(70);
    // every level up to the cap succeeds with enough resources, costs grow, null at the cap
    const r = rich();
    let prev = upgradeCost(1)!;
    for (let l = 1; l < WEAPON_MAX; l++) {
      const c = upgradeCost(l)!;
      if (l > 1) {
        expect(c.shards).toBeGreaterThan(prev.shards);
        expect(c.coins).toBeGreaterThan(prev.coins);
      }
      prev = c;
      expect(upgradeWeapon(r, 'bow')).toBe(true);
      expect(r.arsenal.weapons.bow.level).toBe(l + 1);
    }
    expect(upgradeCost(WEAPON_MAX)).toBeNull();
  });

  it('cannot upgrade without shards or coins or past 20', () => {
    const noShards = freshSave();
    noShards.coins = 1000;
    const noCoins = freshSave();
    noCoins.arsenal.weapons.bow.shards = 50;
    const locked = rich();
    locked.arsenal.weapons.spear.shards = 50;
    const maxed = rich();
    maxed.arsenal.weapons.bow.level = WEAPON_MAX;
    for (const s of [noShards, noCoins, locked, maxed]) {
      const id = s === locked ? 'spear' : 'bow';
      const before = JSON.stringify(s);
      expect(canUpgrade(s, id)).toBe(false);
      expect(upgradeWeapon(s, id)).toBe(false);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it('cannot select a locked weapon', () => {
    const s = freshSave();
    expect(selectWeapon(s, 'spear')).toBe(false);
    expect(s.arsenal.selected).toBe('bow');
    s.arsenal.weapons.spear.owned = true;
    expect(selectWeapon(s, 'spear')).toBe(true);
    expect(s.arsenal.selected).toBe('spear');
  });
});
