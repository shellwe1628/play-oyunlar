/**
 * Local widgets: a tappable chip with a code-drawn glyph (type chips, camera tabs, logbook tabs).
 * Same feel as core buttons: fires on release inside, press squash, release pop, tap sound,
 * hit area never under the 88 px touch minimum. Candidate for core (`iconTextButton`).
 */
import { getContext, label, touchHitSize } from '@oyun/core';
import Phaser from 'phaser';
import { PALETTE } from '../textures';

export interface ChipOptions {
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  /** Draw the glyph centred at (gx, gy) with size s. */
  glyph?: (g: Phaser.GameObjects.Graphics, gx: number, gy: number, s: number, color: number) => void;
  /** Glyph sits left of the text (default) or above it. */
  layout?: 'row' | 'column';
}

export class Chip extends Phaser.GameObjects.Container {
  private readonly face: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text | null;
  private pressed = false;
  private enabled = true;
  private activeState = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly opts: ChipOptions,
    private readonly onTap: () => void,
  ) {
    super(scene, x, y);
    this.face = scene.add.graphics();
    this.icon = scene.add.graphics();
    this.text = opts.text !== undefined ? label(scene, 0, 0, opts.text, { size: opts.fontSize ?? 34 }) : null;
    this.add(this.face).add(this.icon);
    if (this.text) this.add(this.text);
    const hit = touchHitSize(opts.width, opts.height);
    this.setSize(hit.width, hit.height);
    this.setInteractive({ useHandCursor: true });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      if (!this.enabled) return;
      this.pressed = true;
      getContext(scene.game).audio.unlock();
      scene.tweens.killTweensOf(this);
      scene.tweens.add({ targets: this, scale: 0.94, duration: 70 });
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
    this.redraw();
    scene.add.existing(this);
  }

  setOn(on: boolean): this {
    this.activeState = on;
    this.redraw();
    return this;
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.setAlpha(on ? 1 : 0.4);
    return this;
  }

  setText(text: string): this {
    this.text?.setText(text);
    this.redraw();
    return this;
  }

  fire(): void {
    if (!this.enabled || !this.active || !this.visible) return;
    this.scene.tweens.killTweensOf(this);
    this.setScale(1.06);
    this.scene.tweens.add({ targets: this, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.onTap();
  }

  private redraw(): void {
    const { width: w, height: h, glyph } = this.opts;
    const on = this.activeState;
    const fill = on ? PALETTE.lamp : PALETTE.panel;
    const ink = on ? PALETTE.night : PALETTE.text;
    this.face.clear();
    this.face.fillStyle(0x000000, 0.45).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 18);
    this.face.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.face.lineStyle(3, on ? PALETTE.lamp : PALETTE.panelLine, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 18);
    this.icon.clear();
    const col = (this.opts.layout ?? 'row') === 'column';
    const gs = col ? Math.min(h * 0.42, 52) : Math.min(h * 0.5, 44);
    if (this.text) this.text.setColor(`#${ink.toString(16).padStart(6, '0')}`);
    if (glyph && this.text) {
      if (col) {
        glyph(this.icon, 0, -h * 0.17, gs, ink);
        this.text.setPosition(0, h * 0.27);
      } else {
        const total = gs + 16 + this.text.width;
        glyph(this.icon, -total / 2 + gs / 2, 0, gs, ink);
        this.text.setPosition(-total / 2 + gs + 16 + this.text.width / 2, 0);
      }
    } else if (glyph) {
      glyph(this.icon, 0, 0, gs, ink);
    }
  }
}
