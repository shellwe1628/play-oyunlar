/**
 * The coin shop (pure, no real money): three daily weapon-shard offers, chests for coins, looks for
 * coins and a few rewarded-ad coin top-ups per day. Every function takes the day key (`YYYY-MM-DD`)
 * as an argument and never reads a clock; a failed buy returns false and leaves the save untouched.
 * Prices are retuned against the economy simulation in Task 14.
 */
import { createRng, hashSeed } from '@oyun/core/pure';
import type { ChestKind } from './arsenal';
import { SLING_UNLOCK_SHARDS } from './chests';
import { COSMETICS, isUnlocked, type SaveData } from './meta';
import { WEAPON_IDS, type WeaponId } from './weapons';

export interface ShopOffer {
  weapon: WeaponId;
  /** shards you get */
  shards: number;
  /** coins you pay */
  coins: number;
}

export const OFFERS_PER_DAY = 3;
export const OFFER_SHARDS: readonly [number, number] = [3, 6];
export const OFFER_COINS_PER_SHARD = 30;

/**
 * Three offers for the day, seeded from the day key alone. Only weapons the player can use are
 * offered: owned ones, plus the sling once chapter 2 is reached (`save.chapter >= 1`), the same
 * rule the chests use. With fewer than three such weapons the list repeats (a fresh save sees
 * three bow offers of different sizes). The weapon set cannot change when an offer is bought
 * (the sling is already eligible), so the offers stay the same all day.
 */
export function dailyOffers(dayKey: string, save: SaveData): ShopOffer[] {
  const rng = createRng(hashSeed(`okcu-shop-${dayKey}`));
  const a = save.arsenal;
  const pool = WEAPON_IDS.filter((id) => a.weapons[id].owned || (id === 'sling' && save.chapter >= 1));
  const order = rng.shuffle(pool);
  const out: ShopOffer[] = [];
  for (let i = 0; i < OFFERS_PER_DAY; i++) {
    const shards = rng.int(OFFER_SHARDS[0], OFFER_SHARDS[1]);
    out.push({ weapon: order[i % order.length]!, shards, coins: shards * OFFER_COINS_PER_SHARD });
  }
  return out;
}

/** The offers already bought on `dayKey` (a different stored day counts as none). */
export function boughtToday(save: SaveData, dayKey: string): number[] {
  return save.arsenal.shopDay === dayKey ? save.arsenal.shopBought : [];
}

/** Buys offer `i` once per day: pays the coins, adds the shards (the sling unlocks at 10 like from a chest). */
export function buyOffer(save: SaveData, dayKey: string, i: number): boolean {
  const offer = dailyOffers(dayKey, save)[i];
  if (!offer || boughtToday(save, dayKey).includes(i) || save.coins < offer.coins) return false;
  const a = save.arsenal;
  if (a.shopDay !== dayKey) {
    a.shopDay = dayKey;
    a.shopBought = [];
  }
  a.shopBought.push(i);
  save.coins -= offer.coins;
  const w = a.weapons[offer.weapon];
  w.shards += offer.shards;
  if (offer.weapon === 'sling' && !w.owned && w.shards >= SLING_UNLOCK_SHARDS) {
    w.shards -= SLING_UNLOCK_SHARDS;
    w.owned = true;
  }
  return true;
}

/** Only these two chests are for sale (wood is the free one, boss chests are earned). */
export const CHEST_PRICE: { silver: number; gold: number } = { silver: 250, gold: 700 };

/** Pays for a chest and QUEUES it in `arsenal.chests`; the UI opens it with `openQueuedChest`. */
export function buyChest(save: SaveData, kind: 'silver' | 'gold' | ChestKind): boolean {
  if (kind !== 'silver' && kind !== 'gold') return false;
  const price = CHEST_PRICE[kind];
  if (save.coins < price) return false;
  save.coins -= price;
  save.arsenal.chests.push(kind);
  return true;
}

/** Price of a look: boss looks 1500, wave looks 50 per wave, run-count looks 60 per run; null for the default or an unknown id. */
export function COSMETIC_PRICE(id: string): number | null {
  const c = COSMETICS.find((x) => x.id === id);
  if (!c || c.id === 'classic') return null;
  if (c.boss !== undefined) return 1500;
  return c.runs > 0 ? c.runs * 60 : c.wave * 50;
}

/** Buys a look that is not unlocked yet (by progress or earlier). */
export function buyCosmetic(save: SaveData, id: string): boolean {
  const price = COSMETIC_PRICE(id);
  const c = COSMETICS.find((x) => x.id === id);
  if (price === null || !c || save.coins < price) return false;
  if (isUnlocked(c, save.best, save.runs, save.bosses, save.arsenal.boughtLooks)) return false;
  save.coins -= price;
  save.arsenal.boughtLooks.push(id);
  return true;
}

export const AD_COINS = 60;
export const AD_COINS_PER_DAY = 3;

/** The coins one more rewarded ad would give today, or null once all 3 are used. */
export function adCoins(save: SaveData, dayKey: string): number | null {
  const used = save.arsenal.adCoinsDay === dayKey ? save.arsenal.adCoinsUsed : 0;
  return used >= AD_COINS_PER_DAY ? null : AD_COINS;
}

/** Call after the ad was watched: adds the coins and counts it for today. */
export function grantAdCoins(save: SaveData, dayKey: string): boolean {
  const n = adCoins(save, dayKey);
  if (n === null) return false;
  const a = save.arsenal;
  if (a.adCoinsDay !== dayKey) {
    a.adCoinsDay = dayKey;
    a.adCoinsUsed = 0;
  }
  a.adCoinsUsed += 1;
  save.coins += n;
  return true;
}
