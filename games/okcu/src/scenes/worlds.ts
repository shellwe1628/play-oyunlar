/**
 * Arena art per theme: baked back (sky, sun/moon, stars, far range) and near layers, themed
 * ledges, and a pooled ambient system (snowfall, drifting sand, fireflies, meadow birds and
 * balloons). Static layers are drawn once into textures; only the ambient layer redraws.
 */
import type Phaser from 'phaser';
import type { Theme } from '../anim/themes';
import type { Ledge } from '../sim/body';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;
type Pt = { x: number; y: number };

/** Height of the night theme's lantern string (baked into the near layer; glows drawn live). */
export const LANTERN_Y = 868;

function poly(g: G, pts: Pt[]): void {
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
}

function mix(a: number, b: number, k: number): number {
  const r = ((a >> 16) & 0xff) + ((((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * k);
  const gg = ((a >> 8) & 0xff) + ((((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * k);
  const bl = (a & 0xff) + (((b & 0xff) - (a & 0xff)) * k);
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(bl);
}

export function shade(c: number, k: number): number {
  return mix(c, 0x000000, 1 - k);
}

/** Sky in bands (bakes on the canvas renderer, which has no gradient fill), sun/moon, stars, far range. */
export function drawThemeBack(g: G, th: Theme, W: number, H: number): void {
  const bands = 48;
  for (let i = 0; i < bands; i++) {
    g.fillStyle(mix(th.skyTop, th.skyBottom, i / (bands - 1)), 1).fillRect(0, (i * H) / bands, W, H / bands + 1);
  }
  if (th.stars) {
    for (let i = 0; i < 70; i++) {
      const x = (i * 157 + (i % 7) * 31) % W;
      const y = ((i * 97) % (H * 0.6)) + 16;
      g.fillStyle(PALETTE.white, 0.35 + (i % 4) * 0.15).fillCircle(x, y, 1.2 + (i % 3) * 0.9);
    }
  }
  const sx = W * (th.id === 'desert' ? 0.5 : 0.74);
  const sy = H * (th.id === 'desert' ? 0.5 : 0.17);
  const sr = th.id === 'desert' ? 110 : 56;
  g.fillStyle(th.sun, 0.14).fillCircle(sx, sy, sr * 2.2);
  g.fillStyle(th.sun, 0.25).fillCircle(sx, sy, sr * 1.5);
  g.fillStyle(th.sun, 1).fillCircle(sx, sy, sr);
  if (th.moon) {
    g.fillStyle(th.skyTop, 1).fillCircle(sx + sr * 0.45, sy - sr * 0.25, sr * 0.82);
    g.fillStyle(th.sun, 0.4).fillCircle(sx - sr * 0.35, sy + sr * 0.2, sr * 0.12);
  }
  // far range
  switch (th.id) {
    case 'snow': {
      const peaks = [0, 120, 230, 360, 470, 600, 720];
      peaks.forEach((px, i) => {
        const h = 230 + ((i * 53) % 120);
        const base = H * 0.62;
        g.fillStyle(th.far, 1).fillTriangle(px - 170, base, px + 170, base, px, base - h);
        g.fillStyle(th.farShade, 1).fillTriangle(px, base - h, px + 170, base, px + 20, base);
        g.fillStyle(0xffffff, 1).fillTriangle(px - 52, base - h + 70, px + 52, base - h + 70, px, base - h);
      });
      g.fillStyle(th.far, 1).fillRect(0, H * 0.62 - 2, W, H);
      break;
    }
    case 'desert': {
      // flat-topped mesas
      const mesas: [number, number, number][] = [
        [-20, 190, 250],
        [200, 140, 300],
        [420, 230, 220],
        [610, 170, 280],
      ];
      for (const [x, w, h] of mesas) {
        const base = H * 0.64;
        poly(g, [
          { x, y: base },
          { x: x + 24, y: base - h },
          { x: x + w - 24, y: base - h },
          { x: x + w, y: base },
        ]);
        g.fillStyle(th.far, 1);
        poly(g, [
          { x, y: base },
          { x: x + 24, y: base - h },
          { x: x + w - 24, y: base - h },
          { x: x + w, y: base },
        ]);
        g.fillStyle(th.farShade, 1).fillRect(x + 20, base - h * 0.55, w - 40, 10).fillRect(x + 14, base - h * 0.3, w - 28, 8);
      }
      g.fillStyle(th.far, 1).fillRect(0, H * 0.64 - 2, W, H);
      break;
    }
    default: {
      const base = H * 0.6;
      const pts: Pt[] = [{ x: -10, y: H }];
      for (let x = -10; x <= W + 10; x += 30) pts.push({ x, y: base - Math.abs(Math.sin(x * 0.006)) * 70 - Math.sin(x * 0.021) * 10 });
      pts.push({ x: W + 10, y: H });
      g.fillStyle(th.far, 1);
      poly(g, pts);
      break;
    }
  }
}

/** Near layer: pine hills, dunes, meadow hills with trees, or dark hills with a lantern string. */
export function drawThemeNear(g: G, th: Theme, W: number, H: number): void {
  const base = H * 0.74;
  const amp = th.id === 'desert' ? 34 : 52;
  const pts: Pt[] = [{ x: -10, y: H }];
  const ys: number[] = [];
  for (let x = -10; x <= W + 10; x += 20) {
    const y = base - Math.abs(Math.sin(x * (th.id === 'desert' ? 0.005 : 0.009) + 1)) * amp - Math.sin(x * 0.021) * 10;
    pts.push({ x, y });
    ys.push(y);
  }
  pts.push({ x: W + 10, y: H });
  g.fillStyle(th.near, 1);
  poly(g, pts);
  const yAt = (x: number) => ys[Math.max(0, Math.min(ys.length - 1, Math.round((x + 10) / 20)))]!;
  switch (th.id) {
    case 'meadow':
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 128 + (i % 2) * 30;
        const y = yAt(x) + 10;
        g.fillStyle(th.nearShade, 1).fillRect(x - 4, y - 10, 8, 22).fillCircle(x, y - 22, 20);
      }
      break;
    case 'snow':
      for (let i = 0; i < 9; i++) {
        const x = 20 + i * 86;
        const y = yAt(x) + 14;
        g.fillStyle(th.nearShade, 1).fillTriangle(x - 18, y, x + 18, y, x, y - 56).fillTriangle(x - 14, y - 22, x + 14, y - 22, x, y - 70);
        g.fillStyle(0xffffff, 0.9).fillTriangle(x - 7, y - 52, x + 7, y - 52, x, y - 70);
      }
      break;
    case 'desert':
      for (let i = 0; i < 4; i++) {
        const x = 70 + i * 190;
        const y = yAt(x) + 12;
        g.fillStyle(th.nearShade, 1).fillRoundedRect(x - 7, y - 54, 14, 56, 7).fillRoundedRect(x - 26, y - 38, 10, 22, 5).fillRoundedRect(x + 16, y - 46, 10, 24, 5);
        g.fillRect(x - 26, y - 22, 20, 7).fillRect(x + 6, y - 28, 20, 7);
      }
      break;
    case 'night':
      // lantern posts on the hills, strung together (baked; only the glow pulses at runtime)
      for (let i = 0; i < 4; i++) {
        const x = 60 + i * 200;
        const y = yAt(x) + 8;
        g.fillStyle(th.nearShade, 1).fillRect(x - 3, y - 70, 6, 74);
      }
      for (let i = 0; i < 3; i++) {
        const x0 = 60 + i * 200;
        let px = x0;
        let py = LANTERN_Y;
        for (let k = 1; k <= 8; k++) {
          const u = k / 8;
          const x = x0 + 200 * u;
          const y = LANTERN_Y + Math.sin(u * Math.PI) * 34;
          g.lineStyle(2, PALETTE.ink, 0.8).lineBetween(px, py, x, y);
          px = x;
          py = y;
          if (k % 2 === 0 && k < 8) {
            g.fillStyle(PALETTE.ink, 1).fillRoundedRect(x - 8, y, 16, 19, 6);
            g.fillStyle(k % 4 === 0 ? PALETTE.lantern : PALETTE.pink, 1).fillRoundedRect(x - 6, y + 2, 12, 15, 5);
          }
        }
      }
      break;
  }
}

/** A floating ledge in the theme's materials (same footprint as the collision box). */
export function drawThemeLedge(g: G, L: Ledge, seed: number, th: Theme): void {
  const { x, y, w, h } = L;
  const ink = PALETTE.ink;
  const depth = h * 1.1 + w * 0.18;
  const under = [
    { x: x + 4, y: y + h - 6 },
    { x: x + w - 4, y: y + h - 6 },
    { x: x + w * 0.72, y: y + h + depth * 0.55 },
    { x: x + w * 0.52, y: y + h + depth },
    { x: x + w * 0.3, y: y + h + depth * 0.62 },
  ];
  g.fillStyle(ink, 1);
  poly(g, under.map((p, i) => ({ x: p.x + (i === 0 ? -6 : i === 1 ? 6 : 0), y: p.y + (i >= 2 ? 7 : 0) })));
  g.fillStyle(th.under, 1);
  poly(g, under);
  g.fillStyle(th.underDark, 1).fillTriangle(x + w * 0.52, y + h + depth, x + w * 0.72, y + h + depth * 0.55, x + w * 0.56, y + h);
  if (th.id === 'snow') {
    // icicles
    for (let i = 0; i < 4; i++) {
      const ix = x + 20 + i * ((w - 40) / 3);
      g.fillStyle(PALETTE.white, 0.9).fillTriangle(ix - 5, y + h - 4, ix + 5, y + h - 4, ix, y + h + 18 + (i % 2) * 10);
    }
  }
  // body
  g.fillStyle(ink, 1).fillRoundedRect(x - 6, y + 2, w + 12, h + 4, 16);
  g.fillStyle(th.body, 1).fillRoundedRect(x, y + 6, w, h - 6, 12);
  if (th.id === 'desert') {
    g.fillStyle(th.bodyDark, 1).fillRect(x + 4, y + 24, w - 8, 6).fillRect(x + 4, y + 40, w - 8, 5);
  } else {
    for (let i = 0; i < 4; i++) {
      const k = ((seed * 7 + i * 13) % 10) / 10;
      g.fillStyle(th.bodyDark, 1).fillCircle(x + 16 + k * (w - 32), y + 24 + ((i * 11 + seed) % 3) * 9, 4 + (i % 2) * 2);
    }
  }
  // cap
  g.fillStyle(ink, 1).fillRoundedRect(x - 10, y - 8, w + 20, 30, 15);
  g.fillStyle(th.cap, 1).fillRoundedRect(x - 5, y - 4, w + 10, 22, 11);
  for (let gx = x + 4; gx < x + w - 2; gx += 18) {
    g.fillStyle(ink, 1).fillCircle(gx + 6, y + 19, 8);
    g.fillStyle(th.cap, 1).fillCircle(gx + 6, y + 16, 6);
  }
  g.fillStyle(th.capLight, 1).fillRoundedRect(x + 4, y - 1, w - 8, 6, 3);
  if (th.id === 'meadow' || th.id === 'night') {
    for (let i = 0; i < 3; i++) {
      const k = ((seed * 5 + i * 31) % 9) / 9;
      const tx = x + 14 + k * (w - 28);
      g.fillStyle(shade(th.cap, 0.7), 1).fillTriangle(tx - 6, y, tx + 6, y, tx - 2, y - 12).fillTriangle(tx, y, tx + 9, y, tx + 6, y - 9);
    }
  }
  if (th.id === 'night') {
    // a little lantern hanging from the ledge
    const lx = x + w * 0.2;
    g.lineStyle(3, ink, 1).lineBetween(lx, y + h, lx, y + h + 26);
    g.fillStyle(PALETTE.lantern, 0.25).fillCircle(lx, y + h + 38, 26);
    g.fillStyle(ink, 1).fillRoundedRect(lx - 11, y + h + 24, 22, 28, 7);
    g.fillStyle(PALETTE.lantern, 1).fillRoundedRect(lx - 7, y + h + 28, 14, 20, 5);
  }
  if (th.id === 'desert') {
    // a tiny cactus on some ledges
    if (seed % 2 === 0) {
      const cx = x + w * 0.8;
      g.fillStyle(ink, 1).fillRoundedRect(cx - 7, y - 30, 14, 30, 7);
      g.fillStyle(0x5aa85a, 1).fillRoundedRect(cx - 4, y - 27, 8, 26, 4);
    }
  }
}

/** Pooled ambient motion. All state in typed arrays; draw() redraws one Graphics. */
export class Ambient {
  private readonly n = 56;
  private readonly x = new Float32Array(this.n);
  private readonly y = new Float32Array(this.n);
  private readonly v = new Float32Array(this.n);
  private readonly p = new Float32Array(this.n);
  private t = 0;

  constructor(private readonly W: number, private readonly H: number) {
    this.reset();
  }

  reset(): void {
    for (let i = 0; i < this.n; i++) {
      this.x[i] = Math.random() * this.W;
      this.y[i] = Math.random() * this.H;
      this.v[i] = 0.5 + Math.random();
      this.p[i] = Math.random() * 6.28;
    }
  }

  update(dt: number, th: Theme): void {
    this.t += dt;
    const W = this.W;
    const H = this.H;
    for (let i = 0; i < this.n; i++) {
      switch (th.ambient) {
        case 'snow':
          this.y[i] = this.y[i]! + (40 + this.v[i]! * 50) * dt;
          this.x[i] = this.x[i]! + Math.sin(this.t * 1.3 + this.p[i]!) * 22 * dt - 12 * dt;
          break;
        case 'sand':
          this.x[i] = this.x[i]! + (160 + this.v[i]! * 180) * dt;
          this.y[i] = this.y[i]! + Math.sin(this.t * 2 + this.p[i]!) * 10 * dt;
          break;
        case 'fireflies':
          this.x[i] = this.x[i]! + Math.sin(this.t * 0.7 + this.p[i]!) * 18 * dt;
          this.y[i] = this.y[i]! + Math.cos(this.t * 0.9 + this.p[i]! * 1.3) * 14 * dt;
          break;
        default:
          // pollen drifting up
          this.y[i] = this.y[i]! - (8 + this.v[i]! * 10) * dt;
          this.x[i] = this.x[i]! + Math.sin(this.t + this.p[i]!) * 10 * dt;
      }
      if (this.y[i]! > H + 10) this.y[i] = -10;
      if (this.y[i]! < -10) this.y[i] = H + 10;
      if (this.x[i]! > W + 20) this.x[i] = -20;
      if (this.x[i]! < -20) this.x[i] = W + 20;
    }
  }

  draw(g: G, th: Theme): void {
    g.clear();
    const t = this.t;
    switch (th.ambient) {
      case 'snow':
        for (let i = 0; i < this.n; i++) g.fillStyle(PALETTE.white, 0.75).fillCircle(this.x[i]!, this.y[i]!, 1.8 + this.v[i]! * 1.8);
        break;
      case 'sand':
        for (let i = 0; i < 30; i++) {
          const x = this.x[i]!;
          const y = this.y[i]! * 0.7 + 260;
          g.lineStyle(2, th.capLight, 0.45).lineBetween(x, y, x - 18 - this.v[i]! * 14, y + 1);
        }
        break;
      case 'fireflies':
        for (let i = 0; i < 18; i++) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.4 + this.p[i]! * 3));
          const x = this.x[i]!;
          const y = this.y[i]! * 0.55 + 380;
          g.fillStyle(PALETTE.firefly, a * 0.25).fillCircle(x, y, 9);
          g.fillStyle(PALETTE.firefly, a).fillCircle(x, y, 2.6);
        }
        break;
      default: {
        for (let i = 0; i < 14; i++) g.fillStyle(PALETTE.white, 0.5).fillCircle(this.x[i]!, this.y[i]! * 0.6 + 300, 1.6);
        // two far balloons and a passing flock
        for (let i = 0; i < 2; i++) {
          const x = ((t * (6 + i * 3) + i * 380) % (this.W + 120)) - 60;
          const y = 170 + i * 120 + Math.sin(t * 0.6 + i * 2) * 14;
          g.fillStyle(i === 0 ? PALETTE.pink : PALETTE.powerMid, 0.38).fillCircle(x, y, 17).fillTriangle(x - 15, y + 8, x + 15, y + 8, x, y + 26);
          g.fillStyle(th.far, 0.6).fillRect(x - 5, y + 27, 10, 8);
        }
        const k = (t % 26) / 26;
        if (k < 0.55) {
          const bx = -60 + (k / 0.55) * (this.W + 160);
          for (let i = 0; i < 4; i++) {
            const x = bx - i * 26;
            const y = 250 + i * 9 + Math.sin(t * 2 + i) * 6;
            const f = Math.sin(t * 12 + i * 1.7) * 6;
            g.lineStyle(3, th.nearShade, 0.75).lineBetween(x - 9, y - f, x, y).lineBetween(x, y, x + 9, y - f);
          }
        }
      }
    }
  }
}
