/**
 * Difficulty curves (pure). Every curve takes the difficulty LEVEL of a wave (see
 * `levelOf` in chapters.ts: 1 at the first stage, about +3 per chapter), not the raw wave.
 */
import type { BossKind } from './chapters';
import type { EnemyType } from './combat';
import { ARCHER_SCALE } from './tuning';

/** Aim error (std dev): launch angle in radians and speed as a fraction. */
export function enemyAccuracy(level: number): { angle: number; speed: number } {
  const w = Math.max(1, level) - 1;
  // never a sure hit: a floor of 0.05 rad keeps late volleys dodgeable by killing first
  return { angle: 0.05 + 0.29 * 0.72 ** w, speed: 0.02 + 0.055 * 0.8 ** w };
}

/** Seconds to draw and between shots. */
export function enemyTiming(level: number): { draw: number; cool: number } {
  const w = Math.max(1, level) - 1;
  return { draw: Math.max(0.75, 1.6 - 0.08 * w), cool: Math.max(1.0, 1.5 - 0.07 * w) };
}

/** Enemy arrows hit harder as the run goes on. */
export function enemyDamageMul(level: number): number {
  const w = Math.max(1, level) - 1;
  // gentle opening (45 % at level 1, full from level 5), then a slow ramp: later chapters
  // test the bow (enemy health) more than the player's health bar
  return Math.min(1, 0.45 + 0.11 * w) * 1.065 ** w;
}

/** Extra delay between enemies' first draws within a wave (shrinks to nothing by level 20). */
export function graceStep(level: number): number {
  return 0.5 + 0.9 * Math.max(0, Math.min(1, (20 - level) / 16));
}

/** Chance that a regular enemy is a helmeted veteran (no one-shot headshots). */
export function helmetChance(level: number): number {
  return Math.max(0, Math.min(1, (level - 13) * 0.2));
}

/** Seconds before the first enemy draws in a wave (shrinks late in a run). */
export function waveGrace(level: number): number {
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

export function enemyHp(type: EnemyType, level: number): number {
  return Math.round(BASE_HP[type] * (1 + 0.6 * (Math.max(1, level) - 1)) * 1.12 ** Math.max(0, level - 8));
}

export function bossHp(kind: BossKind, lap: number): number {
  return Math.round(BOSS_HP[kind] * (1 + 0.35 * lap));
}

export function enemyScale(type: EnemyType): number {
  return ARCHER_SCALE * (type === 'boss' ? 1.45 : type === 'elite' ? 1.18 : type === 'imp' ? 0.82 : 1);
}
