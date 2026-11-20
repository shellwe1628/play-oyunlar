/**
 * The six weapons (pure data + curves). The bow keeps the old +25 damage ceiling as level 20:
 * one damage curve for every weapon, levels 1 … 20.
 */
import { BOW_MAX, bowDamage } from './bow';
import { ENEMY_DAMAGE, HARD_HEAD_MUL } from './combat';

export type WeaponId = 'bow' | 'crossbow' | 'spear' | 'boomerang' | 'sling' | 'firework';
export const WEAPON_IDS: readonly WeaponId[] = ['bow', 'crossbow', 'spear', 'boomerang', 'sling', 'firework'];
export type Projectile = 'arrow' | 'bolt' | 'spear' | 'boomerang' | 'pebble' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  projectile: Projectile;
  speedMul: number;
  gravityMul: number;
  reloadMul: number;
  dmgMul: number;
  impulseMul: number;
  /** extra targets a flight passes through */
  pierce: number;
  bounces: number;
  /** multiplies the normal head damage (1 = usual head bonus) */
  headMul: number;
  /** how strongly the wind pushes the projectile */
  windMul: number;
  /** chapter index (0 = meadow … 5 = sky) whose boss unlocks it; null = always owned */
  unlockBoss: number | null;
}

/** Sling: a head hit is worth exactly a chest hit under the 3D build's hard rules. */
export const SLING_HEAD_MUL = ENEMY_DAMAGE.body / (ENEMY_DAMAGE.head * HARD_HEAD_MUL);

const BASE = { speedMul: 1, gravityMul: 1, reloadMul: 1, dmgMul: 1, impulseMul: 1, pierce: 0, bounces: 0, headMul: 1, windMul: 1 };

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bow: { ...BASE, id: 'bow', projectile: 'arrow', unlockBoss: null },
  crossbow: { ...BASE, id: 'crossbow', projectile: 'bolt', speedMul: 1.45, gravityMul: 0.35, reloadMul: 1.6, windMul: 0.4, unlockBoss: 0 },
  spear: { ...BASE, id: 'spear', projectile: 'spear', speedMul: 0.8, gravityMul: 1.15, impulseMul: 2.2, dmgMul: 1.35, pierce: 1, unlockBoss: 1 },
  boomerang: { ...BASE, id: 'boomerang', projectile: 'boomerang', dmgMul: 0.6, unlockBoss: 2 },
  sling: { ...BASE, id: 'sling', projectile: 'pebble', dmgMul: 0.55, bounces: 2, headMul: SLING_HEAD_MUL, unlockBoss: 4 },
  firework: { ...BASE, id: 'firework', projectile: 'rocket', reloadMul: 2.0, dmgMul: 0.8, unlockBoss: 3 },
};

export const WEAPON_MAX = 20;

const clampLevel = (l: number): number => Math.max(1, Math.min(WEAPON_MAX, Math.floor(l)));

/**
 * Damage multiplier at a weapon level: the bow curve sampled at x = (L-1) × 25/19, linearly
 * interpolated between neighbouring bow levels, rounded UP to 2 decimals (never below the bow).
 */
export function weaponDamage(level: number): number {
  const x = ((clampLevel(level) - 1) * BOW_MAX) / (WEAPON_MAX - 1);
  const lo = Math.floor(x);
  const hi = Math.min(BOW_MAX, lo + 1);
  const v = bowDamage(lo) + (bowDamage(hi) - bowDamage(lo)) * (x - lo);
  return Math.ceil(v * 100 - 1e-9) / 100;
}

/** Save migration: the lowest weapon level that hits at least as hard as old bow +N. */
export function levelForBow(bowLevel: number): number {
  const want = bowDamage(bowLevel);
  for (let l = 1; l <= WEAPON_MAX; l++) if (weaponDamage(l) >= want - 1e-9) return l;
  return WEAPON_MAX;
}

/** Largest old bow +N whose damage does not exceed this weapon level's (rank points). */
export function bowEquivalent(level: number): number {
  const d = weaponDamage(level);
  let n = 0;
  for (let k = 0; k <= BOW_MAX; k++) if (bowDamage(k) <= d + 1e-9) n = k;
  return n;
}

/** `pierce` / `bounces` are absolute totals (base included); the multipliers are perk-only (times WEAPONS[id].reloadMul etc.). */
export interface WeaponPerks {
  pierce: number;
  bounces: number;
  reloadMul: number;
  returnSpeedMul: number;
  blastRadiusMul: number;
}

/**
 * Perks step up at levels 5, 10, 15 and 20 (s = steps reached, 0 … 4); only each weapon's own
 * perk moves, the rest stay neutral (0 / 1):
 * - crossbow: reload ×(1 − 0.05 s) (down to 0.80)
 * - spear: +1 pierce at levels 10 and 20
 * - boomerang: return flight ×(1 + 0.1 s)
 * - sling: +1 bounce at levels 10 and 20
 * - firework: blast radius ×(1 + 0.08 s)
 */
export function weaponPerks(id: WeaponId, level: number): WeaponPerks {
  const s = Math.floor(clampLevel(level) / 5);
  const w = WEAPONS[id];
  return {
    pierce: w.pierce + (id === 'spear' ? Math.floor(s / 2) : 0),
    bounces: w.bounces + (id === 'sling' ? Math.floor(s / 2) : 0),
    reloadMul: id === 'crossbow' ? 1 - 0.05 * s : 1,
    returnSpeedMul: id === 'boomerang' ? 1 + 0.1 * s : 1,
    blastRadiusMul: id === 'firework' ? 1 + 0.08 * s : 1,
  };
}
