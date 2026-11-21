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
import { WEAPON_IDS, WEAPON_MAX, type WeaponId } from './weapons';

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
 * The day's offers (up to three). Seeded from the day key, then SNAPSHOT into `arsenal.shopOffers`
 * the first time a new day is seen, so unlocks, chests or a chapter change later that day never
 * reshuffle them and an offer index always means the same offer. Because it stores, this call may
 * change the save (persist it). Pool: owned weapons below WEAPON_MAX, plus the sling once chapter 2
 * is reached (`save.chapter >= 1`) while it is not maxed. With fewer than three such weapons the
 * list repeats (sizes may coincide); with none (everything maxed) there are no offers that day.
 * Clock skew: a day key not later than the stored day returns the stored offers; only a later key
 * starts a new day (ISO date strings compare in date order).
 */
export function dailyOffers(dayKey: string, save: SaveData): ShopOffer[] {
  const { offers, fresh } = resolveDay(dayKey, save);
  if (fresh) storeDay(save, dayKey, offers);
  return offers.map((o) => ({ ...o }));
}

function generateOffers(dayKey: string, save: SaveData): ShopOffer[] {
  const rng = createRng(hashSeed(`okcu-shop-${dayKey}`));
  const a = save.arsenal;
  const pool = WEAPON_IDS.filter((id) => (a.weapons[id].owned || (id === 'sling' && save.chapter >= 1)) && a.weapons[id].level < WEAPON_MAX);
  if (pool.length === 0) return [];
  const order = rng.shuffle(pool);
  const out: ShopOffer[] = [];
  for (let i = 0; i < OFFERS_PER_DAY; i++) {
    const shards = rng.int(OFFER_SHARDS[0], OFFER_SHARDS[1]);
    out.push({ weapon: order[i % order.length]!, shards, coins: shards * OFFER_COINS_PER_SHARD });
  }
  return out;
}

/** The offers valid for `dayKey` without touching the save; `fresh` = a new day that still has to be stored. */
function resolveDay(dayKey: string, save: SaveData): { offers: ShopOffer[]; fresh: boolean } {
  const a = save.arsenal;
  if (a.shopDay !== '' && dayKey <= a.shopDay && (a.shopDay !== dayKey || a.shopOffers.length > 0)) return { offers: a.shopOffers, fresh: false };
  return { offers: generateOffers(dayKey, save), fresh: true };
}

function storeDay(save: SaveData, dayKey: string, offers: ShopOffer[]): void {
  const a = save.arsenal;
  a.shopDay = dayKey;
  a.shopBought = [];
  a.shopOffers = offers.map((o) => ({ ...o }));
}

/** The offer indices already bought for the day `dayKey` falls in (see the clock-skew rule on `dailyOffers`). */
export function boughtToday(save: SaveData, dayKey: string): number[] {
  return resolveDay(dayKey, save).fresh ? [] : save.arsenal.shopBought;
}

/** Buys the stored offer `i` once per day: pays the coins, adds the shards (the sling unlocks at 10 like from a chest). Refuses a maxed weapon. */
export function buyOffer(save: SaveData, dayKey: string, i: number): boolean {
  const { offers, fresh } = resolveDay(dayKey, save);
  const offer = offers[i];
  if (!offer || (!fresh && save.arsenal.shopBought.includes(i)) || save.coins < offer.coins) return false;
  if (save.arsenal.weapons[offer.weapon].level >= WEAPON_MAX) return false;
  if (fresh) storeDay(save, dayKey, offers);
  const a = save.arsenal;
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
  // a day key not later than the stored one (clock skew) keeps the stored counter
  const used = dayKey > save.arsenal.adCoinsDay ? 0 : save.arsenal.adCoinsUsed;
  return used >= AD_COINS_PER_DAY ? null : AD_COINS;
}

/** Call after the ad was watched: adds the coins and counts it for today. */
export function grantAdCoins(save: SaveData, dayKey: string): boolean {
  const n = adCoins(save, dayKey);
  if (n === null) return false;
  const a = save.arsenal;
  if (dayKey > a.adCoinsDay) {
    a.adCoinsDay = dayKey;
    a.adCoinsUsed = 0;
  }
  a.adCoinsUsed += 1;
  save.coins += n;
  return true;
}
