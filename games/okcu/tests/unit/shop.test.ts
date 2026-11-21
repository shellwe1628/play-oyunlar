import { describe, expect, it } from 'vitest';
import { repairSave } from '../../src/save';
import { freshArsenal } from '../../src/sim/arsenal';
import { openQueuedChest } from '../../src/sim/chests';
import { WEAPON_MAX } from '../../src/sim/weapons';
import { adCoins, AD_COINS, AD_COINS_PER_DAY, buyChest, buyCosmetic, buyOffer, CHEST_PRICE, COSMETIC_PRICE, dailyOffers, grantAdCoins } from '../../src/sim/shop';
import { cosmeticById, COSMETICS, freshSave, isUnlocked, unlockedCosmetics, type SaveData } from '../../src/sim/meta';

const DAY = '2026-11-20';
const rich = (): SaveData => {
  const s = freshSave();
  s.coins = 100000;
  return s;
};
const snap = (s: SaveData): string => JSON.stringify(s);

describe('daily offers', () => {
  it('offers stable within a day', () => {
    const s = rich();
    s.arsenal.weapons.spear.owned = true;
    s.arsenal.weapons.crossbow.owned = true;
    const a = dailyOffers(DAY, s);
    expect(a).toHaveLength(3);
    expect(dailyOffers(DAY, s)).toEqual(a);
    expect(buyOffer(s, DAY, 0)).toBe(true);
    expect(dailyOffers(DAY, s)).toEqual(a);
  });

  it('only offers usable weapons: owned, plus the sling from chapter 2', () => {
    const fresh = freshSave();
    expect(new Set(dailyOffers(DAY, fresh).map((o) => o.weapon))).toEqual(new Set(['bow']));
    for (let d = 10; d <= 30; d++) {
      const s = freshSave();
      s.chapter = 1;
      s.arsenal.weapons.spear.owned = true;
      for (const o of dailyOffers(`2026-12-${d}`, s)) expect(['bow', 'spear', 'sling']).toContain(o.weapon);
    }
  });

  it('different days differ', () => {
    const keys = new Set<string>();
    for (let d = 10; d <= 20; d++) {
      const s = freshSave();
      s.chapter = 1;
      for (const id of ['crossbow', 'spear', 'boomerang', 'firework'] as const) s.arsenal.weapons[id].owned = true;
      keys.add(JSON.stringify(dailyOffers(`2026-12-${d}`, s)));
    }
    expect(keys.size).toBeGreaterThan(1);
  });

  it('the day snapshot survives a mid-day unlock, chest and chapter change', () => {
    const s = rich();
    s.arsenal.weapons.spear.owned = true;
    const a = dailyOffers(DAY, s);
    expect(s.arsenal.shopOffers).toEqual(a);
    s.arsenal.weapons.crossbow.owned = true;
    expect(dailyOffers(DAY, s)).toEqual(a);
    s.arsenal.chests.push('gold');
    openQueuedChest(s);
    expect(dailyOffers(DAY, s)).toEqual(a);
    s.chapter = 1;
    expect(dailyOffers(DAY, s)).toEqual(a);
    s.arsenal.weapons.firework.owned = true;
    const coins = s.coins;
    expect(buyOffer(s, DAY, 2)).toBe(true);
    expect(s.coins).toBe(coins - a[2]!.coins);
    expect(dailyOffers(DAY, s)).toEqual(a);
  });

  it('an earlier day key (clock skew) never resets the caps or offers', () => {
    const s = rich();
    const b = dailyOffers('2026-11-21', s);
    expect(buyOffer(s, '2026-11-21', 0)).toBe(true);
    for (let i = 0; i < 3; i++) grantAdCoins(s, '2026-11-21');
    expect(dailyOffers(DAY, s)).toEqual(b);
    expect(buyOffer(s, DAY, 0)).toBe(false);
    expect(grantAdCoins(s, DAY)).toBe(false);
    expect(adCoins(s, DAY)).toBeNull();
    expect(s.arsenal.shopDay).toBe('2026-11-21');
    expect(s.arsenal.adCoinsDay).toBe('2026-11-21');
    expect(s.arsenal.shopBought).toEqual([0]);
  });

  it('maxed weapons are not offered and cannot be bought', () => {
    const s = rich();
    s.arsenal.weapons.bow.level = WEAPON_MAX;
    expect(dailyOffers(DAY, s)).toEqual([]);
    s.arsenal.weapons.spear.owned = true;
    const o = dailyOffers('2026-11-21', s);
    expect(o).toHaveLength(3);
    for (const x of o) expect(x.weapon).toBe('spear');
    s.arsenal.weapons.spear.level = WEAPON_MAX;
    const before = snap(s);
    expect(buyOffer(s, '2026-11-21', 0)).toBe(false);
    expect(snap(s)).toBe(before);
  });

  it('offer bought once', () => {
    const s = rich();
    const o = dailyOffers(DAY, s)[1]!;
    const before = s.coins;
    expect(buyOffer(s, DAY, 1)).toBe(true);
    expect(s.coins).toBe(before - o.coins);
    expect(s.arsenal.weapons[o.weapon].shards).toBe(o.shards);
    expect(s.arsenal.shopBought).toEqual([1]);
    const after = snap(s);
    expect(buyOffer(s, DAY, 1)).toBe(false);
    expect(snap(s)).toBe(after);
    expect(buyOffer(s, DAY, 0)).toBe(true);
  });

  it('a new day resets the bought list', () => {
    const s = rich();
    buyOffer(s, DAY, 0);
    expect(buyOffer(s, '2026-11-21', 0)).toBe(true);
    expect(s.arsenal.shopDay).toBe('2026-11-21');
    expect(s.arsenal.shopBought).toEqual([0]);
    expect(s.arsenal.shopOffers).toEqual(dailyOffers('2026-11-21', s));
  });

  it('failed buys leave the save untouched', () => {
    const s = freshSave();
    s.coins = 1;
    const before = snap(s);
    expect(buyOffer(s, DAY, 0)).toBe(false);
    expect(buyOffer(s, DAY, 3)).toBe(false);
    expect(buyOffer(s, DAY, -1)).toBe(false);
    expect(snap(s)).toBe(before);
  });

  it('shards for the sling unlock it', () => {
    const s = rich();
    s.chapter = 1;
    s.arsenal.weapons.sling.shards = 9;
    for (let d = 10; d <= 31 && !s.arsenal.weapons.sling.owned; d++) {
      const day = `2027-01-${d}`;
      const i = dailyOffers(day, s).findIndex((o) => o.weapon === 'sling');
      if (i >= 0) buyOffer(s, day, i);
    }
    expect(s.arsenal.weapons.sling.owned).toBe(true);
  });
});

describe('chests', () => {
  it('buyChest queues the chest and takes the price', () => {
    const s = rich();
    expect(buyChest(s, 'silver')).toBe(true);
    expect(buyChest(s, 'gold')).toBe(true);
    expect(s.arsenal.chests).toEqual(['silver', 'gold']);
    expect(s.coins).toBe(100000 - CHEST_PRICE.silver - CHEST_PRICE.gold);
  });
  it('too poor changes nothing', () => {
    const s = freshSave();
    s.coins = CHEST_PRICE.silver - 1;
    const before = snap(s);
    expect(buyChest(s, 'silver')).toBe(false);
    expect(snap(s)).toBe(before);
  });
});

describe('ad coins', () => {
  it('ad coins capped at 3 per day', () => {
    const s = freshSave();
    expect(adCoins(s, DAY)).toBe(AD_COINS);
    for (let i = 0; i < AD_COINS_PER_DAY; i++) expect(grantAdCoins(s, DAY)).toBe(true);
    expect(s.coins).toBe(AD_COINS * 3);
    expect(adCoins(s, DAY)).toBeNull();
    const before = snap(s);
    expect(grantAdCoins(s, DAY)).toBe(false);
    expect(snap(s)).toBe(before);
  });
  it('a new day refills', () => {
    const s = freshSave();
    for (let i = 0; i < 3; i++) grantAdCoins(s, DAY);
    expect(adCoins(s, '2026-11-21')).toBe(AD_COINS);
    expect(grantAdCoins(s, '2026-11-21')).toBe(true);
    expect(s.arsenal.adCoinsUsed).toBe(1);
  });
});

describe('looks', () => {
  it('bought cosmetic is unlocked', () => {
    const s = rich();
    const c = cosmeticById('crown');
    expect(isUnlocked(c, s.best, s.runs, s.bosses, s.arsenal.boughtLooks)).toBe(false);
    const price = COSMETIC_PRICE('crown')!;
    expect(price).toBeGreaterThan(0);
    expect(buyCosmetic(s, 'crown')).toBe(true);
    expect(s.coins).toBe(100000 - price);
    expect(s.arsenal.boughtLooks).toEqual(['crown']);
    expect(isUnlocked(c, s.best, s.runs, s.bosses, s.arsenal.boughtLooks)).toBe(true);
    expect(unlockedCosmetics(0, 0, [], s.arsenal.boughtLooks).map((x) => x.id)).toContain('crown');
  });
  it('cannot buy what is already unlocked, unknown, or with too few coins', () => {
    const s = rich();
    s.best = 30;
    expect(COSMETIC_PRICE('classic')).toBeNull();
    expect(COSMETIC_PRICE('nope')).toBeNull();
    const before = snap(s);
    expect(buyCosmetic(s, 'classic')).toBe(false);
    expect(buyCosmetic(s, 'nope')).toBe(false);
    expect(buyCosmetic(s, 'crown')).toBe(false); // best 30 already unlocks it
    expect(snap(s)).toBe(before);
    const p = freshSave();
    expect(buyCosmetic(p, 'crown')).toBe(false);
    expect(p.arsenal.boughtLooks).toEqual([]);
    expect(buyCosmetic(s, 'ember')).toBe(true);
    expect(buyCosmetic(s, 'ember')).toBe(false);
  });
  it('every cosmetic except the default has a price', () => {
    for (const c of COSMETICS) expect(COSMETIC_PRICE(c.id) === null).toBe(c.id === 'classic');
  });
  it('boughtLooks is repaired', () => {
    expect(freshArsenal().boughtLooks).toEqual([]);
    expect(freshArsenal().shopOffers).toEqual([]);
    const o = { weapon: 'spear', shards: 4, coins: 120 };
    const junk = { ...freshSave(), arsenal: { ...freshArsenal(), shopDay: DAY, shopOffers: [o, { weapon: 'gun', shards: 1, coins: 1 }, { weapon: 'bow', shards: -1, coins: 5 }, 3, o, o, o] } };
    expect(repairSave(junk as unknown as SaveData).arsenal.shopOffers).toEqual([o, o, o]);
    expect(repairSave({ ...freshSave(), arsenal: { ...freshArsenal(), shopOffers: 'x' } } as unknown as SaveData).arsenal.shopOffers).toEqual([]);
    const bad = { ...freshSave(), arsenal: { ...freshArsenal(), boughtLooks: ['crown', 7, 'crown', null, 'ember'] } };
    expect(repairSave(bad as unknown as SaveData).arsenal.boughtLooks).toEqual(['crown', 'ember']);
    const nope = { ...freshSave(), arsenal: { ...freshArsenal(), boughtLooks: 'x' } };
    expect(repairSave(nope as unknown as SaveData).arsenal.boughtLooks).toEqual([]);
  });
});
