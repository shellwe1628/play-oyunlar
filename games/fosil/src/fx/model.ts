/**
 * Presentation model (pure, no Phaser). Everything the animation layer decides from the sim lives
 * here and only ever reads the sim through `SimView`, which has no mutating members: the
 * presentation cannot change gameplay (see tests/unit/fx.test.ts).
 */
import { FOSSILS, LAYERS, RUSH, WEAK, type Fossil, type Twist } from '../sim/data';
import type { DigSim } from '../sim/dig';

/** Read-only window on the sim for the presentation layer. */
export type SimView = Pick<
  DigSim,
  | 'layer'
  | 'unlocked'
  | 'digPower'
  | 'luck'
  | 'baseLuck'
  | 'combo'
  | 'comboMult'
  | 'glint'
  | 'glintLuck'
  | 'blockHp'
  | 'blockDamage'
  | 'lastFind'
  | 'stats'
  | 'assistantRate'
  | 'level'
  | 'discovered'
  | 'grades'
  | 'setProgress'
  | 'setComplete'
  // depth map, weak spots, Dig Rush (getters and pure queries only)
  | 'unlockPowerOf'
  | 'expeditions'
  | 'strataMult'
  | 'weakSpot'
  | 'weakMult'
  | 'sharpEye'
  | 'rushOpen'
  | 'rushReady'
  | 'rushActive'
  | 'rushLeft'
  | 'rushBlocks'
  | 'rushFinds'
  | 'rushBest'
  | 'rushWait'
>;

/** One band of the depth map: everything it prints, read off the sim. */
export interface MapBand {
  layer: number;
  id: string;
  twist: Twist;
  open: boolean;
  current: boolean;
  /** The first band that is still locked: it shows how far your dig power is from opening it. */
  next: boolean;
  found: number;
  total: number;
  complete: boolean;
  /** The rarest species of this layer in your museum, or null. */
  rarest: Fossil | null;
  /** Dig power that opens it (this stratum), and your progress towards it, 0..1. */
  unlockPower: number;
  progress: number;
}

/** The depth map, top (Topsoil) to bottom: a read-only picture of the dig. */
export function mapBands(v: SimView): MapBand[] {
  return LAYERS.map((L, layer) => {
    const set = v.setProgress(layer);
    let rarest: Fossil | null = null;
    for (const f of FOSSILS) if (f.layer === layer && v.discovered(f.id) && (!rarest || f.odds > rarest.odds)) rarest = f;
    const unlockPower = v.unlockPowerOf(layer);
    return {
      layer,
      id: L.id,
      twist: L.twist,
      open: layer <= v.unlocked,
      current: layer === v.layer,
      next: layer === v.unlocked + 1,
      found: set.found,
      total: set.total,
      complete: v.setComplete(layer),
      rarest,
      unlockPower,
      progress: layer <= v.unlocked || unlockPower <= 0 ? 1 : Math.max(0, Math.min(1, v.digPower / unlockPower)),
    };
  });
}

/**
 * The weak spot's target ring closes in as its time runs out: 1 (wide, just appeared) → 0 (on
 * the mark, about to go). Its last `warn` share of life it blinks.
 */
export function weakRing(life: number): { open: number; blink: boolean } {
  const open = Math.max(0, Math.min(1, life / WEAK.life));
  return { open, blink: open < 0.3 };
}

/** Sharp-eye pips: how many of the five steps to ×6 are lit. */
export function sharpPips(streak: number): number {
  return Math.max(0, Math.min(Math.round((WEAK.maxMult - WEAK.mult) / WEAK.step) + 1, streak));
}

/** The rush clock: whole seconds shown, the share of the ring left, and the last-10-seconds pulse. */
export function rushClock(left: number): { seconds: number; share: number; last: boolean } {
  const l = Math.max(0, left);
  return { seconds: Math.ceil(l), share: Math.min(1, l / RUSH.seconds), last: l > 0 && l <= 10 };
}

/** A wait as hours / minutes / seconds, the largest unit that is not zero first (rounded up). */
export function waitParts(seconds: number): { unit: 'h' | 'm' | 's'; h: number; m: number; s: number } {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 3600) return { unit: 'h', h: Math.floor(s / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  if (s >= 60) return { unit: 'm', h: 0, m: Math.ceil(s / 60), s: s % 60 };
  return { unit: 's', h: 0, m: 0, s };
}

/** Layers passed between two map bands, for the travel animation: 1 = down, -1 = up. */
export function travelDir(from: number, to: number): 1 | -1 {
  return to >= from ? 1 : -1;
}

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
