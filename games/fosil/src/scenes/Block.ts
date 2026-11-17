import Phaser from 'phaser';
import { shade } from '../art/fossils';
import { LAYERS, at } from '../sim/data';
import { PALETTE } from '../textures';

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  w: number;
}

/**
 * The stratum block: layered sediment with pebbles; cracks spread as damage grows.
 * Purely visual (cosmetic randomness only). Origin at the block centre.
 */
export class StratumBlock extends Phaser.GameObjects.Container {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly cracks: Phaser.GameObjects.Graphics;
  /** Crack branches per strike origin (up to three origins per block, where it was hit). */
  private origins: Seg[][] = [];
  private layer = 0;
  private shown = -1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly bw: number,
    readonly bh: number,
  ) {
    super(scene, x, y);
    this.base = scene.add.graphics();
    this.cracks = scene.add.graphics();
    this.add([this.base, this.cracks]);
    scene.add.existing(this);
  }

  setLayer(layer: number): this {
    this.layer = layer;
    return this.regenerate();
  }

  /** A fresh block: new pebbles, new crack plan, no damage. */
  regenerate(): this {
    const w = this.bw;
    const h = this.bh;
    const bands = at(LAYERS, this.layer).bands;
    const g = this.base.clear();
    const x0 = -w / 2;
    const y0 = -h / 2;
    g.fillStyle(PALETTE.shadow, 0.5).fillRoundedRect(x0 + 10, y0 + 18, w, h, 26);
    g.fillStyle(at(bands, 0), 1).fillRoundedRect(x0, y0, w, h, 26);
    // wavy sediment bands; each band stops a little below the next band's top
    const n = bands.length;
    const phase = Math.random() * 6;
    for (let i = 1; i < n; i++) {
      const top = y0 + (h * i) / n;
      const bottom = i === n - 1 ? y0 + h - 40 : y0 + (h * (i + 1)) / n + 14;
      const pts: Phaser.Math.Vector2[] = [];
      for (let k = 0; k <= 16; k++) pts.push(new Phaser.Math.Vector2(x0 + (w * k) / 16, top + Math.sin(k * 0.8 + phase + i) * 9));
      pts.push(new Phaser.Math.Vector2(x0 + w, bottom), new Phaser.Math.Vector2(x0, bottom));
      g.fillStyle(at(bands, i), 1).fillPoints(pts, true);
    }
    g.fillStyle(at(bands, n - 1), 1).fillRoundedRect(x0, y0 + h - 60, w, 60, { tl: 0, tr: 0, bl: 26, br: 26 });
    // pebbles
    for (let i = 0; i < 26; i++) {
      const px = x0 + 24 + Math.random() * (w - 48);
      const py = y0 + 20 + Math.random() * (h - 40);
      const r = 4 + Math.random() * 9;
      const c = shade(at(bands, i % n), Math.random() < 0.5 ? -0.3 : 0.25);
      g.fillStyle(c, 0.9).fillEllipse(px, py, r * 2.2, r * 1.6);
    }
    this.drawMaterial(g, x0, y0, w, h);
    // bevel: light top edge, dark right edge
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(x0 + 8, y0 + 6, w - 16, 18, 9);
    g.fillStyle(0x000000, 0.16).fillRoundedRect(x0 + w - 22, y0 + 20, 14, h - 40, 7);
    this.origins = [];
    this.shown = -1;
    this.setDamage(0);
    return this;
  }

  /** A strike at a point in block-local px: the first three distinct strikes seed the cracks. */
  hit(lx: number, ly: number): void {
    if (this.origins.length >= 3) return;
    for (const o of this.origins) {
      const first = o[0];
      if (first && Math.hypot(first.x1 - lx, first.y1 - ly) < 50) return;
    }
    const x = Phaser.Math.Clamp(lx, -this.bw / 2 + 24, this.bw / 2 - 24);
    const y = Phaser.Math.Clamp(ly, -this.bh / 2 + 24, this.bh / 2 - 24);
    this.origins.push(this.branches(x, y));
    this.shown = -1;
  }

  /** Per-layer details baked into the block face. */
  private drawMaterial(g: Phaser.GameObjects.Graphics, x0: number, y0: number, w: number, h: number): void {
    const r = (a: number, b: number): number => a + Math.random() * (b - a);
    if (this.layer === 0) {
      for (let i = 0; i < 5; i++) {
        let x = r(x0 + 30, x0 + w - 30);
        let y = y0 + r(10, 40);
        for (let k = 0; k < 5; k++) {
          const nx = x + r(-26, 26);
          const ny = y + r(16, 34);
          g.lineStyle(4 - k * 0.5, 0x2a180d, 0.7).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
      for (let i = 0; i < 6; i++) g.fillStyle(0x1e110a, 0.75).fillCircle(r(x0 + 30, x0 + w - 30), r(y0 + 40, y0 + h - 30), r(4, 7));
    } else if (this.layer === 1) {
      g.fillStyle(0xeaf8ff, 0.12).fillRoundedRect(x0, y0, w, h, 26);
      for (let i = 0; i < 7; i++) {
        const x = r(x0 + 20, x0 + w - 80);
        g.lineStyle(r(3, 7), 0xffffff, 0.18).lineBetween(x, y0 + 10, x + 70, y0 + h - 10);
      }
      for (let i = 0; i < 14; i++) g.lineStyle(2, 0xffffff, 0.5).strokeCircle(r(x0 + 20, x0 + w - 20), r(y0 + 20, y0 + h - 20), r(3, 7));
    } else if (this.layer === 2) {
      for (let i = 0; i < 5; i++) {
        const x = r(x0 + 40, x0 + w - 40);
        const y = r(y0 + 40, y0 + h - 40);
        const rad = r(9, 18);
        g.fillStyle(0xff9a20, 0.25).fillCircle(x, y, rad * 1.6);
        g.fillStyle(0xe0821a, 0.95).fillCircle(x, y, rad);
        g.fillStyle(0xffe08a, 0.9).fillCircle(x - rad * 0.35, y - rad * 0.35, rad * 0.35);
      }
      for (let i = 0; i < 3; i++) {
        const x = r(x0 + 50, x0 + w - 50);
        const y = r(y0 + 60, y0 + h - 40);
        g.lineStyle(2, 0x3a1a0a, 0.5).lineBetween(x, y, x + 40, y - 40);
        for (let k = 0; k < 5; k++) g.lineBetween(x + k * 8, y - k * 8, x + k * 8 - 10, y - k * 8 - 6);
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const x = r(x0 + 30, x0 + w - 30);
        const y = r(y0 + 30, y0 + h - 30);
        g.lineStyle(3, 0xf2e3c6, 0.75).beginPath().arc(x, y, r(5, 9), 0, Math.PI * 1.4).strokePath();
      }
      for (let i = 0; i < 10; i++) g.fillStyle(i % 2 ? 0xc06a8a : 0x7fe0d0, 0.55).fillCircle(r(x0 + 20, x0 + w - 20), r(y0 + 20, y0 + h - 20), r(2, 5));
    }
  }

  /** Show damage as a fraction 0..1 of the block's HP. */
  setDamage(f: number): void {
    if (f > 0 && this.origins.length === 0) this.hit((Math.random() - 0.5) * this.bw * 0.4, (Math.random() - 0.5) * this.bh * 0.4);
    const key = Math.ceil(Math.min(1, Math.max(0, f)) * 15) * 4 + this.origins.length;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.cracks.clear();
    if (f <= 0) return;
    const crack = this.layer === 1 ? 0x2a5a78 : this.layer === 3 ? 0x06141c : PALETTE.crack;
    const lip = 0xffffff;
    g.fillStyle(0x000000, Math.min(0.32, f * 0.36)).fillRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 26);
    // each origin spreads its own branches as damage grows
    for (const segs of this.origins) {
      const n = Math.max(1, Math.ceil(Math.min(1, f * 1.15) * segs.length));
      for (let i = 0; i < n; i++) {
        const s = segs[i]!;
        g.lineStyle(s.w + 3, lip, this.layer === 1 ? 0.35 : 0.12).lineBetween(s.x1, s.y1 + 2, s.x2, s.y2 + 2);
        g.lineStyle(s.w, crack, 1).lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
    }
  }

  /** Branches radiating from (ox, oy), ordered from the strike point outwards. */
  private branches(ox: number, oy: number): Seg[] {
    const segs: { s: Seg; gen: number }[] = [];
    const count = 4;
    for (let b = 0; b < count; b++) {
      let a = (b / count) * Math.PI * 2 + Math.random();
      let x = ox;
      let y = oy;
      for (let k = 0; k < 5; k++) {
        a += (Math.random() - 0.5) * 1.1;
        const len = 22 + Math.random() * 30;
        const nx = Phaser.Math.Clamp(x + Math.cos(a) * len, -this.bw / 2 + 10, this.bw / 2 - 10);
        const ny = Phaser.Math.Clamp(y + Math.sin(a) * len, -this.bh / 2 + 10, this.bh / 2 - 10);
        segs.push({ s: { x1: x, y1: y, x2: nx, y2: ny, w: Math.max(2, 7 - k) }, gen: k });
        x = nx;
        y = ny;
      }
    }
    segs.sort((p, q) => p.gen - q.gen);
    return segs.map((x) => x.s);
  }
}
