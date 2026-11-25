import { getContext, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { css } from './render/canvasArt';
import { PALETTE } from './textures';

/** Bold arcade text: white fill, thick ink outline and a drop shadow. Centre origin. */
export function bigText(scene: Phaser.Scene, x: number, y: number, text: string, size: number, color: number = PALETTE.white): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, text, {
      fontFamily: getContext(scene.game).theme.fontFamily,
      fontSize: `${size}px`,
      fontStyle: '800',
      color: css(color),
      stroke: css(PALETTE.ink),
      strokeThickness: Math.max(6, Math.round(size * 0.16)),
      align: 'center',
    })
    .setOrigin(0.5);
  t.setShadow(0, Math.round(size * 0.08), css(PALETTE.ink, 0.6), 0, true, true);
  return t;
}

/**
 * Shrink a text's font until it fits maxWidth (Turkish lines run long). Uses the font size, not
 * the scale, so pulse tweens on the scale keep working. Returns the text.
 */
export function fitText(t: Phaser.GameObjects.Text, maxWidth: number, base?: number): Phaser.GameObjects.Text {
  let size = base ?? (t.getData('baseSize') as number | undefined) ?? parseInt(String(t.style.fontSize), 10);
  t.setData('baseSize', size);
  t.setFontSize(size);
  while (t.width > maxWidth && size > 20) {
    size -= 2;
    t.setFontSize(size);
    t.setStroke(t.style.stroke, Math.max(6, Math.round(size * 0.16)));
  }
  return t;
}

/**
 * Round icon button with a label underneath. Fires on release inside (drag off cancels), with
 * the same tap sound and haptic as core buttons. `fire()` is the same path for the test hook.
 */
export class IconTile extends Phaser.GameObjects.Container {
  private readonly disc: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly caption: Phaser.GameObjects.Text | null;
  private pressed = false;
  locked = false;
  readonly radius: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    iconKey: string,
    caption: string | null,
    private readonly onTap: () => void,
    opts: { radius?: number; color?: number } = {},
  ) {
    super(scene, x, y);
    const r = opts.radius ?? 62;
    this.radius = r;
    this.disc = scene.add.graphics();
    this.disc.fillStyle(PALETTE.ink, 0.55).fillCircle(0, 8, r);
    this.disc.fillStyle(opts.color ?? PALETTE.ui, 1).fillCircle(0, 0, r);
    this.disc.lineStyle(6, 0xffffff, 0.9).strokeCircle(0, 0, r - 3);
    this.disc.fillStyle(0xffffff, 0.16).fillEllipse(0, -r * 0.42, r * 1.3, r * 0.6);
    this.icon = scene.add.image(0, 0, iconKey).setScale((r * 1.05) / 72);
    this.caption = caption ? bigText(scene, 0, r + 30, caption, 30) : null;
    this.add([this.disc, this.icon]);
    if (this.caption) this.add(this.caption);
    const hit = touchHitSize(r * 2, r * 2);
    this.setSize(hit.width, hit.height + (caption ? 40 : 0));
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 0.9, duration: 70 });
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
    scene.add.existing(this);
  }

  setIcon(key: string): this {
    this.icon.setTexture(key);
    return this;
  }

  fire(): void {
    if (!this.active || !this.visible) return;
    const ctx = getContext(this.scene.game);
    ctx.audio.play('tap');
    ctx.platform.haptic('light');
    this.scene.tweens.killTweensOf(this);
    this.setScale(1.12);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.onTap();
  }

  /** Logical-space hit test (for the hold input: presses on UI do not steer). */
  hits(x: number, y: number): boolean {
    if (!this.visible || !this.active) return false;
    let vis = this.visible && this.alpha > 0.05;
    for (let p = this.parentContainer; p; p = p.parentContainer) vis = vis && p.visible && p.alpha > 0.05;
    if (!vis) return false;
    const m = this.getWorldTransformMatrix();
    const dx = x - m.tx;
    const dy = y - m.ty;
    const r = Math.max(this.radius, 44) + 6;
    return dx * dx + dy * dy <= r * r || (this.caption !== null && Math.abs(dx) < r && dy > 0 && dy < r + 50);
  }
}

/** Anything on the title that the hold input must not treat as "press to play". */
export interface MenuHit {
  fire(): void;
  hits(x: number, y: number): boolean;
}

/**
 * Neon glass button (title menu): dark glass, a glowing tube border in `color`, presses in on
 * touch and pops on release. Fires on release inside (drag off cancels); `fire()` is the same
 * path the test hook uses. Content (icons, text) is added by the caller, centred on 0,0.
 */
export class NeonButton extends Phaser.GameObjects.Container implements MenuHit {
  protected readonly frame: Phaser.GameObjects.Graphics;
  private pressed = false;
  private glowK = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    public boxW: number,
    public boxH: number,
    protected color: number,
    private readonly onTap: () => void,
  ) {
    super(scene, x, y);
    this.frame = scene.add.graphics();
    this.add(this.frame);
    this.redraw();
    const hit = touchHitSize(boxW, boxH);
    this.setSize(hit.width, hit.height);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.killTweensOf(this);
      this.glowK = 1;
      this.redraw();
      scene.tweens.add({ targets: this, scale: 0.93, duration: 70, ease: 'Quad.easeOut' });
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.glowK = 0;
      this.redraw();
      scene.tweens.add({ targets: this, scale: 1, duration: 90 });
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.fire();
    });
    scene.add.existing(this);
  }

  /** New size or colour (e.g. a rank chip that changes with the rank). */
  reshape(w: number, h: number, color: number = this.color): this {
    this.boxW = w;
    this.boxH = h;
    this.color = color;
    const hit = touchHitSize(w, h);
    this.setSize(hit.width, hit.height);
    if (this.input) (this.input.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, hit.width, hit.height);
    this.redraw();
    return this;
  }

  protected redraw(): void {
    const w = this.boxW;
    const h = this.boxH;
    const r = Math.min(h / 2, 26);
    const g = this.frame.clear();
    g.fillStyle(PALETTE.ink, 0.5).fillRoundedRect(-w / 2, -h / 2 + 7, w, h, r);
    g.fillStyle(0x12052a, 0.86).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(this.color, 0.16 + this.glowK * 0.22).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.42, { tl: r - 4, tr: r - 4, bl: 6, br: 6 });
    // the tube: a soft wide glow, then the bright core
    g.lineStyle(12, this.color, 0.22 + this.glowK * 0.25).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(4, this.color, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    g.lineStyle(1.5, 0xffffff, 0.75 + this.glowK * 0.25).strokeRoundedRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2, r - 1);
  }

  fire(): void {
    if (!this.active || !this.visible) return;
    const ctx = getContext(this.scene.game);
    ctx.audio.play('tap');
    ctx.platform.haptic('light');
    this.scene.tweens.killTweensOf(this);
    this.glowK = 0;
    this.redraw();
    this.setScale(1.08);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.onTap();
  }

  /** Logical-space hit test (for the hold input: presses on UI do not start a run). */
  hits(x: number, y: number): boolean {
    if (!this.visible || !this.active) return false;
    let vis = this.alpha > 0.05;
    for (let p = this.parentContainer; p; p = p.parentContainer) vis = vis && p.visible && p.alpha > 0.05;
    if (!vis) return false;
    const m = this.getWorldTransformMatrix();
    const hit = touchHitSize(this.boxW, this.boxH);
    return Math.abs(x - m.tx) <= hit.width / 2 + 4 && Math.abs(y - m.ty) <= hit.height / 2 + 4;
  }
}

/** A title-menu card: icon in a coloured socket, a label and a live one-line status under it. */
export class MenuCard extends NeonButton {
  private readonly socket: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly sub: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, iconKey: string, label: string, color: number, fill: number, onTap: () => void) {
    super(scene, x, y, w, h, color, onTap);
    const ix = -w / 2 + h / 2 + 4;
    const sr = h * 0.34;
    this.socket = scene.add.graphics();
    this.socket.fillStyle(PALETTE.ink, 0.6).fillCircle(ix, 4, sr);
    this.socket.fillStyle(fill, 1).fillCircle(ix, 0, sr);
    this.socket.fillStyle(0xffffff, 0.2).fillEllipse(ix, -sr * 0.45, sr * 1.3, sr * 0.6);
    this.socket.lineStyle(3, 0xffffff, 0.9).strokeCircle(ix, 0, sr - 1.5);
    this.icon = scene.add.image(ix, 0, iconKey).setScale((sr * 1.1) / 72);
    const tx = ix + sr + 16;
    const maxW = w / 2 - tx - 14;
    this.label = fitText(bigText(scene, tx, -14, label, 34).setOrigin(0, 0.5), maxW, 34);
    this.sub = bigText(scene, tx, 20, '', 22, color).setOrigin(0, 0.5);
    this.sub.setData('maxW', maxW);
    this.add([this.socket, this.icon, this.label, this.sub]);
  }

  setIcon(key: string): this {
    this.icon.setTexture(key);
    return this;
  }

  setSub(text: string): this {
    const maxW = this.sub.getData('maxW') as number;
    fitText(this.sub.setText(text), maxW, 22);
    // A narrow card (three in a row) squeezes a long line rather than letting it run off the card.
    this.sub.setScale(this.sub.width > maxW ? maxW / this.sub.width : 1);
    return this;
  }
}
