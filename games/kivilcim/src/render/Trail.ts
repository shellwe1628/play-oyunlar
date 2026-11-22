/**
 * The trail that draws the zigzag you flew. Points (corners, plus one every SPACING px of climb)
 * live in a fixed ring buffer; one Graphics is redrawn per frame. One behaviour per trail style
 * (src/sim/skins.ts): ribbons, walks (pixels, dots, bolts, helix), and the collection's animated
 * styles up to layered top-tier ones. Cosmetic only, always drawn behind the spark (the part of
 * the shaft already flown), so it never covers the path ahead. No per-frame allocation.
 */
import type Phaser from 'phaser';
import type { TrailStyleId } from '../sim/skins';

const CAP = 160;
const SPACING = 36;
/** World px of climb the ribbon covers. */
export const TRAIL_LEN = 920;

export type TrailStyle = TrailStyleId;

function lerpColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export function hue(h: number): number {
  const f = (n: number): number => {
    const k = (n + h * 6) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) | (f(3) << 8) | f(1);
}

/** Small integer hash → [0, 1). */
const hash = (a: number, b: number): number => ((((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000) / 1000;

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
  /** Width multiplier (edge combo and flow make the ribbon fatter). */
  boost = 1;
  /** World px of climb the ribbon covers. */
  length = TRAIL_LEN;
  /** Beat pulse 0..1 (music-reactive styles). */
  pulse = 0;
  /** Rarity of the worn trail (index into skins.ts TIERS): epic and up light a flare at the head. */
  tier = 0;
  /** Draw the head flare (off while the spark is shattered). */
  flare = true;

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
    if (this.rainbow || this.style === 'rainbow' || this.style === 'prism') return hue((tm * 1.4 + now / 1600) % 1);
    if (this.style === 'cycle' || this.style === 'nova') {
      // An animated gradient that flows down the trail.
      const k = 0.5 + 0.5 * Math.sin(tm * 9 - now / 160);
      return lerpColor(this.head0, this.tail0, k);
    }
    if (this.style === 'aurora') return lerpColor(this.head0, this.tail0, 0.5 + 0.5 * Math.sin(tm * 5 + now / 500));
    return lerpColor(this.head0, this.tail0, Math.min(1, tm * 1.6));
  }

  /** Redraw with the head at (hx, hy) (render position of the spark). */
  draw(hx: number, hy: number, alpha = 1): void {
    const g = this.g;
    g.clear();
    if (this.count === 0 || alpha <= 0) return;
    const now = performance.now();
    this.drawStyle(hx, hy, alpha, now);
    if (this.flare && this.tier >= 2) this.drawFlare(hx, hy, alpha, now);
  }

  /**
   * The rarer the trail, the more its head shows it: epic = a twinkling four-point flare behind
   * the spark; legendary and earned = a second, turning flare and two orbiting motes; mythic = a
   * beat-pulsed ring and three motes. Kept within ~45 px of the spark, behind it.
   */
  private drawFlare(hx: number, hy: number, alpha: number, now: number): void {
    const g = this.g;
    const y = -hy;
    const rank = this.tier >= 5 ? 3 : this.tier;
    const tw = 0.75 + 0.25 * Math.sin(now / 90);
    const len = (36 + 8 * this.pulse) * tw;
    const rainbow = this.style === 'prism' || this.style === 'rainbow';
    const col = rainbow ? hue((now / 900) % 1) : this.tail0;
    g.lineStyle(9, col, 0.35 * alpha).lineBetween(hx - len, y, hx + len, y).lineBetween(hx, y - len, hx, y + len);
    g.lineStyle(3, 0xffffff, 0.9 * alpha).lineBetween(hx - len, y, hx + len, y).lineBetween(hx, y - len, hx, y + len);
    if (rank < 3) return;
    const a = now / 520;
    const d = len * 0.62;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    g.lineStyle(2, this.head0, 0.7 * alpha).lineBetween(hx - cx, y - cy, hx + cx, y + cy).lineBetween(hx + cy, y - cx, hx - cy, y + cx);
    const motes = rank >= 4 ? 3 : 2;
    const orbit = 36 + 4 * this.pulse;
    for (let k = 0; k < motes; k++) {
      const o = -now / 260 + (k * Math.PI * 2) / motes;
      const mx = hx + Math.cos(o) * orbit;
      const my = y + Math.sin(o) * orbit * 0.8;
      g.fillStyle(rainbow ? hue((now / 900 + k / motes) % 1) : col, 0.45 * alpha).fillCircle(mx, my, 5);
      g.fillStyle(0xffffff, 0.95 * alpha).fillCircle(mx, my, 2.2);
    }
    if (rank >= 4) g.lineStyle(2, col, (0.35 + 0.4 * this.pulse) * alpha).strokeCircle(hx, y, orbit);
  }

  private drawStyle(hx: number, hy: number, alpha: number, now: number): void {
    switch (this.style) {
      case 'pixels':
      case 'dots':
      case 'lightning':
      case 'helix':
      case 'fork':
      case 'bars':
        this.drawWalk(hx, hy, alpha, now, this.style);
        return;
      case 'aurora':
        for (let k = 0; k < 3; k++) this.drawRibbon(hx, hy, alpha * (k === 1 ? 0.9 : 0.55), now, 'aurora', k - 1);
        return;
      case 'glitter':
        this.drawRibbon(hx, hy, alpha, now, 'glitter', 0);
        this.drawWalk(hx, hy, alpha, now, 'glint');
        return;
      case 'galaxy':
        this.drawRibbon(hx, hy, alpha * 0.85, now, 'galaxy', 0);
        this.drawWalk(hx, hy, alpha, now, 'dust');
        return;
      case 'flame':
        this.drawRibbon(hx, hy, alpha, now, 'flame', 0);
        this.drawWalk(hx, hy, alpha, now, 'tongue');
        return;
      case 'prism':
        // Layered: a wide rainbow aura, rainbow ribbon, a neon core, glitter.
        this.drawRibbon(hx, hy, alpha * 0.5, now, 'aura', 0);
        this.drawRibbon(hx, hy, alpha, now, 'rainbow', 0);
        this.drawRibbon(hx, hy, alpha * 0.9, now, 'neon', 0);
        this.drawWalk(hx, hy, alpha, now, 'glint');
        return;
      case 'nova':
        // Layered: a wide pulsing aura, flame, a cycling core, galaxy dust.
        this.drawRibbon(hx, hy, alpha * 0.5, now, 'aura', 0);
        this.drawRibbon(hx, hy, alpha, now, 'flame', 0);
        this.drawWalk(hx, hy, alpha, now, 'tongue');
        this.drawRibbon(hx, hy, alpha * 0.8, now, 'cycle', 0);
        this.drawWalk(hx, hy, alpha, now, 'dust');
        return;
      default:
        this.drawRibbon(hx, hy, alpha, now, this.style, 0);
    }
  }

  private drawRibbon(hx: number, hy: number, alpha: number, now: number, kind: string, lane: number): void {
    const g = this.g;
    const comet = kind === 'comet';
    const thin = kind === 'sparks' || kind === 'glitter';
    const neon = kind === 'neon';
    const flame = kind === 'flame';
    const aurora = kind === 'aurora';
    const galaxy = kind === 'galaxy';
    const aura = kind === 'aura';
    const len = comet ? this.length * 0.45 : flame ? this.length * 0.7 : this.length;
    const widen = comet ? 1.9 : thin ? 0.55 : neon ? 0.8 : aurora ? 1.5 : flame ? 1.25 : aura ? 3.2 * (0.85 + 0.3 * this.pulse) : 1;
    const passes = neon ? 4 : aura ? 1 : 3;
    for (let pass = 0; pass < passes; pass++) {
      let px = hx;
      let py = hy;
      let i = (this.head - 1 + CAP) % CAP;
      for (let n = 0; n < this.count; n++) {
        let x = this.xs[i]!;
        const y = this.ys[i]!;
        const t0 = (hy - py) / len;
        if (t0 >= 1) break;
        const t1 = Math.min(1, (hy - y) / len);
        const tm = (t0 + t1) * 0.5;
        if (aurora) x += lane * 22 * Math.sin(tm * 7 + now / 300 + lane);
        const fade = (comet || flame ? (1 - tm) * (1 - tm) : 1 - tm) * alpha;
        let w = (5 + 19 * (1 - tm)) * this.boost * widen;
        if (flame) w *= 0.8 + 0.4 * hash(n, Math.floor(now / 50));
        if (aura) g.lineStyle(w, this.colorAt(tm, now), 0.22 * fade);
        else if (pass === 0) {
          if (neon) g.lineStyle(w + 26, this.tail0, 0.16 * fade);
          else if (aurora) g.lineStyle(w + 18, this.colorAt(tm, now), 0.12 * fade);
          else g.lineStyle(w + 12, galaxy ? 0x0a0418 : 0x14062b, 0.45 * fade);
        } else if (pass === 1) {
          const col = flame ? lerpColor(0xfff2a8, this.tail0, Math.min(1, tm * 2.2)) : neon ? this.tail0 : this.colorAt(tm, now);
          g.lineStyle(neon ? w + 8 : w, col, (neon ? 0.45 : aurora ? 0.5 : 0.95) * fade);
        } else if (pass === 2) {
          const core = neon ? Math.max(3, w * 0.45) : Math.max(1.5, w * (comet ? 0.5 : 0.32));
          const flick = neon ? 0.85 + 0.15 * Math.sin(now / 23 + n) : 1;
          g.lineStyle(core, neon ? lerpColor(this.tail0, 0xffffff, 0.6) : 0xffffff, 0.9 * fade * (1 - tm) * flick);
        } else g.lineStyle(Math.max(1.5, w * 0.18), 0xffffff, fade);
        g.lineBetween(px, -py, x, -y);
        px = x;
        py = y;
        i = (i - 1 + CAP) % CAP;
      }
    }
  }

  /** Styles that place marks along the path at even spacing. */
  private drawWalk(hx: number, hy: number, alpha: number, now: number, style: string): void {
    const g = this.g;
    const step =
      style === 'pixels' ? 15 : style === 'dots' ? 22 : style === 'lightning' || style === 'fork' ? 26 : style === 'bars' ? 18 : style === 'glint' ? 30 : style === 'dust' ? 9 : style === 'tongue' ? 16 : 10;
    const len = style === 'tongue' ? this.length * 0.6 : this.length;
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
      const nx = seg > 0 ? -sy / seg : 1;
      const ny = seg > 0 ? sx / seg : 0;
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
        } else if (style === 'lightning' || style === 'fork') {
          // Jagged bolt: each joint jumps sideways, re-rolled every 60 ms; "fork" also branches.
          const h = hash(k, flick);
          const jx = qx + (h - 0.5) * 22 * (1 - tm * 0.5);
          if (k > 0) {
            g.lineStyle(14 * (1 - tm) + 4, col, 0.55 * fade).lineBetween(lx, -ly, jx, -qy);
            g.lineStyle(4, 0xffffff, fade).lineBetween(lx, -ly, jx, -qy);
            if (style === 'fork' && hash(k + 7, flick) > 0.55) {
              const side = hash(k + 3, flick) > 0.5 ? 1 : -1;
              const bx = jx + side * (26 + 30 * hash(k, flick + 1)) * (1 - tm * 0.6);
              const by = qy - 18 - 20 * hash(k + 1, flick);
              g.lineStyle(7 * (1 - tm) + 2, col, 0.5 * fade).lineBetween(jx, -qy, bx, -by);
              g.lineStyle(2, 0xffffff, 0.9 * fade).lineBetween(jx, -qy, bx, -by);
            }
          }
          lx = jx;
          ly = qy;
        } else if (style === 'bars') {
          // Equalizer: bars across the path, their height following the music.
          const amp = (0.35 + 0.65 * Math.abs(Math.sin(k * 1.7 + now / 110))) * (0.6 + 0.8 * this.pulse);
          const hl = (8 + 26 * amp) * (1 - tm * 0.6) * this.boost;
          const c2 = lerpColor(this.head0, this.tail0, Math.min(1, amp));
          g.lineStyle(9 * (1 - tm) + 3, c2, fade).lineBetween(qx - nx * hl, -(qy - ny * hl), qx + nx * hl, -(qy + ny * hl));
          g.fillStyle(0xffffff, 0.8 * fade).fillCircle(qx + nx * hl, -(qy + ny * hl), 3);
        } else if (style === 'glint') {
          // Twinkling four-point sparkles along the path.
          const tw = Math.max(0, Math.sin(now / 120 + k * 2.3));
          if (tw > 0.2) {
            const off = (hash(k, 3) - 0.5) * 30;
            const cx = qx + nx * off;
            const cy = qy + ny * off;
            const s = (8 + 14 * tw) * (1 - tm * 0.5) * this.boost;
            g.lineStyle(3, 0xffffff, tw * fade).lineBetween(cx - s, -cy, cx + s, -cy).lineBetween(cx, -cy - s, cx, -cy + s);
            g.fillStyle(this.head0, tw * fade).fillCircle(cx, -cy, 3);
          }
        } else if (style === 'dust') {
          // Galaxy dust: specks orbiting the path, twinkling.
          const a = now / 700 + k * 1.9;
          const rr = (10 + 34 * hash(k, 11)) * (0.6 + tm) * this.boost;
          const cx = qx + Math.cos(a) * rr;
          const cy = qy + Math.sin(a) * rr * 0.6;
          const tw = 0.5 + 0.5 * Math.sin(now / 90 + k);
          g.fillStyle(k % 3 === 0 ? 0xffffff : lerpColor(this.head0, this.tail0, hash(k, 5)), fade * tw).fillCircle(cx, -cy, 2 + 3.5 * hash(k, 9));
        } else if (style === 'tongue') {
          // Flame tongues licking out sideways.
          const wob = Math.sin(now / 45 + k * 1.3);
          const hl = (16 + 26 * hash(k, flick)) * (1 - tm) * this.boost;
          g.lineStyle(9 * (1 - tm) + 3, lerpColor(0xffe066, 0xff3d12, tm * 1.5 > 1 ? 1 : tm * 1.5), 0.7 * fade).lineBetween(qx, -qy, qx + nx * hl * wob, -(qy + ny * hl * wob + 10));
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
