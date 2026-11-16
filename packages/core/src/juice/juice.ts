import Phaser from 'phaser';
import { getContext } from '../context';
import { cssColor } from '../ui/theme';
import { FEEDBACK_TIERS, createHitStop, createTrauma, type FeedbackTierName } from './math';

export interface FloatTextOptions {
  color?: number;
  size?: number;
  /** Pixels to rise. Default 90. */
  rise?: number;
  duration?: number;
}

export interface BurstOptions {
  count?: number;
  color?: number;
  /** Max travel in px. Default 140. */
  distance?: number;
  /** Texture key; default 'oyun-dot'. */
  texture?: string;
  duration?: number;
}

type Scalable = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform;

/**
 * Per-scene juice, available as `this.juice` in an OyunScene.
 * Shake moves only the camera; hit-stop scales this scene's clock (tweens + timers) and the
 * value returned by `scaledDelta()`. Your update loop must step the sim with scaledDelta(delta).
 */
export class Juice {
  private readonly trauma = createTrauma();
  private readonly stop = createHitStop();
  private lastOffset = { x: 0, y: 0 };
  private scale = 1;
  private readonly pops = new WeakMap<object, Phaser.Tweens.Tween>();

  constructor(private readonly scene: Phaser.Scene) {
    this.trauma.strength = getContext(scene.game).reducedMotion ? 0.3 : 1;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick);
      this.applyScale(1);
    });
  }

  /** Current gameplay time scale (0 during a hit-stop freeze). */
  get timeScale(): number {
    return this.scale;
  }

  /** Delta (ms) your sim should advance by this frame. */
  scaledDelta(deltaMs: number): number {
    return deltaMs * this.scale;
  }

  /** Add camera trauma 0..1 (it accumulates and decays in real time). */
  shake(amount: number): void {
    this.trauma.add(amount);
  }

  /** Freeze gameplay for ms (max 150). Overlapping stops keep the later end. */
  hitStop(ms: number): void {
    this.stop.trigger(ms);
    this.scale = this.stop.active ? 0 : 1;
    this.applyScale(this.scale);
  }

  /** One call per event: shake + hit-stop + particles + haptic, proportional by tier. */
  feedback(tier: FeedbackTierName, x: number, y: number, color = 0xffffff): void {
    const t = FEEDBACK_TIERS[tier];
    this.shake(t.trauma);
    if (t.hitStopMs > 0) this.hitStop(t.hitStopMs);
    this.burst(x, y, { count: t.particles, color });
    getContext(this.scene.game).platform.haptic(t.haptic);
  }

  /** Scale pop with overshoot; always ends exactly at the object's rest scale. */
  pop(target: Scalable, amount = 1.25, duration = 220): void {
    const prev = this.pops.get(target);
    const restX = (target.getData('oyunRestScaleX') as number | undefined) ?? target.scaleX;
    const restY = (target.getData('oyunRestScaleY') as number | undefined) ?? target.scaleY;
    target.setData('oyunRestScaleX', restX).setData('oyunRestScaleY', restY);
    prev?.stop();
    target.setScale(restX * amount, restY * amount);
    const tw = this.scene.tweens.add({
      targets: target,
      scaleX: restX,
      scaleY: restY,
      duration,
      ease: 'Back.easeOut',
      onComplete: () => target.setScale(restX, restY),
      onStop: () => target.setScale(restX, restY),
    });
    this.pops.set(target, tw);
  }

  /** Squash-and-stretch (area preserving) back to rest. */
  squash(target: Scalable, amount = 0.25, duration = 260): void {
    const restX = (target.getData('oyunRestScaleX') as number | undefined) ?? target.scaleX;
    const restY = (target.getData('oyunRestScaleY') as number | undefined) ?? target.scaleY;
    target.setData('oyunRestScaleX', restX).setData('oyunRestScaleY', restY);
    this.pops.get(target)?.stop();
    target.setScale(restX * (1 + amount), restY * (1 - amount));
    const tw = this.scene.tweens.add({
      targets: target,
      scaleX: restX,
      scaleY: restY,
      duration,
      ease: 'Elastic.easeOut',
      easeParams: [1.2, 0.5],
      onComplete: () => target.setScale(restX, restY),
      onStop: () => target.setScale(restX, restY),
    });
    this.pops.set(target, tw);
  }

  /** Text that rises and fades out, then destroys itself. */
  floatText(x: number, y: number, text: string, opts: FloatTextOptions = {}): Phaser.GameObjects.Text {
    const ctx = getContext(this.scene.game);
    const label = this.scene.add
      .text(x, y, text, {
        fontFamily: ctx.theme.fontFamily,
        fontSize: `${opts.size ?? 48}px`,
        fontStyle: '800',
        color: cssColor(opts.color ?? ctx.theme.colors.text),
        stroke: cssColor(ctx.theme.colors.shadow),
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setDepth(1000);
    label.setScale(0.6);
    this.scene.tweens.add({ targets: label, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: label,
      y: y - (opts.rise ?? 90),
      alpha: 0,
      delay: 120,
      duration: opts.duration ?? 650,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
    return label;
  }

  /** Radial particle burst from (x, y) using a generated texture. Cosmetic randomness only. */
  burst(x: number, y: number, opts: BurstOptions = {}): void {
    const count = opts.count ?? 10;
    const dist = opts.distance ?? 140;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const d = dist * (0.5 + Math.random() * 0.5);
      const p = this.scene.add
        .image(x, y, opts.texture ?? 'oyun-dot')
        .setTint(opts.color ?? 0xffffff)
        .setScale(0.6 + Math.random() * 0.8)
        .setDepth(900);
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        scale: 0,
        alpha: 0.2,
        duration: opts.duration ?? 420 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private readonly tick = (_time: number, delta: number): void => {
    this.scale = this.stop.update(delta);
    this.applyScale(this.scale);
    const cam = this.scene.cameras.main;
    const off = this.trauma.update(delta / 1000);
    cam.scrollX += off.x - this.lastOffset.x;
    cam.scrollY += off.y - this.lastOffset.y;
    cam.setRotation(off.roll);
    this.lastOffset = { x: off.x, y: off.y };
  };

  private applyScale(scale: number): void {
    // Phaser treats timeScale 0 on tweens as "frozen"; the clock uses the same factor.
    this.scene.tweens.timeScale = scale;
    this.scene.time.timeScale = scale;
  }
}
