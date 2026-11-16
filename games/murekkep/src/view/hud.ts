/**
 * Match HUD widgets. They draw what they are told and redraw only when what they show changed
 * (the sim ticks at 10 Hz; frames run at 60).
 */
import { cssColor, getContext, label, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { RULES } from '../sim/rules';
import { SFX } from '../sounds';
import { PALETTE } from '../textures';
import { inkTint } from './inkmap';

type T = (key: string, p?: Record<string, number | string>) => string;

/** Stacked strip of every colony's land share; the 70 % goal is marked and labelled. */
export class ShareStrip {
  private readonly g: Phaser.GameObjects.Graphics;
  private last = '';

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    t: T,
  ) {
    this.g = scene.add.graphics().setDepth(20);
    const gx = x + w * RULES.winShare;
    label(scene, gx, y + h + 22, t('game.goalMark'), { size: 24, color: PALETTE.text }).setDepth(21);
  }

  /** shares[i] in 0..1 for colony i; the player (0) is drawn first from the left. */
  set(shares: readonly number[]): void {
    let key = '';
    for (const s of shares) key += `${Math.round(s * 400)},`;
    if (key === this.last) return;
    this.last = key;
    const { g, x, y, w, h } = this;
    g.clear();
    g.fillStyle(PALETTE.paperShadow, 0.6).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, (h + 8) / 2);
    g.fillStyle(PALETTE.paperShade, 1).fillRoundedRect(x, y, w, h, h / 2);
    let at = x;
    shares.forEach((s, i) => {
      const sw = s * w;
      if (sw <= 0.5) return;
      g.fillStyle(inkTint(i, 0.7), 1);
      if (at === x) g.fillRoundedRect(at, y, Math.max(sw, h), h, { tl: h / 2, bl: h / 2, tr: 0, br: 0 });
      else g.fillRect(at, y, sw, h);
      at += sw;
    });
    const gx = x + w * RULES.winShare;
    g.fillStyle(PALETTE.text, 1).fillRect(gx - 2, y - 8, 4, h + 16);
    g.fillTriangle(gx - 9, y - 12, gx + 9, y - 12, gx, y - 2);
  }
}

/**
 * Reserve bar: fill = reserve ÷ cap with the sweet-spot band marked; above it the count and the
 * current regrowth rate (gold while inside the band, so waiting visibly pays).
 */
export class ReserveBar {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly rate: Phaser.GameObjects.Text;
  private readonly sweet: Phaser.GameObjects.Text;
  private shown = 0;
  private drawn = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly h: number,
    private readonly t: T,
  ) {
    this.g = scene.add.graphics().setDepth(20);
    this.text = label(scene, x + 4, y - 24, '', { size: 30, color: PALETTE.text }).setOrigin(0, 0.5).setDepth(21);
    this.rate = label(scene, x + w - 4, y - 24, '', { size: 30, color: PALETTE.textDim }).setOrigin(1, 0.5).setDepth(21);
    this.sweet = label(scene, x + w * 0.5, y + h / 2, t('game.sweet'), { size: 24, color: PALETTE.sweet }).setDepth(21);
  }

  /** reserve/cap in ink, perSecond = current growth, dt = frame seconds (for easing). */
  set(reserve: number, cap: number, perSecond: number, dt: number): void {
    const target = cap > 0 ? Math.min(1, reserve / cap) : 0;
    this.shown += (target - this.shown) * Math.min(1, dt * 12);
    if (Math.abs(this.shown - target) < 0.002) this.shown = target;
    const f = this.shown;
    const inSweet = target >= 0.4 && target <= 0.6;
    const full = target >= 0.97;
    // Reserve never exceeds the cap (sim rule), so "n / cap" is always honest.
    this.text.setText(full ? this.t('game.full') : this.t('game.ink', { n: Math.floor(reserve), cap: Math.floor(cap) }));
    this.text.setColor(cssColor(full ? PALETTE.danger : PALETTE.text));
    this.rate.setText(this.t('game.rate', { n: perSecond.toFixed(1) }));
    this.rate.setColor(cssColor(inSweet ? PALETTE.sweet : PALETTE.textDim));
    if (Math.abs(f - this.drawn) < 0.001) return;
    this.drawn = f;
    const { g, x, y, w, h } = this;
    g.clear();
    g.fillStyle(PALETTE.paperShadow, 0.7).fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 14);
    g.fillStyle(PALETTE.well, 1).fillRoundedRect(x, y, w, h, 10);
    g.fillStyle(PALETTE.sweet, 0.18).fillRect(x + w * 0.4, y, w * 0.2, h);
    if (f > 0.005) g.fillStyle(full ? PALETTE.danger : PALETTE.inks[0]!, 1).fillRoundedRect(x, y, Math.max(20, w * f), h, 10);
    if (inSweet) g.fillStyle(PALETTE.shine, 0.16).fillRoundedRect(x, y, w * f, h * 0.45, 8);
    g.lineStyle(3, PALETTE.sweet, 1).strokeRect(x + w * 0.4, y - 2, w * 0.2, h + 4);
    // Peak marker (50 %) as notches above and below, so it never crosses the label.
    g.fillStyle(PALETTE.sweet, 1).fillRect(x + w * 0.5 - 1.5, y - 8, 3, 7).fillRect(x + w * 0.5 - 1.5, y + h + 1, 3, 7);
    g.fillStyle(PALETTE.text, 1).fillRect(x + w - 4, y - 6, 4, h + 12);
    this.sweet.setColor(cssColor(f >= 0.45 ? PALETTE.text : PALETTE.sweet));
  }
}

/**
 * Commit slider 10–100 % in 5 % detents. Drag anywhere on the (tall) track or tap to jump.
 * `onChange` gets the new value; `set()` moves it programmatically (test hook, match start).
 */
export class CommitSlider {
  readonly zone: Phaser.GameObjects.Zone;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly thumb: Phaser.GameObjects.Container;
  private readonly thumbText: Phaser.GameObjects.Text;
  private readonly caption: Phaser.GameObjects.Text;
  private value: number = RULES.defaultCommit;
  private dragging = false;
  private drawnKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    private readonly w: number,
    private readonly onChange: (v: number) => void,
    private readonly t: T,
  ) {
    this.g = scene.add.graphics().setDepth(20);
    const thumbG = scene.add.graphics();
    thumbG.fillStyle(PALETTE.paperShadow, 0.5).fillCircle(0, 6, 46);
    thumbG.fillStyle(PALETTE.paper, 1).fillCircle(0, 0, 46);
    thumbG.lineStyle(6, PALETTE.inks[0]!, 1).strokeCircle(0, 0, 40);
    this.thumbText = label(scene, 0, 0, '', { size: 30, color: PALETTE.inkText });
    this.thumb = scene.add.container(x, y, [thumbG, this.thumbText]).setDepth(22);
    this.caption = label(scene, x + w / 2, y - 70, '', { size: 30, color: PALETTE.text }).setDepth(21);
    const hit = touchHitSize(w + 100, 150);
    this.zone = scene.add.zone(x + w / 2, y, hit.width, hit.height).setInteractive().setDepth(23);
    this.zone.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragging = true;
      getContext(scene.game).audio.unlock();
      this.fromPointer(p.worldX);
    });
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (this.dragging && p.isDown) this.fromPointer(p.worldX);
    });
    scene.input.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.dragging) this.scene.tweens.add({ targets: this.thumb, scale: 1, duration: 120 });
      this.dragging = false;
    });
    this.redraw(0);
  }

  get current(): number {
    return this.value;
  }

  /** Thumb x for a value (for real-pointer tests). */
  xFor(v: number): number {
    return this.x + ((v - RULES.minCommit) / (RULES.maxCommit - RULES.minCommit)) * this.w;
  }

  private fromPointer(px: number): void {
    const f = Phaser.Math.Clamp((px - this.x) / this.w, 0, 1);
    const v = Math.round((RULES.minCommit + f * (RULES.maxCommit - RULES.minCommit)) / 5) * 5;
    this.thumb.setScale(1.12);
    this.set(v, true);
  }

  /** Set the value; `user` plays the detent click and notifies onChange. */
  set(v: number, user = false): void {
    const clamped = Phaser.Math.Clamp(Math.round(v), RULES.minCommit, RULES.maxCommit);
    if (clamped === this.value) return;
    this.value = clamped;
    if (user) getContext(this.scene.game).audio.playPreset(SFX.click, { jitter: 0, pitch: (clamped - 50) / 10 });
    this.onChange(clamped);
  }

  /** Redraw if the value or the ink a tap would send changed. */
  redraw(reserve: number): void {
    const ink = Math.floor((reserve * this.value) / 100);
    const key = `${this.value}|${ink}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    const { g, x, y, w } = this;
    const tx = this.xFor(this.value);
    g.clear();
    g.fillStyle(PALETTE.paperShadow, 0.7).fillRoundedRect(x - 14, y - 16, w + 28, 32, 16);
    g.fillStyle(PALETTE.well, 1).fillRoundedRect(x - 10, y - 12, w + 20, 24, 12);
    g.fillStyle(PALETTE.inks[0]!, 1).fillRoundedRect(x - 10, y - 12, tx - x + 20, 24, 12);
    for (let v = 10; v <= 100; v += 10) {
      const px = this.xFor(v);
      g.fillStyle(PALETTE.textDim, v % 50 === 0 ? 0.9 : 0.4).fillRect(px - 1.5, y + 18, 3, v % 50 === 0 ? 16 : 9);
    }
    this.thumb.x = tx;
    this.thumbText.setText(`${this.value}`);
    this.caption.setText(`${this.t('game.commit', { n: this.value })}   ${this.t('game.commitInk', { n: ink })}`);
  }
}

/** Round Blot power button with a cooldown ring. */
export class BlotButton {
  readonly container: Phaser.GameObjects.Container;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Text;
  private pressed = false;
  private lastKey = '';

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly radius: number,
    private readonly onTap: () => void,
    caption: string,
  ) {
    this.face = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.icon = scene.add.image(0, -10, 'drop-big').setTint(PALETTE.inks[0]).setScale(0.9);
    const text = label(scene, 0, radius * 0.5, caption, { size: 28, color: PALETTE.inkText });
    this.badge = label(scene, radius * 0.72, -radius * 0.72, '+', { size: 34, color: PALETTE.text });
    this.container = scene.add.container(x, y, [this.face, this.ring, this.icon, text, this.badge]).setDepth(22);
    const hit = touchHitSize(radius * 2, radius * 2);
    this.container.setSize(hit.width, hit.height).setInteractive({ useHandCursor: true });
    this.container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.add({ targets: this.container, scale: 0.92, duration: 70 });
    });
    this.container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (this.pressed) scene.tweens.add({ targets: this.container, scale: 1, duration: 90 });
      this.pressed = false;
    });
    this.container.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.fire();
    });
  }

  fire(): void {
    this.scene.tweens.killTweensOf(this.container);
    this.container.setScale(1.1);
    this.scene.tweens.add({ targets: this.container, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.onTap();
  }

  /** cooldown 0..1 left (0 = ready); armed = waiting for a map tap; ad = rewarded charge offered. */
  set(cooldown: number, armed: boolean, ad: boolean): void {
    const key = `${Math.round(cooldown * 60)}|${armed}|${ad}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const r = this.radius;
    const ready = cooldown <= 0;
    this.face.clear();
    this.face.fillStyle(PALETTE.paperShadow, 0.55).fillCircle(0, 6, r);
    this.face.fillStyle(armed ? PALETTE.sweet : PALETTE.paper, ready ? 1 : 0.55).fillCircle(0, 0, r);
    this.ring.clear();
    if (!ready) {
      this.ring.lineStyle(8, PALETTE.inks[0]!, 0.9);
      this.ring.beginPath();
      this.ring.arc(0, 0, r - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - cooldown));
      this.ring.strokePath();
    } else {
      this.ring.lineStyle(5, armed ? PALETTE.inks[0]! : PALETTE.sweet, 1).strokeCircle(0, 0, r - 4);
    }
    this.icon.setAlpha(ready ? 1 : 0.45);
    this.badge.setVisible(ad && !ready);
  }
}
