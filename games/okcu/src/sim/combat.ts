/** The damage and effect table: what a hit on each body part does (pure). */
import type { PartKind } from './ragdoll';

export type EnemyType = 'archer' | 'shield' | 'jumper' | 'bomber' | 'boss' | 'healer' | 'cover' | 'catcher' | 'ward' | 'elite' | 'imp' | 'volley' | 'mage';

/** Enemies that carry a staff and cast orbs instead of loosing arrows (no bow drawn). */
export function castsSpells(type: TargetKind): boolean {
  return type === 'healer' || type === 'mage';
}
export type TargetKind = EnemyType | 'player';
export type HitPart = PartKind;

export interface HitOutcome {
  damage: number;
  /** instant knockout regardless of health */
  ko: boolean;
  /** headshot-class moment: slow motion + zoom */
  slowmo: boolean;
  /** extra aim error (radians, enemies) */
  aimPenalty: number;
  /** seconds of aim wobble (player) */
  wobble: number;
  /** seconds of weakened legs */
  stagger: number;
  /** stance shove in px (scaled by the arrow's impulse) */
  shove: number;
}

/** Damage dealt to enemies by the player's arrows, before multipliers. */
export const ENEMY_DAMAGE: Record<HitPart, number> = { head: 50, body: 40, arm: 24, leg: 24, weak: 50 };
/** Damage dealt to the player by enemy arrows. */
export const PLAYER_DAMAGE: Record<HitPart, number> = { head: 45, body: 28, arm: 18, leg: 18, weak: 28 };
/** Boss armour: damage multiplier per part. */
export const BOSS_ARMOUR: Record<HitPart, number> = { head: 0.4, body: 0.15, arm: 0.12, leg: 0.12, weak: 2.6 };

/** Veteran archers (late waves) wear a helmet: a head hit is a big hit, not a knockout. */
export const HELMET_HEAD_MUL = 1.6;
/**
 * The 3D build's rules ('hard', see waves.ts): a headshot is a huge hit (this × head damage) and
 * keeps its slow-motion moment, but knocks out only if it takes the last of the health. A strong
 * enough bow still one-shots with it; an under-forged one leaves the archer reeling.
 */
export const HARD_HEAD_MUL = 3;

export function resolveHit(target: TargetKind, part: HitPart, dmgMul: number, helmet = false, hard = false): HitOutcome {
  const out: HitOutcome = { damage: 0, ko: false, slowmo: false, aimPenalty: 0, wobble: 0, stagger: 0, shove: 0 };
  if (target === 'player') {
    out.damage = PLAYER_DAMAGE[part] * dmgMul;
    if (part === 'arm') out.wobble = 3;
    if (part === 'leg') out.stagger = 0.5;
    if (part === 'head') out.stagger = 0.3;
    return out;
  }
  const armour = target === 'boss' ? BOSS_ARMOUR[part] : part === 'head' && helmet ? HELMET_HEAD_MUL * (ENEMY_DAMAGE.body / ENEMY_DAMAGE.head) : 1;
  out.damage = Math.round(ENEMY_DAMAGE[part] * dmgMul * armour * 100) / 100;
  if (part === 'head' && target !== 'boss') {
    if (hard) out.damage = Math.round(ENEMY_DAMAGE.head * HARD_HEAD_MUL * dmgMul * (helmet ? 0.55 : 1) * 100) / 100;
    out.ko = !helmet && !hard;
    out.slowmo = true;
  }
  if (part === 'weak') out.slowmo = true;
  if (part === 'arm') out.aimPenalty = 0.05;
  if (part === 'leg') {
    out.stagger = 0.45;
    out.shove = target === 'boss' || target === 'elite' ? 0 : 1; // too big to topple
  }
  return out;
}
