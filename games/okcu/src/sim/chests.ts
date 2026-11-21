/**
 * Chests (pure): fixed odds that the UI prints verbatim, the free chest timer and the run reward
 * chest. Deterministic: time is a `now` (ms) argument, randomness comes from a seeded `Rng`.
 *
 * API choice: `openChest(save, kind, rng)` applies the loot of one chest of that kind and does NOT
 * touch `arsenal.chests` (the free chest and the run chest are opened straight away and were never
 * queued). To open a chest waiting in the queue use `openQueuedChest(save, index)`, which removes it
 * and opens it with `chestRng`.
 */
import { createRng, hashSeed, type Rng } from '@oyun/core/pure';
import { markUnseen, type Arsenal, type ChestKind } from './arsenal';
import type { SaveData } from './meta';
import type { WeaponId } from './weapons';
import { WEAPON_IDS, WEAPON_MAX } from './weapons';

export interface ChestOdds {
  /** coins, inclusive range */
  coins: [number, number];
  /** shards in one stack, inclusive range */
  shards: [number, number];
  /**
   * chance (0 … 1) that the shard stack goes to the sling instead of a random owned weapon below
   * WEAPON_MAX, while
   * the sling is still locked and chapter 2 has been reached (`save.chapter ≥ 1`)
   */
  newWeaponChance: number;
}

/** Retuned against the economy simulation in Task 14. */
export const CHEST_ODDS: Record<ChestKind, ChestOdds> = {
  wood: { coins: [150, 300], shards: [1, 2], newWeaponChance: 0.05 },
  silver: { coins: [400, 800], shards: [2, 4], newWeaponChance: 0.15 },
  gold: { coins: [1200, 2400], shards: [4, 8], newWeaponChance: 0.3 },
  boss: { coins: [2500, 4000], shards: [6, 12], newWeaponChance: 0.5 },
};

export const SLING_UNLOCK_SHARDS = 10;
/** coins per shard when every owned weapon is at WEAPON_MAX (the stack has nowhere to go) */
export const MAXED_SHARD_COINS = 100;
export const FREE_CHEST_MS = 4 * 3600_000;

export interface ChestLoot {
  /** every coin the chest gave (shards turned into coins included) */
  coins: number;
  /** of those, coins from shards with nowhere to go (every owned weapon at WEAPON_MAX), else 0 */
  fromShards: number;
  shards: { weapon: WeaponId; n: number }[];
  /** the weapon this chest unlocked (the sling), or null */
  unlocked: WeaponId | null;
}

/** The chest an ended run earns: wood below wave 8, silver from 8, gold from 22. */
export function runChest(reached: number): ChestKind {
  return reached >= 22 ? 'gold' : reached >= 8 ? 'silver' : 'wood';
}

/** Deterministic rng for a save state: same runs, queue length, chests opened and kind → same loot. */
export function chestRng(save: SaveData, kind: ChestKind): Rng {
  return createRng(hashSeed(`okcu-chest-${save.runs}-${save.arsenal.chests.length}-${save.arsenal.chestsOpened}-${kind}`));
}

/** Rolls and applies one chest of `kind` to the save (coins, shards, a possible sling unlock). */
export function openChest(save: SaveData, kind: ChestKind, rng: Rng): ChestLoot {
  const odds = CHEST_ODDS[kind];
  const a = save.arsenal;
  const coins = rng.int(odds.coins[0], odds.coins[1]);
  const n = rng.int(odds.shards[0], odds.shards[1]);
  const slingOpen = save.chapter >= 1 && !a.weapons.sling.owned;
  let weapon: WeaponId | null;
  if (slingOpen && rng.chance(odds.newWeaponChance)) weapon = 'sling';
  else {
    // shards only go where they still count: an owned weapon below the top level
    const room = WEAPON_IDS.filter((id) => a.weapons[id].owned && a.weapons[id].level < WEAPON_MAX);
    weapon = room.length > 0 ? rng.pick(room) : null;
  }
  a.chestsOpened += 1;
  if (weapon === null) {
    const fromShards = n * MAXED_SHARD_COINS;
    save.coins += coins + fromShards;
    return { coins: coins + fromShards, fromShards, shards: [], unlocked: null };
  }
  save.coins += coins;
  const w = a.weapons[weapon];
  w.shards += n;
  let unlocked: WeaponId | null = null;
  if (weapon === 'sling' && !w.owned && w.shards >= SLING_UNLOCK_SHARDS) {
    w.shards -= SLING_UNLOCK_SHARDS;
    w.owned = true;
    unlocked = 'sling';
    markUnseen(a, 'sling');
  }
  return { coins, fromShards: 0, shards: [{ weapon, n }], unlocked };
}

/** Opens (and removes) the queued chest at `index` (default the oldest); null if there is none. */
export function openQueuedChest(save: SaveData, index = 0): { kind: ChestKind; loot: ChestLoot } | null {
  const kind = save.arsenal.chests[index];
  if (kind === undefined) return null;
  const a = save.arsenal;
  const loot = openChest(save, kind, chestRng(save, kind));
  a.chests.splice(index, 1);
  // the run chest marker follows the queue: gone if it was this chest, one down if it sat behind it
  if (a.runChest === index) a.runChest = -1;
  else if (a.runChest > index) a.runChest -= 1;
  return { kind, loot };
}

/**
 * Clock skew guard: a `freeChestAt` more than FREE_CHEST_MS ahead of `now` can only come from a clock
 * moved back, so the timer restarts at now + FREE_CHEST_MS. Returns true if it was reset.
 */
export function syncFreeChest(a: Arsenal, now: number): boolean {
  if (a.freeChestAt - now > FREE_CHEST_MS) {
    a.freeChestAt = now + FREE_CHEST_MS;
    return true;
  }
  return false;
}

/** Ms until the free chest is ready: 0 … FREE_CHEST_MS, never negative. Does not change the save. */
export function freeChestWait(a: Arsenal, now: number): number {
  return Math.max(0, Math.min(FREE_CHEST_MS, a.freeChestAt - now));
}

export function freeChestReady(a: Arsenal, now: number): boolean {
  return freeChestWait(a, now) === 0;
}

/**
 * Takes the free chest if ready: wood, or silver when the rewarded ad was watched; the next one is
 * FREE_CHEST_MS later (a long absence banks one chest, not one per 4 h). Null if not ready.
 * May change `freeChestAt` even when it returns null (clock-skew reset), so persist the save either way.
 * Returns the kind only; open it with `openChest(save, kind, chestRng(save, kind))`.
 */
export function claimFreeChest(save: SaveData, now: number, adWatched: boolean): ChestKind | null {
  const a = save.arsenal;
  syncFreeChest(a, now);
  if (!freeChestReady(a, now)) return null;
  a.freeChestAt = now + FREE_CHEST_MS;
  return adWatched ? 'silver' : 'wood';
}
