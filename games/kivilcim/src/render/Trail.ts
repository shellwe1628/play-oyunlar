/**
 * The trail that draws the zigzag you flew. Points (corners, plus one every SPACING px of climb)
 * live in a fixed ring buffer; one Graphics is redrawn per frame. Eight behaviours, one per trail
 * skin: ribbon, sparks (thin ribbon; the scene adds falling sparks), pixels, comet, dots,
 * lightning, helix, rainbow. No per-frame allocation.
 */
import type Phaser from 'phaser';

const CAP = 160;
const SPACING = 36;
/** World px of climb the ribbon covers. */
export const TRAIL_LEN = 920;

export const TRAIL_STYLES = ['ribbon', 'sparks', 'pixels', 'comet', 'dots', 'lightning', 'helix', 'rainbow'] as const;
export type TrailStyle = (typeof TRAIL_STYLES)[number];

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
  style: TrailStyle = 'ribbon';
  /** Width multiplier (edge combo makes the ribbon fatter). */
  boost = 1;
  /** World px of climb the ribbon covers. */
  length = TRAIL_LEN;

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

  private colorAt(tm: number, now: number): number {
    if (this.rainbow || this.style === 'rainbow') return hue((tm * 1.4 + now / 1600) % 1);
    return lerpColor(this.head0, this.tail0, Math.min(1, tm * 1.6));
  }

  /** Redraw with the head at (hx, hy) (render position of the spark). */
  draw(hx: number, hy: number, alpha = 1): void {
    const g = this.g;
    g.clear();
    if (this.count === 0 || alpha <= 0) return;
    const now = performance.now();
    switch (this.style) {
      case 'pixels':
      case 'dots':
      case 'lightning':
      case 'helix':
        this.drawWalk(hx, hy, alpha, now);
        return;
      default:
        this.drawRibbon(hx, hy, alpha, now);
    }
  }

  private drawRibbon(hx: number, hy: number, alpha: number, now: number): void {
    const g = this.g;
    const comet = this.style === 'comet';
    const thin = this.style === 'sparks';
    const len = comet ? this.length * 0.45 : this.length;
    const widen = comet ? 1.9 : thin ? 0.55 : 1;
    for (let pass = 0; pass < 3; pass++) {
      let px = hx;
      let py = hy;
      let i = (this.head - 1 + CAP) % CAP;
      for (let n = 0; n < this.count; n++) {
        const x = this.xs[i]!;
        const y = this.ys[i]!;
        const t0 = (hy - py) / len;
        if (t0 >= 1) break;
        const t1 = Math.min(1, (hy - y) / len);
        const tm = (t0 + t1) * 0.5;
        const fade = (comet ? (1 - tm) * (1 - tm) : 1 - tm) * alpha;
        const w = (5 + 19 * (1 - tm)) * this.boost * widen;
        if (pass === 0) g.lineStyle(w + 12, 0x14062b, 0.45 * fade);
        else if (pass === 1) g.lineStyle(w, this.colorAt(tm, now), 0.95 * fade);
        else g.lineStyle(Math.max(1.5, w * (comet ? 0.5 : 0.32)), 0xffffff, 0.9 * fade * (1 - tm));
        g.lineBetween(px, -py, x, -y);
        px = x;
        py = y;
        i = (i - 1 + CAP) % CAP;
      }
    }
  }

  /** Styles that place marks along the path at even spacing. */
  private drawWalk(hx: number, hy: number, alpha: number, now: number): void {
    const g = this.g;
    const style = this.style;
    const step = style === 'pixels' ? 15 : style === 'dots' ? 22 : style === 'lightning' ? 26 : 10;
    const len = this.length;
    let px = hx;
    let py = hy;
    let carry = 0;
    let k = 0;
    let lx = hx;
    let ly = hy;
    let lx2 = hx;
    let ly2 = hy;
    let i = (this.head - 1 + CAP) % CAP;
    const flick = Math.floor(now / 60);
    for (let n = 0; n < this.count; n++) {
      const x = this.xs[i]!;
      const y = this.ys[i]!;
      const sx = x - px;
      const sy = y - py;
      const seg = Math.sqrt(sx * sx + sy * sy);
      let d = carry;
      while (d <= seg) {
        const f = seg > 0 ? d / seg : 0;
        const qx = px + sx * f;
        const qy = py + sy * f;
        const tm = (hy - qy) / len;
        if (tm >= 1) return;
        const fade = (1 - tm) * alpha;
        const col = this.colorAt(tm, now);
        if (style === 'pixels') {
          const s = Math.max(3, 16 * (1 - tm)) * this.boost;
          const gx = Math.round(qx / 6) * 6;
          const gy = Math.round(qy / 6) * 6;
          g.fillStyle(0x14062b, 0.4 * fade).fillRect(gx - s / 2 - 3, -gy - s / 2 - 3, s + 6, s + 6);
          g.fillStyle(col, fade).fillRect(gx - s / 2, -gy - s / 2, s, s);
        } else if (style === 'dots') {
          const r = Math.max(2, 10 * (1 - tm)) * this.boost;
          g.fillStyle(0x14062b, 0.4 * fade).fillCircle(qx, -qy, r + 3);
          g.fillStyle(col, fade).fillCircle(qx, -qy, r);
          g.fillStyle(0xffffff, 0.8 * fade).fillCircle(qx, -qy, r * 0.4);
        } else if (style === 'lightning') {
          // Jagged bolt: each joint jumps sideways, re-rolled every 60 ms.
          const h = ((k * 73856093) ^ (flick * 19349663)) >>> 0;
          const jx = qx + ((h % 1000) / 1000 - 0.5) * 22 * (1 - tm * 0.5);
          if (k > 0) {
            g.lineStyle(14 * (1 - tm) + 4, col, 0.55 * fade).lineBetween(lx, -ly, jx, -qy);
            g.lineStyle(4, 0xffffff, fade).lineBetween(lx, -ly, jx, -qy);
          }
          lx = jx;
          ly = qy;
        } else {
          // Helix: two strands twisting around the path.
          const ph = (hy - qy) / 40 - now / 160;
          const o = Math.sin(ph) * 12 * (1 - tm * 0.6);
          if (k > 0) {
            g.lineStyle(9 * (1 - tm) + 3, col, fade).lineBetween(lx, -ly, qx + o, -qy);
            g.lineStyle(9 * (1 - tm) + 3, lerpColor(col, 0xffffff, 0.5), fade).lineBetween(lx2, -ly2, qx - o, -qy);
          }
          lx = qx + o;
          ly = qy;
          lx2 = qx - o;
          ly2 = qy;
        }
        k++;
        d += step;
      }
      carry = d - seg;
      px = x;
      py = y;
      i = (i - 1 + CAP) % CAP;
    }
  }
}
