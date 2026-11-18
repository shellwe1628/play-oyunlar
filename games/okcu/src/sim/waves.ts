/**
 * Difficulty curves (pure). Every curve takes the difficulty LEVEL of a wave (see
 * `levelOf` in chapters.ts: 1 at the first stage, about +3 per chapter), not the raw wave.
 *
 * Two settings: 'classic' (the 2D game, the balance asserted in tests/unit/world.test.ts) and
 * 'hard' (the 3D build in apps/okcu-3d): enemies shoot sooner, more often and straighter, and
 * hit at full strength from the first wave; enemies and bosses also take more arrows.
 */
export type Difficulty = 'classic' | 'hard';
import type { BossKind } from './chapters';
import type { EnemyType } from './combat';
import { ARCHER_SCALE } from './tuning';

/** Aim error (std dev): launch angle in radians and speed as a fraction. */
export function enemyAccuracy(level: number, d: Difficulty = 'classic'): { angle: number; speed: number } {
  const w = Math.max(1, level) - 1;
  if (d === 'hard') return { angle: 0.04 + 0.13 * 0.72 ** w, speed: 0.015 + 0.03 * 0.8 ** w };
  // never a sure hit: a floor of 0.05 rad keeps late volleys dodgeable by killing first
  return { angle: 0.05 + 0.29 * 0.72 ** w, speed: 0.02 + 0.055 * 0.8 ** w };
}

/** Seconds to draw and between shots. */
export function enemyTiming(level: number, d: Difficulty = 'classic'): { draw: number; cool: number } {
  const w = Math.max(1, level) - 1;
  if (d === 'hard') return { draw: Math.max(0.7, 1.25 - 0.06 * w), cool: Math.max(0.85, 1.15 - 0.05 * w) };
  return { draw: Math.max(0.75, 1.6 - 0.08 * w), cool: Math.max(1.0, 1.5 - 0.07 * w) };
}

/** Enemy arrows hit harder as the run goes on. */
export function enemyDamageMul(level: number, d: Difficulty = 'classic'): number {
  const w = Math.max(1, level) - 1;
  if (d === 'hard') return Math.min(1, 0.85 + 0.05 * w) * 1.07 ** w;
  // gentle opening (45 % at level 1, full from level 5), then a slow ramp: later chapters
  // test the bow (enemy health) more than the player's health bar
  return Math.min(1, 0.45 + 0.11 * w) * 1.065 ** w;
}

/** Extra delay between enemies' first draws within a wave (shrinks to nothing by level 20). */
export function graceStep(level: number, d: Difficulty = 'classic'): number {
  if (d === 'hard') return 0.35 + 0.6 * Math.max(0, Math.min(1, (20 - level) / 16));
  return 0.5 + 0.9 * Math.max(0, Math.min(1, (20 - level) / 16));
}

/** Chance that a regular enemy is a helmeted veteran (no one-shot headshots). */
export function helmetChance(level: number): number {
  return Math.max(0, Math.min(1, (level - 13) * 0.2));
}

/** Seconds before the first enemy draws in a wave (shrinks late in a run). */
export function waveGrace(level: number, d: Difficulty = 'classic'): number {
  if (d === 'hard') return Math.max(0.8, 1.1 - 0.1 * (Math.max(1, level) - 1));
  // never under a second: a new wave always gives time for the first shot
  return Math.max(1, 1.6 - 0.12 * (Math.max(1, level) - 1));
}

export const BASE_HP: Record<EnemyType, number> = {
  archer: 40,
  shield: 45,
  jumper: 40,
  bomber: 45,
  boss: 380,
  healer: 32,
  cover: 40,
  catcher: 45,
  ward: 40,
  elite: 70,
  imp: 22,
};

/** Each chapter boss's health at its own chapter (endless cycles add 35 % per lap). */
export const BOSS_HP: Record<BossKind, number> = { shields: 170, giant: 420, summoner: 380, warden: 520 };

export function enemyHp(type: EnemyType, level: number, d: Difficulty = 'classic'): number {
  // +12 % a level from level 8 to 22 (the chapters), then +8 % a level in endless
  const L = Math.max(1, level);
  return Math.round(BASE_HP[type] * (d === 'hard' ? 1.3 : 1) * (1 + 0.6 * (L - 1)) * 1.12 ** Math.min(14, Math.max(0, L - 8)) * 1.08 ** Math.max(0, L - 22));
}

export function bossHp(kind: BossKind, lap: number, d: Difficulty = 'classic'): number {
  return Math.round(BOSS_HP[kind] * (d === 'hard' ? 1.3 : 1) * (1 + 0.35 * lap));
}

export function enemyScale(type: EnemyType): number {
  return ARCHER_SCALE * (type === 'boss' ? 1.45 : type === 'elite' ? 1.18 : type === 'imp' ? 0.82 : 1);
}
