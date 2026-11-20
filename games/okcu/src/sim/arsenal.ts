/**
 * The 3D build's weapon collection (pure): which weapons are owned, their levels and shards,
 * chests waiting to be opened, the free chest timer, daily ad coins and the daily shop. Stored in
 * `SaveData.arsenal`; the old forged bow (`SaveData.bow`) stays for the 2D game and as the
 * migration source.
 */
import { progressScore } from './progress';
import { levelForBow, WEAPON_IDS, WEAPON_MAX, WEAPONS, type WeaponId } from './weapons';
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
  /** the progress score the player had when the arsenal arrived (the rank never drops below it) */
  rankFloor: number;
  /** the one-off migration from the forged bow has run (a new save is created migrated) */
  migrated: boolean;
}

export function freshArsenal(): Arsenal {
  const weapons = {} as Record<WeaponId, WeaponState>;
  for (const id of WEAPON_IDS) weapons[id] = { owned: id === 'bow', level: 1, shards: 0 };
  return { selected: 'bow', weapons, chests: [], freeChestAt: 0, adCoinsDay: '', adCoinsUsed: 0, shopDay: '', shopBought: [], rankFloor: 0, migrated: true };
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
  base.rankFloor = nat(a.rankFloor);
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
  a.weapons.bow.owned = true;
  a.weapons.bow.level = Math.max(a.weapons.bow.level, levelForBow(save.bow.level));
  for (const id of WEAPON_IDS) {
    const c = WEAPONS[id].unlockBoss;
    if (c !== null && (save.bosses[c] ?? 0) > 0) a.weapons[id].owned = true;
  }
  a.chests.push('gold');
  a.rankFloor = Math.max(a.rankFloor, progressScore(save).total);
  a.migrated = true;
}
