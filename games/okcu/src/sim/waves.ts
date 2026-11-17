/** Wave director: ledge layouts, who spawns, how hard they are (pure). */
import type { Rng } from '@oyun/core/pure';
import type { Ledge } from './body';
import type { EnemyType } from './combat';
import { ARCHER_SCALE } from './tuning';

const L = (x: number, y: number, w: number, h = 58): Ledge => ({ x, y, w, h });

/** Three rotating enemy layouts (nearest ledge first) and the boss arena. */
export const LAYOUTS: readonly (readonly Ledge[])[] = [
  [L(430, 860, 170), L(520, 640, 180), L(318, 488, 150), L(528, 360, 170)],
  [L(392, 800, 160), L(560, 590, 150), L(396, 420, 150), L(566, 944, 140)],
  [L(474, 900, 160), L(326, 668, 150), L(540, 500, 160), L(372, 352, 150)],
];
export const BOSS_LAYOUT: readonly Ledge[] = [L(410, 770, 290, 72), L(322, 470, 140), L(560, 410, 140)];

/** Layout of a wave; `rot` (0..2, seeded per run) shifts the rotation so runs differ. */
export function layoutFor(wave: number, rot = 0): readonly Ledge[] {
  return wave % 5 === 0 ? BOSS_LAYOUT : LAYOUTS[(wave - 1 + rot) % LAYOUTS.length]!;
}


const POOL: readonly { type: EnemyType; weight: number }[] = [
  { type: 'archer', weight: 5 },
  { type: 'shield', weight: 3 },
  { type: 'jumper', weight: 3 },
  { type: 'bomber', weight: 2 },
];

function pickType(rng: Rng): EnemyType {
  let roll = rng.next() * POOL.reduce((s, p) => s + p.weight, 0);
  for (const p of POOL) {
    roll -= p.weight;
    if (roll < 0) return p.type;
  }
  return 'archer';
}

/** Enemies of a wave. New types are introduced alone; every fifth wave is a boss. */
export function waveEnemies(wave: number, rng: Rng): EnemyType[] {
  switch (wave) {
    case 1:
      return ['archer'];
    case 2:
      return ['archer', 'archer'];
    case 3:
      return ['shield'];
    case 4:
      return ['jumper'];
    case 5:
      return ['boss'];
    case 6:
      return ['bomber'];
    default:
      break;
  }
  if (wave % 5 === 0) {
    const escorts = Math.min(2, Math.floor((wave - 5) / 10));
    const out: EnemyType[] = ['boss'];
    for (let i = 0; i < escorts; i++) out.push(pickType(rng));
    return out;
  }
  const count = Math.min(4, 2 + Math.floor((wave - 6) / 2));
  const out: EnemyType[] = [];
  for (let i = 0; i < count; i++) out.push(pickType(rng));
  return out;
}

/** Aim error (std dev): launch angle in radians and speed as a fraction. */
export function enemyAccuracy(wave: number): { angle: number; speed: number } {
  const w = Math.max(1, wave) - 1;
  return { angle: 0.02 + 0.32 * 0.7 ** w, speed: 0.015 + 0.06 * 0.8 ** w };
}

/** Seconds to draw and between shots. */
export function enemyTiming(wave: number): { draw: number; cool: number } {
  const w = Math.max(1, wave) - 1;
  return { draw: Math.max(0.5, 1.6 - 0.08 * w), cool: Math.max(0.6, 1.5 - 0.07 * w) };
}

/** Enemy arrows hit harder as waves go on. */
export function enemyDamageMul(wave: number): number {
  const w = Math.max(1, wave) - 1;
  // gentle opening (45 % on wave 1, full from wave 5), then the late-game ramp
  return Math.min(1, 0.45 + 0.11 * w) * 1.11 ** w;
}

/** Extra delay between enemies' first draws within a wave (shrinks to nothing by wave 20). */
export function graceStep(wave: number): number {
  return 1.4 * Math.max(0, Math.min(1, (20 - wave) / 16));
}

/** Chance that a regular enemy is a helmeted veteran (no one-shot headshots). */
export function helmetChance(wave: number): number {
  return Math.max(0, Math.min(1, (wave - 13) * 0.2));
}

/** Seconds before the first enemy draws in a wave (shrinks late in a run). */
export function waveGrace(wave: number): number {
  return Math.max(0, 1.6 - 0.12 * (Math.max(1, wave) - 1));
}

export const BASE_HP: Record<EnemyType, number> = { archer: 40, shield: 45, jumper: 40, bomber: 45, boss: 380 };

export function enemyHp(type: EnemyType, wave: number): number {
  if (type === 'boss') return BASE_HP.boss + 160 * (Math.max(1, Math.floor(wave / 5)) - 1);
  return Math.round(BASE_HP[type] * (1 + 0.6 * (Math.max(1, wave) - 1)) * 1.12 ** Math.max(0, wave - 10));
}

export function enemyScale(type: EnemyType): number {
  return ARCHER_SCALE * (type === 'boss' ? 1.45 : 1);
}
