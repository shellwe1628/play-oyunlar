/**
 * Presentation model (pure, no Phaser). Everything the animation layer decides from the sim lives
 * here and only ever reads the sim through `SimView`, which has no mutating members: the
 * presentation cannot change gameplay (see tests/unit/fx.test.ts).
 */
import type { DigSim } from '../sim/dig';

/** Read-only window on the sim for the presentation layer. */
export type SimView = Pick<
  DigSim,
  'layer' | 'unlocked' | 'digPower' | 'luck' | 'baseLuck' | 'combo' | 'comboMult' | 'glint' | 'glintLuck' | 'blockHp' | 'blockDamage' | 'lastFind' | 'stats' | 'assistantRate' | 'level' | 'discovered' | 'grades' | 'setProgress' | 'setComplete'
>;

/** Pickaxe look by pick level: wood, iron, steel, gold, crystal. */
export const PICK_TIERS = [0, 5, 15, 30, 50] as const;
export function pickTier(level: number): number {
  let t = 0;
  PICK_TIERS.forEach((min, i) => {
    if (level >= min) t = i;
  });
  return t;
}

/** Helper look by assistant level: none, trowel, pick, lamp helmet, drill. */
export const HELPER_TIERS = [0, 1, 6, 13, 21] as const;
export function helperTier(level: number): number {
  let t = 0;
  HELPER_TIERS.forEach((min, i) => {
    if (level >= min) t = i;
  });
  return t;
}

export type HelperMood = 'hidden' | 'idle' | 'work' | 'found' | 'cheer' | 'nap' | 'wake';

/** What the helper is doing; advanced by time and fed events. Pure and deterministic. */
export class HelperBrain {
  mood: HelperMood = 'hidden';
  /** Seconds left in a timed mood (found, cheer, wake). */
  private left = 0;
  /** Seconds since the helper last swung (work fades back to idle). */
  private sinceSwing = 99;
  /** Pending swings, played one per `swingGap` so a big tick never floods the animation. */
  swings = 0;
  readonly swingGap = 0.32;
  private swingClock = 0;

  /** Advance; returns true on a frame where the helper should strike. */
  update(dt: number, level: number, napping: boolean): boolean {
    if (level <= 0) {
      this.mood = 'hidden';
      this.swings = 0;
      return false;
    }
    if (this.mood === 'hidden') this.mood = 'idle';
    if (napping) {
      this.mood = 'nap';
      this.swings = 0;
      return false;
    }
    if (this.mood === 'nap') {
      this.mood = 'wake';
      this.left = 1.2;
    }
    this.sinceSwing += dt;
    this.swingClock = Math.max(0, this.swingClock - dt);
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.mood = 'idle';
      return false;
    }
    if (this.swings > 0 && this.swingClock === 0) {
      this.swings -= 1;
      this.swingClock = this.swingGap;
      this.sinceSwing = 0;
      this.mood = 'work';
      return true;
    }
    if (this.mood === 'work' && this.sinceSwing > 0.8) this.mood = 'idle';
    return false;
  }

  /** The assistant hit the block `n` times (at most a few queued swings are kept). */
  hits(n: number): void {
    this.swings = Math.min(3, this.swings + n);
  }

  /** The assistant found something. */
  found(): void {
    if (this.mood === 'nap' || this.mood === 'hidden') return;
    this.mood = 'found';
    this.left = 0.7;
  }

  /** Anyone found something at 1 in 100 or rarer. */
  cheer(): void {
    if (this.mood === 'nap' || this.mood === 'hidden') return;
    this.mood = 'cheer';
    this.left = 1.6;
  }
}

/** Idle life of a fossil card, by tier index (see TIERS): none, sheen, motes, living glow. */
export type CardLife = 'none' | 'sheen' | 'motes' | 'glow';
export function cardLife(tier: number): CardLife {
  if (tier >= 5) return 'glow';
  if (tier >= 4) return 'motes';
  if (tier >= 2) return 'sheen';
  return 'none';
}

/** Taps closer together than this (s) count as a flurry: the pickaxe blurs instead of swinging fully. */
export const FLURRY_GAP = 0.13;
