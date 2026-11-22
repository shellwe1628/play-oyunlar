/**
 * Shared presentation for every screen: the neon wipe between scenes, drifting motes behind the
 * menus, press squash/pop for anything tappable, staggered entrances, count-ups and the award
 * chips. Drawing only: nothing here reaches the sim or the save. With reduced motion
 * (prefers-reduced-motion) wipes become plain fades, entrances and count-ups land at once and
 * ambient motion stands still.
 */
import { getContext } from '@oyun/core';
import Phaser from 'phaser';
import { PALETTE } from '../textures';
import { bigText, fitText } from '../ui';

const WIPE_KEY = 'kvWipe';
const SLANT = 180;
const WIPE_OUT_MS = 140;
const WIPE_IN_MS = 300;

/** Reduced motion is on (system setting): no wipes, no big flashes, no ambient drift. */
export function isCalm(scene: Phaser.Scene): boolean {
  return getContext(scene.game).reducedMotion;
}

const leavingScenes = new WeakSet<Phaser.Scene>();

/** The wipe panel: a slanted ink slab wider than the screen, a neon tube on each slanted edge. */
function wipePanel(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const { width: w, height: h } = getContext(scene.game).info;
  const g = scene.add.graphics().setScrollFactor(0).setDepth(5000);
  const pw = w + SLANT;
  const y0 = -30;
  const y1 = h + 30;
  const pt = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x, y);
  g.fillStyle(PALETTE.ink, 1).fillPoints([pt(0, y0), pt(pw, y0), pt(pw - SLANT, y1), pt(-SLANT, y1)], true);
  // Faint stripes, the same slant as the letterbox around the canvas.
  for (let k = 0; k < 5; k++) {
    const x = 90 + k * 170;
    g.fillStyle(0x6a3dff, 0.1 + (k % 2) * 0.05).fillPoints([pt(x, y0), pt(x + 70, y0), pt(x + 70 - SLANT, y1), pt(x - SLANT, y1)], true);
  }
  const tube = (xTop: number, color: number): void => {
    g.lineStyle(22, color, 0.22).lineBetween(xTop, y0, xTop - SLANT, y1);
    g.lineStyle(7, color, 1).lineBetween(xTop, y0, xTop - SLANT, y1);
    g.lineStyle(2, 0xffffff, 0.9).lineBetween(xTop, y0, xTop - SLANT, y1);
  };
  tube(pw, 0xff4fd8);
  tube(0, 0x3ff6ff);
  return g;
}

/**
 * Leave for another scene behind a neon wipe (140 ms, the same time the old black fade took).
 * Repeated calls while leaving are ignored. The next scene calls wipeIn() to carry it through.
 */
export function wipeTo(scene: Phaser.Scene, key: string, data?: object): void {
  if (leavingScenes.has(scene)) return;
  leavingScenes.add(scene);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => leavingScenes.delete(scene));
  const go = (): void => {
    scene.registry.set(WIPE_KEY, true);
    scene.scene.start(key, data);
  };
  if (isCalm(scene)) {
    const cam = scene.cameras.main;
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
    cam.fadeOut(WIPE_OUT_MS, 0, 0, 0);
    return;
  }
  const w = getContext(scene.game).info.width;
  const panel = wipePanel(scene).setX(-(w + SLANT * 2 + 30));
  scene.tweens.add({ targets: panel, x: 0, duration: WIPE_OUT_MS, ease: 'Sine.easeIn', onComplete: go });
}

/** Call in create(): if this scene was reached through wipeTo, the slab slides on and off. */
export function wipeIn(scene: Phaser.Scene): void {
  if (!scene.registry.get(WIPE_KEY)) return;
  scene.registry.remove(WIPE_KEY);
  if (isCalm(scene)) return;
  const w = getContext(scene.game).info.width;
  const panel = wipePanel(scene);
  // Core fades every scene in from black after create(); under the slab that would only read as
  // a pause, so it is dropped once (the slab is the transition).
  scene.events.once(Phaser.Scenes.Events.UPDATE, () => scene.cameras.main.resetFX());
  scene.tweens.add({ targets: panel, x: w + SLANT + 40, duration: WIPE_IN_MS, ease: 'Cubic.easeOut', onComplete: () => panel.destroy() });
}

/** Soft motes drifting up behind a menu, twinkling on the beat. Fixed pool, typed-array state. */
export class Motes {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly st: Float32Array;
  private readonly calm: boolean;
  private t = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
    color: number,
    count = 22,
    depth = -96,
  ) {
    this.calm = isCalm(scene);
    this.st = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) {
      // Cheap fixed hash: the same field every visit (and in screenshots).
      const r = (n: number): number => (((i + 1) * 7919 * (n + 3) * 104729) % 1000) / 1000;
      const big = i % 4 === 0;
      const scale = big ? 0.5 + r(1) * 0.5 : 0.1 + r(1) * 0.16;
      const alpha = big ? 0.12 + r(2) * 0.1 : 0.4 + r(2) * 0.35;
      const img = scene.add
        .image(r(3) * w, r(4) * h, 'glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScrollFactor(0)
        .setDepth(depth)
        .setScale(scale)
        .setAlpha(alpha)
        .setTint(i % 3 === 0 ? 0xffffff : color);
      this.imgs.push(img);
      const o = i * 5;
      this.st[o] = 14 + r(5) * (big ? 16 : 46); // rise px/s
      this.st[o + 1] = r(6) * Math.PI * 2; // sway phase
      this.st[o + 2] = 10 + r(7) * 26; // sway px
      this.st[o + 3] = alpha;
      this.st[o + 4] = scale;
    }
  }

  update(dt: number, pulse: number): void {
    if (this.calm) return;
    this.t += dt;
    const st = this.st;
    for (let i = 0; i < this.imgs.length; i++) {
      const img = this.imgs[i]!;
      const o = i * 5;
      let y = img.y - st[o]! * dt;
      if (y < -60) {
        y += this.h + 120;
        img.x = (img.x + 197) % this.w;
      }
      const sway = Math.cos(this.t * 0.6 + st[o + 1]!) * st[o + 2]! * 0.6 * dt;
      img.setPosition(img.x + sway, y);
      const tw = 0.75 + 0.25 * Math.sin(this.t * 1.7 + st[o + 1]! * 3);
      img.setAlpha(st[o + 3]! * tw * (1 + pulse * 0.35));
      img.setScale(st[o + 4]! * (1 + pulse * 0.08));
    }
  }
}

/**
 * A soft neon halo around a rounded card (wide faint strokes under narrower brighter ones),
 * drawn into an additive Graphics centred on 0,0. Animate its alpha for a breathing light.
 */
export function drawHalo(g: Phaser.GameObjects.Graphics, w: number, h: number, radius: number, color: number): Phaser.GameObjects.Graphics {
  g.clear();
  const widths = [44, 30, 18, 9];
  const alphas = [0.1, 0.16, 0.26, 0.5];
  for (let k = 0; k < widths.length; k++) g.lineStyle(widths[k]!, color, alphas[k]).strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  return g;
}

type Tappable = Phaser.GameObjects.Container | Phaser.GameObjects.Zone;

/**
 * Press feel for a card, tab or tile that is already interactive: it sinks under the finger,
 * pops on release and fires `onTap` (a drag off cancels). The rest scale is read from the
 * object's data ('rest', default 1), so a selected tile can sit larger than the others.
 */
export function pressable(scene: Phaser.Scene, obj: Tappable, onTap: () => void, visual: Phaser.GameObjects.Container | null = obj instanceof Phaser.GameObjects.Container ? obj : null): void {
  let down = false;
  const rest = (): number => (visual?.getData('rest') as number | undefined) ?? 1;
  const settle = (): void => {
    if (!visual) return;
    scene.tweens.killTweensOf(visual);
    const a = visual.getData('restAlpha') as number | undefined;
    if (a !== undefined) visual.setAlpha(a);
    const x = visual.getData('restX') as number | undefined;
    const y = visual.getData('restY') as number | undefined;
    if (x !== undefined && y !== undefined) visual.setPosition(x, y);
  };
  obj.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
    down = true;
    getContext(scene.game).audio.unlock();
    if (!visual) return;
    settle();
    scene.tweens.add({ targets: visual, scale: rest() * 0.93, duration: 70, ease: 'Quad.easeOut' });
  });
  obj.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
    if (!down) return;
    down = false;
    if (visual) scene.tweens.add({ targets: visual, scale: rest(), duration: 110 });
  });
  obj.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
    if (!down) return;
    down = false;
    if (visual) {
      settle();
      visual.setScale(rest());
    }
    onTap();
    // onTap may have rebuilt the page (and destroyed this object), or started a motion of its
    // own (a locked card shaking): then there is no pop.
    if (!visual || !visual.active || scene.tweens.isTweening(visual)) return;
    visual.setScale(rest() * 1.07);
    scene.tweens.add({ targets: visual, scale: rest(), duration: 220, ease: 'Back.easeOut' });
  });
}

type Movable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.AlphaSingle;

export interface EnterOptions {
  dx?: number;
  dy?: number;
  /** Start scale as a factor of the rest scale (1 = no scale motion). */
  scale?: number;
  delay?: number;
  duration?: number;
  ease?: string;
}

/**
 * Entrance: the object starts offset / small / clear and eases to where it was placed. Its rest
 * values are stored in its data so a press mid-entrance can settle it. No-op with reduced motion.
 */
export function enter(scene: Phaser.Scene, obj: Movable, o: EnterOptions = {}): void {
  const x = obj.x;
  const y = obj.y;
  const sx = obj.scaleX;
  const sy = obj.scaleY;
  const a = obj.alpha;
  obj.setData('restX', x).setData('restY', y).setData('restAlpha', a);
  if (isCalm(scene)) return;
  const k = o.scale ?? 1;
  obj.setPosition(x + (o.dx ?? 0), y + (o.dy ?? 0)).setScale(sx * k, sy * k).setAlpha(0);
  scene.tweens.add({ targets: obj, x, y, scaleX: sx, scaleY: sy, alpha: a, delay: o.delay ?? 0, duration: o.duration ?? 320, ease: o.ease ?? 'Cubic.easeOut' });
}

/** A number that counts up (or down) into a text. Lands at once with reduced motion. */
export function countUp(scene: Phaser.Scene, text: Phaser.GameObjects.Text, from: number, to: number, fmt: (n: number) => string, duration = 520, delay = 0): void {
  if (isCalm(scene) || from === to) {
    text.setText(fmt(to));
    return;
  }
  text.setText(fmt(from));
  const c = { v: from };
  scene.tweens.add({
    targets: c,
    v: to,
    delay,
    duration,
    ease: 'Cubic.easeOut',
    onUpdate: () => {
      if (text.active) text.setText(fmt(Math.round(c.v)));
    },
    onComplete: () => {
      if (text.active) text.setText(fmt(to));
    },
  });
}

const chips = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container[]>();

/**
 * Award chips (feats, new trails, streak rewards): one glass chip per line, shown one after the
 * other in a single slot at `y` (the bottom edge, clear of the spark and the cards), each sliding
 * in with its star spinning, then fading. Never interactive: a tap goes straight through to the
 * retry / next level.
 */
export function awardChips(scene: Phaser.Scene, lines: readonly string[], y: number, color: number = PALETTE.gold): void {
  for (const old of chips.get(scene) ?? []) old.destroy();
  const { width } = getContext(scene.game).info;
  const calm = isCalm(scene);
  const list: Phaser.GameObjects.Container[] = [];
  const shown = lines.slice(0, 4);
  const each = shown.length > 1 ? 1250 : 2400;
  shown.forEach((line, i) => {
    const text = fitText(bigText(scene, 0, 0, line.replace(/^★\s*/, ''), 30), width - 220, 30).setOrigin(0, 0.5);
    const w = Math.min(width - 60, text.width + 110);
    const g = scene.add.graphics();
    g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(-w / 2, -26 + 6, w, 56, 28);
    g.fillStyle(0x1c0a3e, 0.94).fillRoundedRect(-w / 2, -28, w, 56, 28);
    g.fillStyle(color, 0.14).fillRoundedRect(-w / 2, -28, w, 56, 28);
    g.lineStyle(10, color, 0.2).strokeRoundedRect(-w / 2, -28, w, 56, 28);
    g.lineStyle(3, color, 1).strokeRoundedRect(-w / 2, -28, w, 56, 28);
    const glow = scene.add.image(-w / 2 + 36, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(0.9).setAlpha(0.8);
    const star = scene.add.image(-w / 2 + 36, 0, 'star-on').setScale(0.78);
    text.setX(-w / 2 + 68);
    const chip = scene.add.container(width / 2, y, [g, glow, star, text]).setDepth(2000).setAlpha(0);
    list.push(chip);
    const at = i * each;
    if (calm) scene.tweens.add({ targets: chip, alpha: 1, delay: at, duration: 1 });
    else {
      chip.setY(y + 46);
      scene.tweens.add({ targets: chip, y, alpha: 1, delay: at, duration: 300, ease: 'Back.easeOut' });
      star.setScale(0.1).setAngle(-180);
      scene.tweens.add({ targets: star, scale: 0.78, angle: 0, delay: at + 120, duration: 380, ease: 'Back.easeOut' });
      scene.tweens.add({ targets: glow, scale: 1.5, alpha: 0.25, delay: at + 120, duration: 520, ease: 'Cubic.easeOut' });
    }
    // The last chip lingers; the others make room for the next.
    const hold = i === shown.length - 1 ? Math.max(each, 2000) : each - 220;
    scene.tweens.add({ targets: chip, alpha: 0, y: y - 22, delay: at + hold, duration: 220, ease: 'Cubic.easeIn', onComplete: () => chip.destroy() });
  });
  chips.set(scene, list);
}
