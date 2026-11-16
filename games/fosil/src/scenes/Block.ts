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
  private segs: Seg[] = [];
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
    // bevel: light top edge, dark right edge
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(x0 + 8, y0 + 6, w - 16, 18, 9);
    g.fillStyle(0x000000, 0.16).fillRoundedRect(x0 + w - 22, y0 + 20, 14, h - 40, 7);
    this.planCracks();
    this.shown = -1;
    this.setDamage(0);
    return this;
  }

  /** Show damage as a fraction 0..1 of the block's HP. */
  setDamage(f: number): void {
    const count = f <= 0 ? 0 : Math.max(1, Math.ceil(Math.min(1, f) * this.segs.length));
    if (count === this.shown) return;
    this.shown = count;
    const g = this.cracks.clear();
    if (count === 0) return;
    g.fillStyle(0x000000, Math.min(0.35, f * 0.4)).fillRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 26);
    for (const s of this.segs.slice(0, count)) {
      g.lineStyle(s.w + 3, 0xffffff, 0.12).lineBetween(s.x1, s.y1 + 2, s.x2, s.y2 + 2);
      g.lineStyle(s.w, PALETTE.crack, 1).lineBetween(s.x1, s.y1, s.x2, s.y2);
    }
  }

  private planCracks(): void {
    const segs: { s: Seg; gen: number }[] = [];
    const origins = 3;
    for (let o = 0; o < origins; o++) {
      const ox = (Math.random() - 0.5) * this.bw * 0.5;
      const oy = (Math.random() - 0.5) * this.bh * 0.5;
      const branches = 3;
      for (let b = 0; b < branches; b++) {
        let a = (b / branches) * Math.PI * 2 + Math.random();
        let x = ox;
        let y = oy;
        for (let k = 0; k < 5; k++) {
          a += (Math.random() - 0.5) * 1.1;
          const len = 26 + Math.random() * 30;
          const nx = Phaser.Math.Clamp(x + Math.cos(a) * len, -this.bw / 2 + 10, this.bw / 2 - 10);
          const ny = Phaser.Math.Clamp(y + Math.sin(a) * len, -this.bh / 2 + 10, this.bh / 2 - 10);
          segs.push({ s: { x1: x, y1: y, x2: nx, y2: ny, w: Math.max(2, 7 - k) }, gen: k * 10 + o });
          x = nx;
          y = ny;
        }
      }
    }
    segs.sort((p, q) => p.gen - q.gen);
    this.segs = segs.map((x) => x.s);
  }
}
