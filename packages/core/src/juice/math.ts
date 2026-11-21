/** Pure juice maths (no Phaser): trauma shake, hit-stop clock, easing, feedback tiers. */

export interface ShakeOffset {
  x: number;
  y: number;
  roll: number;
}

export interface TraumaOptions {
  /** Trauma lost per real second. Default 1.6 (a full hit settles in ~0.6 s). */
  decay?: number;
  /** Max camera offset in logical px at trauma 1. Default 22. */
  maxOffset?: number;
  /** Max camera roll in radians at trauma 1. Default 0.035. */
  maxRoll?: number;
}

export interface Trauma {
  readonly trauma: number;
  /** Player setting 0..1 (reduce motion → 0 or ~0.3). */
  strength: number;
  add(amount: number): void;
  /** Advance by REAL seconds (not hit-stop scaled) and return the offset to apply. */
  update(dtSeconds: number): ShakeOffset;
}

/** Shake = trauma² × strength, driven by summed sines (smooth, not per-frame random). */
export function createTrauma(opts: TraumaOptions = {}): Trauma {
  const decay = opts.decay ?? 1.6;
  const maxOffset = opts.maxOffset ?? 22;
  const maxRoll = opts.maxRoll ?? 0.035;
  let trauma = 0;
  let t = 0;
  let strength = 1;
  return {
    get trauma() {
      return trauma;
    },
    get strength() {
      return strength;
    },
    set strength(v: number) {
      strength = Math.min(1, Math.max(0, v));
    },
    add(amount) {
      trauma = Math.min(1, Math.max(0, trauma + amount));
    },
    update(dt) {
      if (trauma <= 0) return { x: 0, y: 0, roll: 0 };
      trauma = Math.max(0, trauma - decay * dt);
      if (trauma === 0) return { x: 0, y: 0, roll: 0 };
      t += dt * 30;
      const s = trauma * trauma * strength;
      if (s === 0) return { x: 0, y: 0, roll: 0 };
      return {
        x: maxOffset * s * Math.sin(t * 1.7),
        y: maxOffset * s * Math.sin(t * 2.3 + 1.3),
        roll: maxRoll * s * Math.sin(t * 1.1 + 0.7),
      };
    },
  };
}

export interface HitStopOptions {
  /** Longest allowed stop; longer requests are clamped. Default 150 ms. */
  maxMs?: number;
  /** Time scale during the stop. 0 = freeze (default), 0.05 = slow motion. */
  scale?: number;
}

export interface HitStop {
  readonly active: boolean;
  /** Request a stop. Overlapping requests keep whichever ends later. */
  trigger(ms: number): void;
  /** Advance by REAL milliseconds; returns the time scale gameplay should use this frame. */
  update(realMs: number): number;
}

export function createHitStop(opts: HitStopOptions = {}): HitStop {
  const maxMs = opts.maxMs ?? 150;
  const scale = opts.scale ?? 0;
  let remaining = 0;
  return {
    get active() {
      return remaining > 0;
    },
    trigger(ms) {
      remaining = Math.max(remaining, Math.min(Math.max(0, ms), maxMs));
    },
    update(realMs) {
      if (remaining <= 0) return 1;
      remaining = Math.max(0, remaining - realMs);
      return remaining > 0 ? scale : 1;
    },
  };
}

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return x === 1 ? 1 : 1 - (1 - x) ** 3;
}

/** Overshoots past 1 then settles; good for pops. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const x = clamp01(t);
  if (x === 1) return 1;
  const c3 = overshoot + 1;
  return 1 + c3 * (x - 1) ** 3 + overshoot * (x - 1) ** 2;
}

export interface FeedbackTier {
  trauma: number;
  hitStopMs: number;
  particles: number;
  haptic: 'light' | 'medium' | 'heavy';
}

/** One table keeps every game proportional (see game-feel tiers). */
export const FEEDBACK_TIERS = {
  small: { trauma: 0.15, hitStopMs: 0, particles: 4, haptic: 'light' },
  medium: { trauma: 0.4, hitStopMs: 50, particles: 10, haptic: 'medium' },
  large: { trauma: 0.8, hitStopMs: 120, particles: 28, haptic: 'heavy' },
} as const satisfies Record<string, FeedbackTier>;

export type FeedbackTierName = keyof typeof FEEDBACK_TIERS;
