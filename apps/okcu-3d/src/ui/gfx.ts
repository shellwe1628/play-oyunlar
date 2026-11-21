/**
 * The subset of Phaser's Graphics API that the 2D game's code-drawn art uses, on a 2D canvas.
 * It lets this app call the game's OWN drawing functions (card icons, the wind sock, the heart,
 * the coin texture recipe) instead of redrawing them, and keeps the ported HUD code line-for-line
 * comparable with GameScene.
 */
import type { drawCardIcon } from '@okcu/scenes/icons';

/** The Phaser Graphics type, taken from the game's own signature (no phaser import here). */
export type PhaserG = Parameters<typeof drawCardIcon>[0];

export function rgba(color: number, alpha = 1): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.max(0, alpha)})`;
}

export function css(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export class Gfx {
  private fill = '#000';
  private stroke = '#000';
  private lw = 1;

  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** For the game's drawing functions, which are typed against Phaser. */
  get phaser(): PhaserG {
    return this as unknown as PhaserG;
  }

  fillStyle(color: number, alpha = 1): this {
    this.fill = rgba(color, alpha);
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lw = width;
    this.stroke = rgba(color, alpha);
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.ctx.fillStyle = this.fill;
    this.ctx.fillRect(x, y, w, h);
    return this;
  }

  private roundPath(x: number, y: number, w: number, h: number, r: number): void {
    const c = this.ctx;
    const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r = 20): this {
    if (w <= 0 || h <= 0) return this;
    this.roundPath(x, y, w, h, r);
    this.ctx.fillStyle = this.fill;
    this.ctx.fill();
    return this;
  }

  strokeRoundedRect(x: number, y: number, w: number, h: number, r = 20): this {
    this.roundPath(x, y, w, h, r);
    this.applyStroke();
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    c.fillStyle = this.fill;
    c.fill();
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    this.applyStroke();
    return this;
  }

  /** Phaser's ellipse takes the full width and height. */
  fillEllipse(x: number, y: number, w: number, h: number): this {
    const c = this.ctx;
    c.beginPath();
    c.ellipse(x, y, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
    c.fillStyle = this.fill;
    c.fill();
    return this;
  }

  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): this {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.lineTo(x2, y2);
    c.closePath();
    c.fillStyle = this.fill;
    c.fill();
    return this;
  }

  /** A filled polygon through plain {x, y} points (Phaser's fillPoints; the game passes plain objects). */
  fillPoints(points: readonly { x: number; y: number }[]): this {
    const c = this.ctx;
    const first = points[0];
    if (!first) return this;
    c.beginPath();
    c.moveTo(first.x, first.y);
    for (let i = 1; i < points.length; i++) c.lineTo(points[i]!.x, points[i]!.y);
    c.closePath();
    c.fillStyle = this.fill;
    c.fill();
    return this;
  }

  lineBetween(x0: number, y0: number, x1: number, y1: number): this {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    this.applyStroke();
    return this;
  }

  beginPath(): this {
    this.ctx.beginPath();
    return this;
  }

  arc(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    this.ctx.arc(x, y, Math.max(0, r), start, end, anticlockwise);
    return this;
  }

  /** A pie slice: begins its own path, like Phaser. */
  slice(x: number, y: number, r: number, start: number, end: number, anticlockwise = false): this {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, Math.max(0, r), start, end, anticlockwise);
    c.closePath();
    return this;
  }

  strokePath(): this {
    this.applyStroke();
    return this;
  }

  fillPath(): this {
    this.ctx.fillStyle = this.fill;
    this.ctx.fill();
    return this;
  }

  private applyStroke(): void {
    const c = this.ctx;
    c.strokeStyle = this.stroke;
    c.lineWidth = this.lw;
    c.stroke();
  }

  /** Draw with the origin moved to (x, y) and scaled (what a Phaser game object's position and scale do). */
  at(x: number, y: number, scaleX: number, scaleY: number, rotation: number, draw: () => void): void {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    if (rotation !== 0) c.rotate(rotation);
    c.scale(scaleX, scaleY);
    draw();
    c.restore();
  }
}
