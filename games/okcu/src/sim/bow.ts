/**
 * The bow as a permanent item (pure): enhancement levels +0 … +20 bought at the forge.
 * One damage track: the bow's level is the only permanent damage upgrade.
 *
 * Forge rules (shown to the player exactly as written here):
 * - an attempt costs `bowCost(level)` coins, whatever the outcome;
 * - success chance = min(100 %, base chance of the level + forge heat);
 * - on success the bow gains a level and the heat resets to 0;
 * - on failure the bow keeps its level (nothing is ever lost but the coins) and the heat
 *   rises by HEAT_STEP, so a streak of failures always ends;
 * - the roll is seeded from the save's attempt counter (no real money, no ads, no reroll).
 */
import { createRng } from '@oyun/core/pure';

export const BOW_MAX = 20;
/** forge heat added by each failed attempt (percentage points as a fraction) */
export const HEAT_STEP = 0.1;

export const BOW_TIERS = ['wood', 'horn', 'steel', 'gilded', 'crystal', 'mythic'] as const;
export type BowTier = (typeof BOW_TIERS)[number];

/** First level of each tier. */
export const TIER_FROM: Record<BowTier, number> = { wood: 0, horn: 3, steel: 6, gilded: 9, crystal: 12, mythic: 15 };

export function bowTier(level: number): BowTier {
  for (let i = BOW_TIERS.length - 1; i >= 0; i--) if (level >= TIER_FROM[BOW_TIERS[i]!]) return BOW_TIERS[i]!;
  return 'wood';
}

/** Damage multiplier of the bow: +8 % per level to +10, then +10 % per level. */
export function bowDamage(level: number): number {
  const L = Math.max(0, Math.min(BOW_MAX, Math.floor(level)));
  return Math.round((1 + 0.08 * Math.min(L, 10) + 0.1 * Math.max(0, L - 10)) * 100) / 100;
}

/** Coins for one attempt at going from `level` to `level + 1` (null at the top). */
export function bowCost(level: number): number | null {
  if (level >= BOW_MAX) return null;
  return Math.round(40 * 1.3 ** level);
}

/** Base success chance of an attempt from `level` (levels +0 … +5 always succeed). */
const BASE: readonly number[] = [1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.22, 0.2, 0.18, 0.15];

export function baseChance(level: number): number {
  return BASE[Math.max(0, Math.min(BASE.length - 1, level))]!;
}

/** The chance printed on the forge button: exactly the chance the roll uses. */
export function forgeChance(level: number, heat: number): number {
  return Math.min(1, Math.round((baseChance(level) + heat) * 100) / 100);
}

/** Failures in a row after which the next attempt is certain. */
export function maxFailStreak(level: number): number {
  return Math.ceil(Math.round((1 - baseChance(level)) * 100) / (HEAT_STEP * 100));
}

export interface BowState {
  level: number;
  /** forge heat: extra chance earned by failed attempts (0 … 1) */
  heat: number;
  /** attempts made (seeds the next roll) */
  tries: number;
}

export function freshBow(): BowState {
  return { level: 0, heat: 0, tries: 0 };
}

/** The roll of attempt number `tries` (0 … 1), deterministic per save. */
export function forgeRoll(tries: number): number {
  return createRng(0x0b0f + tries * 7919).next();
}

export type ForgeResult = { ok: false; reason: 'max' | 'poor' } | { ok: true; success: boolean; chance: number; cost: number; level: number; heat: number };

/** One attempt at the anvil: spends the coins, rolls against the printed chance. */
export function attemptForge(bow: BowState, wallet: { coins: number }, roll = forgeRoll(bow.tries)): ForgeResult {
  const cost = bowCost(bow.level);
  if (cost === null) return { ok: false, reason: 'max' };
  if (wallet.coins < cost) return { ok: false, reason: 'poor' };
  const chance = forgeChance(bow.level, bow.heat);
  wallet.coins -= cost;
  bow.tries += 1;
  const success = roll < chance;
  if (success) {
    bow.level += 1;
    bow.heat = 0;
  } else {
    bow.heat = Math.min(1, Math.round((bow.heat + HEAT_STEP) * 100) / 100);
  }
  return { ok: true, success, chance, cost, level: bow.level, heat: bow.heat };
}

/**
 * Save migration: the old permanent "base damage" upgrade (+10 % per level) becomes the
 * lowest bow level whose damage is at least as high, so nobody loses damage.
 */
export function bowLevelForOldDamage(dmgLevel: number): number {
  const want = 1 + 0.1 * Math.max(0, dmgLevel);
  for (let L = 0; L <= BOW_MAX; L++) if (bowDamage(L) >= want - 1e-9) return L;
  return BOW_MAX;
}

/** How the bow glows at a level (read by the renderer; no rules). */
export interface BowGlow {
  /** moving highlight along the limbs, 0 … 1 */
  sheen: number;
  /** coloured aura strength, 0 … 1 */
  aura: number;
  /** aura colour (mythic cycles its hue with time in the renderer) */
  color: number;
  /** motes drifting off the bow */
  particles: boolean;
  /** a light trail on the drawn string */
  stringTrail: boolean;
  /** rainbow hue cycling */
  cycle: boolean;
}

const AURA: Record<BowTier, number> = { wood: 0, horn: 0xfff1c8, steel: 0x7fb8ff, gilded: 0xffc93c, crystal: 0x8ff0ff, mythic: 0xff5fd2 };

export function bowGlow(level: number): BowGlow {
  const tier = bowTier(level);
  const inTier = level - TIER_FROM[tier];
  const k = Math.min(1, inTier / 2);
  switch (tier) {
    case 'wood':
      return { sheen: 0, aura: 0, color: 0, particles: false, stringTrail: false, cycle: false };
    case 'horn':
      return { sheen: 0.4 + 0.3 * k, aura: 0, color: AURA.horn, particles: false, stringTrail: false, cycle: false };
    case 'steel':
      return { sheen: 0.7, aura: 0.25 + 0.15 * k, color: AURA.steel, particles: false, stringTrail: false, cycle: false };
    case 'gilded':
      return { sheen: 0.8, aura: 0.4 + 0.15 * k, color: AURA.gilded, particles: false, stringTrail: false, cycle: false };
    case 'crystal':
      return { sheen: 0.9, aura: 0.55 + 0.15 * k, color: AURA.crystal, particles: true, stringTrail: false, cycle: false };
    case 'mythic':
      return { sheen: 1, aura: Math.min(1, 0.7 + 0.06 * inTier), color: AURA.mythic, particles: true, stringTrail: true, cycle: level >= 18 };
  }
}
