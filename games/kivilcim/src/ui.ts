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
