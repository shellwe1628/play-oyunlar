import Phaser from 'phaser';
import type { SfxName } from '../audio/presets';
import { getContext } from '../context';
import type { HapticKind } from '../platform';
import { MIN_TOUCH, touchHitSize } from './layout';
import { cssColor, type Theme } from './theme';

const theme = (scene: Phaser.Scene): Theme => getContext(scene.game).theme;

export interface TextOptions {
  size?: number;
  color?: number;
  /** Max line width before wrapping, px. */
  wrap?: number;
  align?: 'left' | 'center' | 'right';
}

/** Themed text, centred origin. Use for every label so the font stays consistent. */
export function label(scene: Phaser.Scene, x: number, y: number, text: string, opts: TextOptions = {}): Phaser.GameObjects.Text {
  const th = theme(scene);
  return scene.add
    .text(x, y, text, {
      fontFamily: th.fontFamily,
      fontSize: `${opts.size ?? 40}px`,
      fontStyle: '800',
      color: cssColor(opts.color ?? th.colors.text),
      align: opts.align ?? 'center',
      ...(opts.wrap ? { wordWrap: { width: opts.wrap, useAdvancedWrap: true } } : {}),
    })
    .setOrigin(0.5);
}

export interface ButtonOptions {
  /** Visual size; the hit area is never smaller than 88×88. Defaults 380×112. */
  width?: number;
  height?: number;
  variant?: 'primary' | 'secondary';
  fontSize?: number;
  /** Sound on tap (default 'tap'); null for none. */
  sfx?: SfxName | null;
  /** Haptic on tap (default 'light'); null for none. */
  haptic?: HapticKind | null;
  /** Phaser key name that also triggers the button, e.g. 'ENTER', 'SPACE', 'ESC'. */
  hotkey?: string;
}

/**
 * Rounded button with shadow, press squash and release pop. Fires on release inside the button
 * (drag off to cancel). The callback is your real handler; expose the same one in testActions().
 */
export class Button extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private enabled = true;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    labelText: string,
    private readonly onTap: () => void,
    private readonly opts: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const th = theme(scene);
    const w = opts.width ?? 380;
    const h = Math.max(opts.height ?? 112, MIN_TOUCH);
    const primary = (opts.variant ?? 'primary') === 'primary';
    const fill = primary ? th.colors.primary : th.colors.secondary;
    const textColor = primary ? th.colors.primaryText : th.colors.secondaryText;
    const r = Math.min(th.radius, h / 2);

    this.face = scene.add.graphics();
    this.face.fillStyle(th.colors.shadow, 0.55).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, r);
    this.face.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    this.face.fillStyle(0xffffff, 0.18).fillRoundedRect(-w / 2 + 10, -h / 2 + 8, w - 20, h * 0.34, r * 0.6);
    this.text = label(scene, 0, -2, labelText, { size: opts.fontSize ?? 44, color: textColor });
    this.add([this.face, this.text]);

    const hit = touchHitSize(w, h);
    this.setSize(hit.width, hit.height);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.enabled) return;
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 0.94, duration: 70, ease: 'Quad.easeOut' });
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (!this.pressed) return;
      this.pressed = false;
      scene.tweens.add({ targets: this, scale: 1, duration: 90 });
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.fire();
    });
    if (opts.hotkey && scene.input.keyboard) {
      const event = `keydown-${opts.hotkey}`;
      const handler = (): void => this.fire();
      scene.input.keyboard.on(event, handler);
      this.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.keyboard?.off(event, handler));
    }
    scene.add.existing(this);
  }

  setLabel(text: string): this {
    this.text.setText(text);
    return this;
  }

  setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.setAlpha(enabled ? 1 : 0.45);
    return this;
  }

  /** Same path as a real tap: feedback, then the callback. */
  fire(): void {
    if (!this.enabled || !this.active) return;
    const ctx = getContext(this.scene.game);
    if (this.opts.sfx !== null) ctx.audio.play(this.opts.sfx ?? 'tap');
    if (this.opts.haptic !== null) ctx.platform.haptic(this.opts.haptic ?? 'light');
    this.scene.tweens.killTweensOf(this);
    this.setScale(1.08);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.onTap();
  }
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onTap: () => void,
  opts: ButtonOptions = {},
): Button {
  return new Button(scene, x, y, text, onTap, opts);
}

export type IconName = 'pause' | 'play' | 'sound-on' | 'sound-off' | 'home' | 'replay' | 'close';

function drawIcon(g: Phaser.GameObjects.Graphics, icon: IconName, color: number, s: number): void {
  g.clear();
  g.fillStyle(color, 1);
  g.lineStyle(s * 0.12, color, 1);
  const u = s / 2;
  switch (icon) {
    case 'pause':
      g.fillRoundedRect(-u * 0.5, -u * 0.55, u * 0.32, u * 1.1, 4).fillRoundedRect(u * 0.18, -u * 0.55, u * 0.32, u * 1.1, 4);
      break;
    case 'play':
      g.fillTriangle(-u * 0.38, -u * 0.55, -u * 0.38, u * 0.55, u * 0.55, 0);
      break;
    case 'sound-on':
    case 'sound-off':
      g.fillRect(-u * 0.6, -u * 0.22, u * 0.3, u * 0.44);
      g.fillTriangle(-u * 0.32, -u * 0.22, -u * 0.32, u * 0.22, u * 0.05, -u * 0.55);
      g.fillTriangle(-u * 0.32, u * 0.22, u * 0.05, u * 0.55, u * 0.05, -u * 0.55);
      if (icon === 'sound-on') {
        g.beginPath();
        g.arc(u * 0.1, 0, u * 0.32, -0.9, 0.9);
        g.strokePath();
        g.beginPath();
        g.arc(u * 0.1, 0, u * 0.55, -0.9, 0.9);
        g.strokePath();
      } else {
        g.lineBetween(u * 0.2, -u * 0.25, u * 0.65, u * 0.25).lineBetween(u * 0.2, u * 0.25, u * 0.65, -u * 0.25);
      }
      break;
    case 'home':
      g.fillTriangle(-u * 0.6, -u * 0.02, u * 0.6, -u * 0.02, 0, -u * 0.6);
      g.fillRect(-u * 0.42, -u * 0.05, u * 0.84, u * 0.6);
      break;
    case 'replay':
      g.beginPath();
      g.arc(0, 0, u * 0.45, -2.6, 2.2);
      g.strokePath();
      g.fillTriangle(-u * 0.62, -u * 0.5, -u * 0.12, -u * 0.42, -u * 0.5, -u * 0.05);
      break;
    case 'close':
      g.lineBetween(-u * 0.4, -u * 0.4, u * 0.4, u * 0.4).lineBetween(-u * 0.4, u * 0.4, u * 0.4, -u * 0.4);
      break;
  }
}

/** Round icon button (visual 96 px, hit area ≥ 88). */
export class IconButton extends Phaser.GameObjects.Container {
  private readonly glyph: Phaser.GameObjects.Graphics;
  private pressed = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private icon: IconName,
    private readonly onTap: () => void,
    private readonly size = 96,
  ) {
    super(scene, x, y);
    const th = theme(scene);
    const bg = scene.add.graphics();
    bg.fillStyle(th.colors.shadow, 0.55).fillCircle(0, 6, size / 2);
    bg.fillStyle(th.colors.secondary, 1).fillCircle(0, 0, size / 2);
    this.glyph = scene.add.graphics();
    drawIcon(this.glyph, icon, th.colors.secondaryText, size * 0.6);
    this.add([bg, this.glyph]);
    const hit = touchHitSize(size, size);
    this.setSize(hit.width, hit.height);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.add({ targets: this, scale: 0.9, duration: 70 });
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (this.pressed) scene.tweens.add({ targets: this, scale: 1, duration: 90 });
      this.pressed = false;
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.fire();
    });
    scene.add.existing(this);
  }

  setIcon(icon: IconName): this {
    this.icon = icon;
    drawIcon(this.glyph, icon, theme(this.scene).colors.secondaryText, this.size * 0.6);
    return this;
  }

  get iconName(): IconName {
    return this.icon;
  }

  fire(): void {
    if (!this.active) return;
    const ctx = getContext(this.scene.game);
    ctx.audio.play('tap');
    ctx.platform.haptic('light');
    this.scene.tweens.killTweensOf(this);
    this.setScale(1.12);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 180, ease: 'Back.easeOut' });
    this.onTap();
  }
}

export function iconButton(scene: Phaser.Scene, x: number, y: number, icon: IconName, onTap: () => void, size?: number): IconButton {
  return new IconButton(scene, x, y, icon, onTap, size);
}

/** Speaker icon that toggles and persists mute. */
export function muteButton(scene: Phaser.Scene, x: number, y: number): IconButton {
  const audio = getContext(scene.game).audio;
  const btn: IconButton = iconButton(scene, x, y, audio.muted ? 'sound-off' : 'sound-on', () => {
    const muted = audio.toggleMute();
    btn.setIcon(muted ? 'sound-off' : 'sound-on');
    if (!muted) audio.play('pop');
  });
  return btn;
}

export interface PanelOptions {
  color?: number;
  alpha?: number;
  radius?: number;
}

/** Rounded card with a drop shadow, centred on (x, y). Add children with panel.add(). */
export function panel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts: PanelOptions = {}): Phaser.GameObjects.Container {
  const th = theme(scene);
  const r = opts.radius ?? th.radius;
  const g = scene.add.graphics();
  g.fillStyle(th.colors.shadow, 0.5).fillRoundedRect(-width / 2, -height / 2 + 12, width, height, r);
  g.fillStyle(opts.color ?? th.colors.surface, opts.alpha ?? 1).fillRoundedRect(-width / 2, -height / 2, width, height, r);
  return scene.add.container(x, y, [g]);
}

export interface ProgressBarOptions {
  color?: number;
  background?: number;
  /** Start value 0..1. */
  value?: number;
}

/** Horizontal bar, centred on (x, y). setValue(v) with v in 0..1. */
export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Graphics;
  private current: number;
  private shown: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly barWidth: number,
    private readonly barHeight: number,
    private readonly opts: ProgressBarOptions = {},
  ) {
    super(scene, x, y);
    const th = theme(scene);
    const bg = scene.add.graphics();
    bg.fillStyle(opts.background ?? th.colors.shadow, 0.7).fillRoundedRect(-barWidth / 2, -barHeight / 2, barWidth, barHeight, barHeight / 2);
    this.fill = scene.add.graphics();
    this.add([bg, this.fill]);
    this.current = Math.min(1, Math.max(0, opts.value ?? 1));
    this.shown = this.current;
    this.redraw();
    scene.add.existing(this);
  }

  get value(): number {
    return this.current;
  }

  /** Set 0..1. animate=true eases toward the value over ~200 ms. */
  setValue(value: number, animate = false): this {
    this.current = Math.min(1, Math.max(0, value));
    if (!animate) {
      this.shown = this.current;
      this.redraw();
      return this;
    }
    this.scene.tweens.addCounter({
      from: this.shown,
      to: this.current,
      duration: 200,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        this.shown = tw.getValue() ?? this.current;
        this.redraw();
      },
    });
    return this;
  }

  private redraw(): void {
    const th = theme(this.scene);
    const w = this.barWidth;
    const h = this.barHeight;
    const inner = Math.max(0, (w - 8) * this.shown);
    this.fill.clear();
    if (inner <= 0) return;
    this.fill.fillStyle(this.opts.color ?? th.colors.accent, 1).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, Math.max(inner, h - 8), h - 8, (h - 8) / 2);
  }
}

export function progressBar(scene: Phaser.Scene, x: number, y: number, width: number, height: number, opts?: ProgressBarOptions): ProgressBar {
  return new ProgressBar(scene, x, y, width, height, opts);
}

export interface ToastOptions {
  /** ms on screen. Default 1600. */
  duration?: number;
  color?: number;
}

const toasts = new WeakMap<Phaser.Scene, Phaser.GameObjects.Container>();

/** Short message that slides in below the top safe edge. A new toast replaces the old one. */
export function toast(scene: Phaser.Scene, text: string, opts: ToastOptions = {}): Phaser.GameObjects.Container {
  const ctx = getContext(scene.game);
  toasts.get(scene)?.destroy();
  const { width } = ctx.info;
  const top = ctx.safeArea().top + 90;
  const t = label(scene, 0, 0, text, { size: 36, color: ctx.theme.colors.text, wrap: width - 160 });
  const w = Math.min(width - 80, t.width + 80);
  const h = Math.max(MIN_TOUCH * 0.9, t.height + 40);
  const box = panel(scene, width / 2, top - 160, w, h, { color: opts.color ?? ctx.theme.colors.surface });
  box.add(t).setDepth(2000);
  toasts.set(scene, box);
  scene.tweens.add({ targets: box, y: top, duration: 260, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: box,
    alpha: 0,
    y: top - 40,
    delay: opts.duration ?? 1600,
    duration: 240,
    onComplete: () => box.destroy(),
  });
  return box;
}
