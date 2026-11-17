/**
 * The ribbon that draws the zigzag you flew. Points (corners, plus one every SPACING px of
 * climb) live in a fixed ring buffer; one Graphics is redrawn per frame with a dark under-stroke
 * for contrast on bright gradients, a coloured body that thins and fades, and a white core.
 */
import type Phaser from 'phaser';

const CAP = 160;
const SPACING = 36;
/** World px of climb the ribbon covers. */
export const TRAIL_LEN = 920;

function lerpColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

function hue(h: number): number {
  const f = (n: number): number => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

export class Trail {
  private readonly xs = new Float32Array(CAP);
  private readonly ys = new Float32Array(CAP);
  private head = 0;
  private count = 0;
  private lastY = -Infinity;
  head0 = 0xffffff;
  tail0 = 0xfff3a0;
  rainbow = false;
  /** Width multiplier (edge combo makes the ribbon fatter). */
  boost = 1;

  constructor(readonly g: Phaser.GameObjects.Graphics) {}

  reset(x: number, y: number): void {
    this.count = 0;
    this.head = 0;
    this.lastY = -Infinity;
    this.push(x, y);
  }

  push(x: number, y: number): void {
    this.xs[this.head] = x;
    this.ys[this.head] = y;
    this.head = (this.head + 1) % CAP;
    if (this.count < CAP) this.count++;
    this.lastY = y;
  }

  /** Called every tick with the position before the move; corner = direction changed. */
  sample(x: number, y: number, corner: boolean): void {
    if (corner || y - this.lastY >= SPACING) this.push(x, y);
  }

  /** Redraw with the head at (hx, hy) (render position of the spark). */
  draw(hx: number, hy: number, alpha = 1): void {
    const g = this.g;
    g.clear();
    if (this.count === 0 || alpha <= 0) return;
    const now = performance.now();
    // Three passes: dark under-stroke, colour body, white core.
    for (let pass = 0; pass < 3; pass++) {
      let px = hx;
      let py = hy;
      let i = (this.head - 1 + CAP) % CAP;
      for (let n = 0; n < this.count; n++) {
        const x = this.xs[i]!;
        const y = this.ys[i]!;
        const t0 = (hy - py) / TRAIL_LEN;
        if (t0 >= 1) break;
        const t1 = Math.min(1, (hy - y) / TRAIL_LEN);
        const tm = (t0 + t1) * 0.5;
        const fade = (1 - tm) * alpha;
        const w = (5 + 19 * (1 - tm)) * this.boost;
        if (pass === 0) g.lineStyle(w + 12, 0x14062b, 0.45 * fade);
        else if (pass === 1) {
          const col = this.rainbow ? hue((tm * 1.4 + now / 1600) % 1) : lerpColor(this.head0, this.tail0, Math.min(1, tm * 1.6));
          g.lineStyle(w, col, 0.95 * fade);
        } else g.lineStyle(Math.max(1.5, w * 0.32), 0xffffff, 0.9 * fade * (1 - tm));
        g.lineBetween(px, -py, x, -y);
        px = x;
        py = y;
        i = (i - 1 + CAP) % CAP;
      }
    }
  }
}
