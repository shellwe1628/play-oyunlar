/**
 * The coin shop (pure, no real money): three daily weapon-shard offers, chests for coins, looks for
 * coins and a few rewarded-ad coin top-ups per day. Every function takes the day key (`YYYY-MM-DD`)
 * as an argument and never reads a clock; a failed buy returns false and leaves the save untouched.
 * Prices are retuned against the economy simulation in Task 14.
 */
import { createRng, hashSeed } from '@oyun/core/pure';
import { DAY_FORMAT, type ChestKind } from './arsenal';
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
export const OFFER_SHARDS: readonly [number, number] = [5, 10];
export const OFFER_COINS_PER_SHARD = 250;

/** Days since 1970-01-01 for a `YYYY-MM-DD` key (civil-date arithmetic, no Date). */
function dayNumber(key: string): number {
  const y0 = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  const y = m <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** How far ahead of `dayKey` a stored day may be and still count (a timezone or one-day clock slip). */
export const DAY_SKEW_TOLERANCE = 2;

/**
 * Does the stored day still govern `dayKey`? True when it is `dayKey` itself or a little ahead
 * (clock skew: going back a day must not reset the caps). False for an earlier day (a new day),
 * an empty or malformed string, or one more than DAY_SKEW_TOLERANCE days ahead (a clock set far
 * ahead must not lock the shop out): those are stale and the day restarts. One helper for both
 * `shopDay` and `adCoinsDay`.
 */
export function storedDayHolds(stored: string, dayKey: string): boolean {
  if (!DAY_FORMAT.test(stored) || !DAY_FORMAT.test(dayKey)) return false;
  const ahead = dayNumber(stored) - dayNumber(dayKey);
  return ahead >= 0 && ahead <= DAY_SKEW_TOLERANCE;
}

/**
 * The day's offers (up to three). Seeded from the day key, then SNAPSHOT into `arsenal.shopOffers`
 * the first time a new day is seen, so unlocks, chests or a chapter change later that day never
 * reshuffle them and an offer index always means the same offer. Because it stores, this call may
 * change the save (persist it). Pool: owned weapons below WEAPON_MAX, plus the sling once chapter 2
 * is reached (`save.chapter >= 1`) while it is not maxed. With fewer than three such weapons the
 * list repeats (sizes may coincide); with none (everything maxed) there are no offers that day.
 * Clock skew: a day key up to DAY_SKEW_TOLERANCE days before the stored day keeps the stored offers
 * (see `storedDayHolds`); a stored day further ahead, or malformed, is stale and the day restarts.
 */
export function dailyOffers(dayKey: string, save: SaveData): ShopOffer[] {
  const { offers, fresh } = resolveDay(dayKey, save);
  if (fresh) storeDay(save, dayKey, offers);
  return offers.map((o) => ({ ...o }));
}

/**
 * The day's offers as `dailyOffers` would give them, WITHOUT storing anything: `fresh` says a new
 * day still has to be snapshot (call `dailyOffers` inside a save update then). For reads that must
 * not write the save (a badge, a redraw on the same day).
 */
export function peekOffers(dayKey: string, save: SaveData): { offers: ShopOffer[]; fresh: boolean } {
  const { offers, fresh } = resolveDay(dayKey, save);
  return { offers: offers.map((o) => ({ ...o })), fresh };
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
  if (storedDayHolds(a.shopDay, dayKey) && (a.shopDay !== dayKey || a.shopOffers.length > 0)) return { offers: a.shopOffers, fresh: false };
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
export const CHEST_PRICE: { silver: number; gold: number } = { silver: 2000, gold: 5500 };

/** Pays for a chest and QUEUES it in `arsenal.chests`; the UI opens it with `openQueuedChest`. */
export function buyChest(save: SaveData, kind: 'silver' | 'gold' | ChestKind): boolean {
  if (kind !== 'silver' && kind !== 'gold') return false;
  const price = CHEST_PRICE[kind];
  if (save.coins < price) return false;
  save.coins -= price;
  save.arsenal.chests.push(kind);
  return true;
}

/** Price of a look: boss looks 12 000, wave looks 400 per wave, run-count looks 500 per run (on the run-coin scale of Task 14); null for the default or an unknown id. */
export function COSMETIC_PRICE(id: string): number | null {
  const c = COSMETICS.find((x) => x.id === id);
  if (!c || c.id === 'classic') return null;
  if (c.boss !== undefined) return 12_000;
  return c.runs > 0 ? c.runs * 500 : c.wave * 400;
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

/** Three a day (a day = `DAY_PLAY_MIN` of play in economy.ts): see economy.test.ts for the speed-up and the ads' share of income. */
export const AD_COINS = 1800;
export const AD_COINS_PER_DAY = 3;

/** The coins one more rewarded ad would give today, or null once all 3 are used. */
export function adCoins(save: SaveData, dayKey: string): number | null {
  const used = storedDayHolds(save.arsenal.adCoinsDay, dayKey) ? save.arsenal.adCoinsUsed : 0;
  return used >= AD_COINS_PER_DAY ? null : AD_COINS;
}

/** Call after the ad was watched: adds the coins and counts it for today. */
export function grantAdCoins(save: SaveData, dayKey: string): boolean {
  const n = adCoins(save, dayKey);
  if (n === null) return false;
  const a = save.arsenal;
  if (!storedDayHolds(a.adCoinsDay, dayKey)) {
    a.adCoinsDay = dayKey;
    a.adCoinsUsed = 0;
  }
  a.adCoinsUsed += 1;
  save.coins += n;
  return true;
}
