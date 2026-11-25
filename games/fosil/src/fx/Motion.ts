/**
 * Shared motion helpers for the polish round: a capped, non-stacking shake, edge flashes that
 * leave the middle of the screen readable, number count-ups, eased bar fills and ambient dust
 * motes. Presentation only; everything here respects reduced motion.
 */
import type { OyunScene, ProgressBar } from '@oyun/core';
import Phaser from 'phaser';

/** Highest camera trauma any single moment may reach (core: offset = 22 px × trauma²). */
export const SHAKE_CAP = 0.5;
/** Core's trauma decay per real second (createTrauma default). */
const TRAUMA_DECAY = 1.6;

/**
 * Make this scene's shake calm: every request is clamped to `cap`, and requests never add up.
 * A shake only tops the camera up to its own size, so a break + a find + a fusion in the same
 * moment shake as much as the biggest of them, not the sum. Call once in create().
 */
export function calmShake(scene: OyunScene, cap = SHAKE_CAP): void {
  const juice = scene.juice;
  const raw = juice.shake.bind(juice);
  let level = 0;
  let last = performance.now();
  juice.shake = (amount: number): void => {
    const now = performance.now();
    level = Math.max(0, level - (TRAUMA_DECAY * (now - last)) / 1000);
    last = now;
    const add = Math.min(amount, cap) - level;
    if (add <= 0) return;
    level += add;
    raw(add);
  };
}

/** Bands of the edge glow and how far it reaches in from the screen edge (logical px). */
const EDGE_BANDS = 22;
const EDGE_REACH = 176;

/**
 * A coloured glow around the screen edges that fades out: the celebration reads, and what the
 * player has to see in the middle (the block, the odds, the HUD) is never painted over.
 * Drawn as nested frames of plain rectangles, not as one stretched image: a screen-sized
 * textured quad tore into pieces while the camera shook (seen in the headless renderer).
 */
export function edgeFlash(scene: OyunScene, color: number, ms: number, depth = 940, strength = 1): void {
  const L = scene.layout;
  const g = scene.add.graphics().setDepth(depth);
  const band = EDGE_REACH / EDGE_BANDS;
  // a little beyond the screen on every side, so a shaking camera never shows the glow's own edge
  const out = 24;
  for (let i = 0; i < EDGE_BANDS; i++) {
    // frame i covers a..b in from the edge (the outermost also `out` beyond it); its four sides
    // do not overlap, so the corners are no brighter than the rest
    const a = i === 0 ? -out : i * band;
    const b = (i + 1) * band;
    g.fillStyle(color, 0.8 * ((EDGE_BANDS - i) / EDGE_BANDS) ** 2);
    g.fillRect(a, a, L.width - a * 2, b - a).fillRect(a, L.height - b, L.width - a * 2, b - a);
    g.fillRect(a, b, b - a, L.height - b * 2).fillRect(L.width - b, b, b - a, L.height - b * 2);
  }
  g.setAlpha((scene.oyun.reducedMotion ? 0.45 : 1) * strength);
  scene.tweens.add({ targets: g, alpha: 0, duration: ms, ease: 'Cubic.easeOut', onComplete: () => g.destroy() });
}

/**
 * Count a number up (or down) to `to`. `show` is called at most `steps` times plus once at the
 * end with the exact value, so a text object is re-rendered a handful of times, not every frame.
 * Reduced motion: the final value at once. Returns the tween (remove() it to cancel the count).
 */
export function countTo(scene: OyunScene, from: number, to: number, ms: number, show: (v: number) => void, steps = 12, delay = 0): Phaser.Tweens.Tween | null {
  if (scene.oyun.reducedMotion || from === to || ms <= 0) {
    show(to);
    return null;
  }
  show(from);
  let shown = 0;
  return scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: ms,
    delay,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => {
      const p = tw.getValue() ?? 1;
      const step = Math.floor(p * steps);
      if (step === shown) return;
      shown = step;
      show(from + (to - from) * p);
    },
    onComplete: () => show(to),
  });
}

/** Fill a bar from its current value to `to` with an ease (one tween; reduced motion: at once). */
export function fillBar(scene: OyunScene, bar: ProgressBar, to: number, ms = 420, delay = 0): Phaser.Tweens.Tween | null {
  const from = bar.value;
  if (scene.oyun.reducedMotion || Math.abs(to - from) < 0.002) {
    bar.setValue(to);
    return null;
  }
  return scene.tweens.addCounter({
    from,
    to,
    duration: ms,
    delay,
    ease: 'Cubic.easeOut',
    onUpdate: (tw) => {
      if (bar.active) bar.setValue(tw.getValue() ?? to);
    },
    onComplete: () => {
      if (bar.active) bar.setValue(to);
    },
  });
}

export interface MotesOptions {
  /** Area the motes live in (logical px). */
  x: number;
  y: number;
  w: number;
  h: number;
  count?: number;
  colors: readonly number[];
  /** Peak alpha of a mote. */
  alpha?: number;
  /** Texture; 'oyun-dot' by default, 'spark' for glints. */
  texture?: string;
  scale?: [number, number];
  /** Drift in px/s: x is a sway amplitude, y a steady rise (negative = up). */
  rise?: number;
  depth?: number;
  additive?: boolean;
}

/**
 * Ambient dust motes drifting through a lit area: a fixed set of images moved by hand (no tweens,
 * no allocation per frame). Each mote rises slowly, sways and breathes in and out; when it leaves
 * the top it re-enters at the bottom. Reduced motion: nothing is created.
 */
export class Motes {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly phase: Float32Array;
  private readonly speed: Float32Array;
  private clock = 0;
  private readonly o: Required<Pick<MotesOptions, 'x' | 'y' | 'w' | 'h' | 'alpha' | 'rise'>>;

  constructor(scene: OyunScene, opts: MotesOptions) {
    const n = scene.oyun.reducedMotion ? 0 : Math.min(24, opts.count ?? 14);
    this.o = { x: opts.x, y: opts.y, w: opts.w, h: opts.h, alpha: opts.alpha ?? 0.5, rise: opts.rise ?? -14 };
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.phase = new Float32Array(n);
    this.speed = new Float32Array(n);
    const [s0, s1] = opts.scale ?? [0.25, 0.6];
    for (let i = 0; i < n; i++) {
      this.px[i] = Math.random() * opts.w;
      this.py[i] = Math.random() * opts.h;
      this.phase[i] = Math.random() * Math.PI * 2;
      this.speed[i] = 0.6 + Math.random() * 0.8;
      const img = scene.add
        .image(0, 0, opts.texture ?? 'oyun-dot')
        .setTint(opts.colors[i % opts.colors.length] ?? 0xffffff)
        .setScale(s0 + Math.random() * (s1 - s0))
        .setDepth(opts.depth ?? 0)
        .setAlpha(0);
      if (opts.additive) img.setBlendMode(Phaser.BlendModes.ADD);
      this.imgs.push(img);
    }
  }

  /** The images, for adding to a container that should own them. */
  get list(): readonly Phaser.GameObjects.Image[] {
    return this.imgs;
  }

  update(dt: number): void {
    const n = this.imgs.length;
    if (n === 0) return;
    this.clock += dt;
    const { x, y, h, alpha, rise } = this.o;
    for (let i = 0; i < n; i++) {
      const sp = this.speed[i]!;
      let py = this.py[i]! + rise * sp * dt;
      if (py < 0) py += h;
      else if (py > h) py -= h;
      this.py[i] = py;
      const ph = this.phase[i]!;
      const sway = Math.sin(this.clock * 0.6 * sp + ph) * 14;
      // fade near the top and bottom edges of the area, and breathe
      const edge = Math.min(1, py / 40, (h - py) / 40);
      const breathe = 0.55 + 0.45 * Math.sin(this.clock * 1.3 * sp + ph * 2);
      const img = this.imgs[i]!;
      img.setPosition(x + this.px[i]! + sway, y + py);
      img.setAlpha(alpha * edge * breathe);
    }
  }

  setVisible(v: boolean): void {
    for (const img of this.imgs) img.setVisible(v);
  }
}
