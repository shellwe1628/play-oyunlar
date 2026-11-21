import { createSaveStore, memoryStorage } from '@oyun/core/pure';
import { describe, expect, it } from 'vitest';
import { repairSave, saveOptions, SAVE_VERSION } from '../../src/save';
import { canUpgrade, freshArsenal, migrateArsenal, powerOf, selectWeapon, upgradeCost, upgradeWeapon } from '../../src/sim/arsenal';
import { freshSave, metaOf3d, UPGRADE_IDS, UPGRADES, type SaveData } from '../../src/sim/meta';
import { progressScore } from '../../src/sim/progress';
import { bowEquivalent, WEAPON_IDS, WEAPON_MAX } from '../../src/sim/weapons';
import { statsFor } from '../../src/sim/cards';

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
    expect(s.arsenal.welcome).toBe(true); // the menu presents the welcome chest once
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
    expect(s.arsenal.celestial).toBe(false);
  });

  it('a sky boss beaten before the arsenal brings the celestial look with the migration', () => {
    const s = oldSave((d) => {
      d.bosses = [1, 1, 1, 1, 1, 1];
    });
    migrateArsenal(s);
    expect(s.arsenal.celestial).toBe(true);
    // the migration's one welcome chest only (no boss chests for old knockouts)
    expect(s.arsenal.chests).toEqual(['gold']);
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

  it('repair keeps a valid chestsOpened and floors a fractional one', () => {
    const keep = repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), chestsOpened: 7.9 } }).arsenal;
    expect(keep.chestsOpened).toBe(7);
    expect(freshArsenal().chestsOpened).toBe(0);
  });

  it('repair keeps a run chest marker inside the line and the welcome flag while its gold chest waits', () => {
    const keep = repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), chests: ['gold', 'wood'], runChest: 1, welcome: true } }).arsenal;
    expect(keep.runChest).toBe(1);
    expect(keep.welcome).toBe(true);
    const frac = repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), chests: ['wood'], runChest: 0.5 } }).arsenal;
    expect(frac.runChest).toBe(-1);
    expect(freshArsenal().runChest).toBe(-1);
    expect(freshArsenal().welcome).toBe(false);
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
      chestsOpened: -4,
      runChest: 5,
      welcome: true,
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
    expect(r.chestsOpened).toBe(0);
    expect(r.runChest).toBe(-1); // past the end of the line
    expect(r.welcome).toBe(false); // no gold chest left to present
    expect(r.migrated).toBe(true);

    // a selected weapon that is not owned falls back to the bow
    const notOwned = repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), selected: 'spear' } }).arsenal;
    expect(notOwned.selected).toBe('bow');
  });
});

describe('weapon upgrades', () => {
  const rich = (): SaveData => {
    const s = freshSave();
    // enough for every level 1 → 20 (about 0.6 M coins on the Task 14 curve)
    s.coins = 2_000_000;
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

describe('power and rank', () => {
  it('power rises with every upgrade', () => {
    const s = freshSave();
    expect(Number.isInteger(powerOf(s))).toBe(true);
    // every weapon level, on every weapon
    for (const id of WEAPON_IDS) {
      const t = freshSave();
      t.arsenal.weapons[id].owned = true;
      t.arsenal.selected = id;
      let last = powerOf(t);
      for (let l = 2; l <= WEAPON_MAX; l++) {
        t.arsenal.weapons[id].level = l;
        const p = powerOf(t);
        expect(Number.isInteger(p), `${id} L${l}`).toBe(true);
        expect(p, `${id} L${l}`).toBeGreaterThan(last);
        last = p;
      }
    }
    // every shop level, on top of any weapon level
    for (const wl of [1, 10, WEAPON_MAX]) {
      const t = freshSave();
      t.arsenal.weapons.bow.level = wl;
      let last = powerOf(t);
      for (const u of UPGRADE_IDS) {
        for (let l = 1; l <= UPGRADES[u].max; l++) {
          t.upgrades[u] = l;
          const p = powerOf(t);
          expect(p, `L${wl} ${u} ${l}`).toBeGreaterThan(last);
          last = p;
        }
      }
    }
    // only the selected weapon's level counts
    const t = freshSave();
    t.arsenal.weapons.spear = { owned: true, level: 12, shards: 0 };
    expect(powerOf(t)).toBe(powerOf(freshSave()));
    selectWeapon(t, 'spear');
    expect(powerOf(t)).toBeGreaterThan(powerOf(freshSave()));
  });

  it('rank never drops after migration', () => {
    for (let bow = 0; bow <= 25; bow++) {
      for (const bosses of [[0, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0], [5, 5, 5, 5, 5, 5]]) {
        const s = oldSave((d) => {
          d.bow.level = bow;
          d.bosses = bosses;
          d.best = 3 * bow;
          d.feats = bow >= 5 ? ['firstKo', 'forge5'] : ['firstKo'];
        });
        const before = progressScore(s).total;
        migrateArsenal(s);
        const after = progressScore(s);
        expect(s.arsenal.rankFloor, `+${bow}`).toBe(before);
        expect(after.total, `+${bow} ${bosses.join(',')}`).toBeGreaterThanOrEqual(before);
        expect(after.bow, `+${bow}`).toBeGreaterThanOrEqual(bow * 80);
      }
    }
    // the floor holds even if the parts that make the score are lower than it
    const s = freshSave();
    s.arsenal.rankFloor = 5000;
    expect(progressScore(s).total).toBe(5000);
    s.bosses = s.bosses.map(() => 50);
    s.best = 100;
    expect(progressScore(s).total).toBeGreaterThan(5000);
  });
});

describe('the 3D run levels and the glow', () => {
  it('metaOf3d.bow follows the selected weapon level (bowEquivalent), not the retired forge', () => {
    const s = freshSave();
    s.bow.level = 18;
    expect(metaOf3d(s).bow).toBe(bowEquivalent(1));
    s.arsenal.weapons.crossbow = { owned: true, level: 12, shards: 0 };
    selectWeapon(s, 'crossbow');
    expect(metaOf3d(s)).toMatchObject({ weapon: 'crossbow', wlevel: 12, bow: bowEquivalent(12) });
    expect(bowEquivalent(12)).toBeGreaterThan(0);
    s.arsenal.weapons.crossbow.level = WEAPON_MAX;
    expect(metaOf3d(s).bow).toBe(25);
  });

  it('hard damage ignores meta.bow (only the weapon level counts)', () => {
    const m = metaOf3d(freshSave());
    for (const bow of [0, 7, 25]) {
      expect(statsFor([], { ...m, bow }, 'hard').dmgMul).toBe(statsFor([], m, 'hard').dmgMul);
    }
  });
});
