/**
 * Short motion trails behind flying arrows, coloured by the arrow's card (fire embers,
 * piercing glow, bouncy dots, heavy smoke). One ring buffer per arrow slot in typed arrays:
 * nothing is allocated while playing.
 */
import type Phaser from 'phaser';
import type { Arrow } from '../sim/world';
import { PALETTE } from '../textures';

const LEN = 8;

export class Trails {
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private readonly count: Uint8Array;
  private readonly head: Uint8Array;
  private readonly seq: Int32Array;

  constructor(private readonly slots: number) {
    this.xs = new Float32Array(slots * LEN);
    this.ys = new Float32Array(slots * LEN);
    this.count = new Uint8Array(slots);
    this.head = new Uint8Array(slots);
    this.seq = new Int32Array(slots).fill(-1);
  }

  /** Record this frame's tip for every flying arrow; forget arrows that landed or were recycled. */
  update(arrows: readonly Arrow[]): void {
    for (let i = 0; i < arrows.length && i < this.slots; i++) {
      const a = arrows[i]!;
      if (!a.active || a.state !== 0 || a.kind === 'bomb') {
        this.count[i] = 0;
        continue;
      }
      if (this.seq[i] !== a.seq) {
        this.seq[i] = a.seq;
        this.count[i] = 0;
        this.head[i] = 0;
      }
      const h = (this.head[i]! + 1) % LEN;
      this.head[i] = h;
      this.xs[i * LEN + h] = a.x;
      this.ys[i * LEN + h] = a.y;
      if (this.count[i]! < LEN) this.count[i] = this.count[i]! + 1;
    }
  }

  draw(g: Phaser.GameObjects.Graphics, arrows: readonly Arrow[], time: number): void {
    for (let i = 0; i < arrows.length && i < this.slots; i++) {
      const n = this.count[i]!;
      if (n < 2) continue;
      const a = arrows[i]!;
      const mine = a.owner === 'player';
      let color: number = PALETTE.white;
      let width = 5;
      let alpha = mine ? 0.45 : 0.3;
      if (mine && a.fire) {
        color = PALETTE.fire;
        width = 8;
        alpha = 0.6;
      } else if (mine && a.pierce > 0) {
        color = PALETTE.bubble;
        width = 7;
        alpha = 0.6;
      } else if (mine && a.bounces > 0) {
        color = PALETTE.leaf;
      } else if (mine && a.impulseMul > 1.01) {
        color = PALETTE.smoke;
        width = 9;
      }
      const h = this.head[i]!;
      let px = this.xs[i * LEN + h]!;
      let py = this.ys[i * LEN + h]!;
      for (let k = 1; k < n; k++) {
        const j = (h - k + LEN) % LEN;
        const x = this.xs[i * LEN + j]!;
        const y = this.ys[i * LEN + j]!;
        const f = 1 - k / n;
        if (mine && a.bounces > 0) {
          if (k % 2 === 0) g.fillStyle(color, alpha * f).fillCircle(x, y, 3 + f * 3);
        } else {
          g.lineStyle(width * f + 1, color, alpha * f).lineBetween(px, py, x, y);
        }
        if (mine && a.fire && k % 2 === 1) g.fillStyle(PALETTE.fireCore, f).fillCircle(x + Math.sin(time * 30 + k) * 4, y + Math.cos(time * 27 + k) * 4, 2 + f * 2);
        px = x;
        py = y;
      }
    }
  }
}
