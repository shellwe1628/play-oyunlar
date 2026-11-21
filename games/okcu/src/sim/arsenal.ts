/**
 * The 3D build's weapon collection (pure): which weapons are owned, their levels and shards,
 * chests waiting to be opened, the free chest timer, daily ad coins and the daily shop. Stored in
 * `SaveData.arsenal`; the old forged bow (`SaveData.bow`) stays for the 2D game and as the
 * migration source.
 */
import { progressScore } from './progress';
import { levelForBow, WEAPON_IDS, WEAPON_MAX, WEAPONS, weaponDamage, type WeaponId } from './weapons';
import type { SaveData } from './meta';

export type ChestKind = 'wood' | 'silver' | 'gold' | 'boss';
export const CHEST_KINDS: readonly ChestKind[] = ['wood', 'silver', 'gold', 'boss'];

export interface WeaponState {
  owned: boolean;
  level: number;
  shards: number;
}

export interface Arsenal {
  selected: WeaponId;
  weapons: Record<WeaponId, WeaponState>;
  /** unopened chests, oldest first */
  chests: ChestKind[];
  /** time (ms) the next free chest is ready; 0 = ready now */
  freeChestAt: number;
  /** ad coins: the day key and how many were taken that day */
  adCoinsDay: string;
  adCoinsUsed: number;
  /** daily shop: the day key and the offers bought that day (offer indices) */
  shopDay: string;
  shopBought: number[];
  /** the day's offers, stored when the day starts so they never change mid-day (see `dailyOffers`) */
  shopOffers: { weapon: WeaponId; shards: number; coins: number }[];
  /** cosmetic ids bought with coins (they count as unlocked, see `isUnlocked`) */
  boughtLooks: string[];
  /** the progress score the player had when the arsenal arrived (the rank never drops below it) */
  rankFloor: number;
  /** the one-off migration from the forged bow has run (a new save is created migrated) */
  migrated: boolean;
  /** chests opened so far (folded into the chest rng seed so identical states never repeat a roll) */
  chestsOpened: number;
}

export function freshArsenal(): Arsenal {
  const weapons = {} as Record<WeaponId, WeaponState>;
  for (const id of WEAPON_IDS) weapons[id] = { owned: id === 'bow', level: 1, shards: 0 };
  return { selected: 'bow', weapons, chests: [], freeChestAt: 0, adCoinsDay: '', adCoinsUsed: 0, shopDay: '', shopBought: [], shopOffers: [], boughtLooks: [], rankFloor: 0, migrated: true, chestsOpened: 0 };
}

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nat = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Any stored value → a valid arsenal: unknown weapon ids and chest kinds dropped, levels clamped
 * to 1 … WEAPON_MAX, the bow always owned, a selected weapon that is not owned → the bow. A save
 * with no arsenal object at all predates it and is left to `migrateArsenal` (`migrated` false).
 */
export function repairArsenal(v: unknown): Arsenal {
  const base = freshArsenal();
  const present = typeof v === 'object' && v !== null && !Array.isArray(v);
  const a = obj(v);
  const ws = obj(a.weapons);
  for (const id of WEAPON_IDS) {
    const w = obj(ws[id]);
    const level = typeof w.level === 'number' && Number.isFinite(w.level) ? Math.max(1, Math.min(WEAPON_MAX, Math.floor(w.level))) : 1;
    base.weapons[id] = { owned: id === 'bow' || w.owned === true, level, shards: nat(w.shards) };
  }
  const sel = a.selected as WeaponId;
  base.selected = WEAPON_IDS.includes(sel) && base.weapons[sel].owned ? sel : 'bow';
  base.chests = Array.isArray(a.chests) ? a.chests.filter((c): c is ChestKind => CHEST_KINDS.includes(c as ChestKind)) : [];
  base.freeChestAt = nat(a.freeChestAt);
  base.adCoinsDay = str(a.adCoinsDay);
  base.adCoinsUsed = nat(a.adCoinsUsed);
  base.shopDay = str(a.shopDay);
  base.shopBought = Array.isArray(a.shopBought) ? a.shopBought.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0) : [];
  base.shopOffers = Array.isArray(a.shopOffers)
    ? a.shopOffers
        .map(obj)
        .filter((o) => WEAPON_IDS.includes(o.weapon as WeaponId) && nat(o.shards) > 0 && nat(o.coins) > 0)
        .map((o) => ({ weapon: o.weapon as WeaponId, shards: nat(o.shards), coins: nat(o.coins) }))
        .slice(0, 3)
    : [];
  base.boughtLooks = Array.isArray(a.boughtLooks) ? [...new Set(a.boughtLooks.filter((x): x is string => typeof x === 'string' && x !== ''))] : [];
  base.rankFloor = nat(a.rankFloor);
  base.chestsOpened = nat(a.chestsOpened);
  base.migrated = present && a.migrated === true;
  return base;
}

/**
 * One-off, lossless move from the forged bow (guarded by `migrated`, so calling it again does
 * nothing): the bow gets the lowest weapon level at least as strong as old bow +N; every chapter
 * whose boss was beaten (`bosses[c] > 0`) unlocks the weapon with `unlockBoss === c` at level 1;
 * one gold welcome chest; the rank floor is today's progress score. Coins, feats and `save.bow`
 * stay as they are.
 */
export function migrateArsenal(save: SaveData): void {
  const a = save.arsenal;
  if (a.migrated) return;
  // the floor is the score as it stood before the move (unlocked weapons now add points of their own)
  a.rankFloor = Math.max(a.rankFloor, progressScore(save).total);
  a.weapons.bow.owned = true;
  a.weapons.bow.level = Math.max(a.weapons.bow.level, levelForBow(save.bow.level));
  for (const id of WEAPON_IDS) {
    const c = WEAPONS[id].unlockBoss;
    if (c !== null && (save.bosses[c] ?? 0) > 0) a.weapons[id].owned = true;
  }
  a.chests.push('gold');
  a.migrated = true;
}

/** Upgrade cost curve (retuned against the economy simulation in Task 14). */
export const UPGRADE_SHARDS_BASE = 2;
export const UPGRADE_SHARDS_PER_LEVEL = 3 / 2;
export const UPGRADE_COINS_BASE = 50;
export const UPGRADE_COINS_LINEAR = 40;
export const UPGRADE_COINS_QUAD = 5;

/** What going from `level` to `level + 1` costs; null at WEAPON_MAX (or beyond). */
export function upgradeCost(level: number): { shards: number; coins: number } | null {
  if (!(level >= 1) || level >= WEAPON_MAX) return null;
  const n = Math.floor(level) - 1;
  return {
    shards: UPGRADE_SHARDS_BASE + Math.floor(n * UPGRADE_SHARDS_PER_LEVEL),
    coins: UPGRADE_COINS_BASE + UPGRADE_COINS_LINEAR * n + UPGRADE_COINS_QUAD * n * n,
  };
}

export function canUpgrade(save: SaveData, id: WeaponId): boolean {
  const w = save.arsenal.weapons[id];
  if (!w || !w.owned) return false;
  const c = upgradeCost(w.level);
  return c !== null && w.shards >= c.shards && save.coins >= c.coins;
}

/** Guaranteed level-up: spends shards and coins. Returns false (nothing changed) if it cannot. */
export function upgradeWeapon(save: SaveData, id: WeaponId): boolean {
  if (!canUpgrade(save, id)) return false;
  const w = save.arsenal.weapons[id];
  const c = upgradeCost(w.level)!;
  w.shards -= c.shards;
  save.coins -= c.coins;
  w.level += 1;
  return true;
}

/** Selects an owned weapon; false for a locked one. */
export function selectWeapon(save: SaveData, id: WeaponId): boolean {
  if (!WEAPON_IDS.includes(id) || !save.arsenal.weapons[id].owned) return false;
  save.arsenal.selected = id;
  return true;
}

/**
 * The power number (shown beside each chapter's `RECOMMENDED_POWER`): the selected weapon's
 * damage at its level times one base for every weapon (the balance tests keep every weapon's
 * clear time within ±25 % of the others at the same level), plus a fixed amount per shop level.
 * Level 1 with no shop levels is 100; level 20 is 330; the shop adds up to 60 + 16 + 10 + 15.
 */
export const POWER_BASE = 100;
export const POWER_PER_UPGRADE = { hp: 5, coins: 2, reroll: 10, starter: 15 } as const;

export function powerOf(save: SaveData): number {
  const a = save.arsenal;
  const w = a.weapons[a.selected];
  const level = w && w.owned ? w.level : 1;
  let p = Math.round(POWER_BASE * weaponDamage(level));
  for (const id of Object.keys(POWER_PER_UPGRADE) as (keyof typeof POWER_PER_UPGRADE)[]) p += POWER_PER_UPGRADE[id] * Math.max(0, Math.floor(save.upgrades[id] ?? 0));
  return p;
}
