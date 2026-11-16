/**
 * Draws a sheet: a static paper layer (fibres, torn edges, drop shadow) baked once, and an ink
 * layer on a small canvas (INK_RES px per cell) shown scaled up with linear filtering, so every
 * border is soft. Each ink pixel samples its owner through a smooth jitter field, which makes
 * borders irregular like ink soaking into paper; pixels on a border are darker (pooled ink);
 * freshly taken cells are darker for a moment and settle. Only changed cells are redrawn.
 */
import Phaser from 'phaser';
import type { GameMap } from '../sim/mapgen';
import { PALETTE } from '../textures';

/** Ink canvas pixels per cell. */
const INK_RES = 4;
/** Ticks a fresh cell stays darker, in steps. */
const FRESH_STEPS = 5;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Owner source the renderer reads (the MatchSim satisfies it). */
export interface InkSource {
  readonly owner: Int8Array;
  readonly changedAt: Int32Array;
  readonly tickCount: number;
  dirty: number[];
}

// ---------------------------------------------------------------- cosmetic noise (not gameplay)

function hash(ix: number, iy: number, s: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x: number, y: number, s: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s);
  const b = hash(ix + 1, iy, s);
  const c = hash(ix, iy + 1, s);
  const d = hash(ix + 1, iy + 1, s);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

/** Jitter in cell units at (u, v): the same field drives paper edges and ink borders. */
function jitter(u: number, v: number, s: number): [number, number] {
  return [
    (vnoise(u * 0.85, v * 0.85, s) - 0.5) * 1.05 + (vnoise(u * 2.4, v * 2.4, s + 11) - 0.5) * 0.4,
    (vnoise(u * 0.85, v * 0.85, s + 5) - 0.5) * 1.05 + (vnoise(u * 2.4, v * 2.4, s + 17) - 0.5) * 0.4,
  ];
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

let textureSerial = 0;

export class InkMap {
  readonly cellSize: number;
  readonly rect: Rect;
  readonly paper: Phaser.GameObjects.Image;
  readonly ink: Phaser.GameObjects.Image;
  private readonly inkTex: Phaser.Textures.CanvasTexture;
  private readonly paperTex: Phaser.Textures.CanvasTexture;
  private readonly img: ImageData;
  private readonly iw: number;
  private readonly ih: number;
  /** Per ink pixel: the sampled cell and four neighbour samples (for border pooling). */
  private readonly sample: Int32Array;
  private readonly sampleN: Int32Array;
  /** Per ink pixel: fibre noise 0..255 (texture in the ink). */
  private readonly grain: Uint8Array;
  private readonly inkRgb: [number, number, number][];
  /** Cells currently drawn darker (fresh), and their drawn step. */
  private readonly fresh = new Map<number, number>();
  private readonly mark: Uint8Array;
  private dimmed: Set<number> = new Set();
  private readonly washedRgb = rgb(PALETTE.grey);

  constructor(
    private readonly scene: Phaser.Scene,
    readonly map: GameMap,
    area: Rect,
    private readonly seed: number,
    depth = 0,
  ) {
    const cs = Math.min(area.width / map.width, area.height / map.height);
    this.cellSize = cs;
    const w = cs * map.width;
    const h = cs * map.height;
    this.rect = { x: area.x + (area.width - w) / 2, y: area.y + (area.height - h) / 2, width: w, height: h };
    this.iw = map.width * INK_RES;
    this.ih = map.height * INK_RES;
    const serial = textureSerial++;
    this.paperTex = scene.textures.createCanvas(`sheet-paper-${serial}`, Math.round(w) + 16, Math.round(h) + 16)!;
    this.inkTex = scene.textures.createCanvas(`sheet-ink-${serial}`, this.iw, this.ih)!;
    this.inkTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.paperTex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.inkRgb = PALETTE.inks.map(rgb);

    const n = this.iw * this.ih;
    this.sample = new Int32Array(n);
    this.sampleN = new Int32Array(n * 4);
    this.grain = new Uint8Array(n);
    this.mark = new Uint8Array(map.width * map.height);
    const cellOf = (u: number, v: number): number => {
      const cx = Math.floor(u);
      const cy = Math.floor(v);
      if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return -1;
      return cy * map.width + cx;
    };
    for (let py = 0; py < this.ih; py++) {
      for (let px = 0; px < this.iw; px++) {
        const u = (px + 0.5) / INK_RES;
        const v = (py + 0.5) / INK_RES;
        const [jx, jy] = jitter(u, v, seed);
        const i = py * this.iw + px;
        this.sample[i] = cellOf(u + jx, v + jy);
        const e = 0.55;
        this.sampleN[i * 4] = cellOf(u + jx + e, v + jy);
        this.sampleN[i * 4 + 1] = cellOf(u + jx - e, v + jy);
        this.sampleN[i * 4 + 2] = cellOf(u + jx, v + jy + e);
        this.sampleN[i * 4 + 3] = cellOf(u + jx, v + jy - e);
        this.grain[i] = Math.floor(vnoise(px * 0.9, py * 0.9, seed + 3) * 160 + hash(px, py, seed + 9) * 95);
      }
    }

    this.drawPaper(cellOf);
    const ctx = this.inkTex.getContext();
    this.img = ctx.createImageData(this.iw, this.ih);

    this.paper = scene.add
      .image(this.rect.x - 8, this.rect.y - 8, this.paperTex.key)
      .setOrigin(0, 0)
      .setDepth(depth);
    this.ink = scene.add
      .image(this.rect.x, this.rect.y, this.inkTex.key)
      .setOrigin(0, 0)
      .setDisplaySize(w, h)
      .setDepth(depth + 1);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Paper layer at display resolution: shadow, torn edge, fibres. */
  private drawPaper(cellOf: (u: number, v: number) => number): void {
    const tex = this.paperTex;
    const W = tex.width;
    const H = tex.height;
    const ctx = tex.getContext();
    const out = ctx.createImageData(W, H);
    const d = out.data;
    const cs = this.cellSize;
    const land = this.map.land;
    const isLand = (x: number, y: number): boolean => {
      const u = (x - 8) / cs;
      const v = (y - 8) / cs;
      const [jx, jy] = jitter(u, v, this.seed);
      const c = cellOf(u + jx, v + jy);
      return c >= 0 && land[c] === 1;
    };
    const [pr, pg, pb] = rgb(PALETTE.paper);
    const [sr, sg, sb] = rgb(PALETTE.paperShade);
    // Coarse land mask first (shadow needs offsets), one sample per pixel.
    const mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = isLand(x, y) ? 1 : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        if (mask[i]) {
          // Fibres: long faint streaks + fine speckle + soft blotches.
          const fib = vnoise(x * 0.04, y * 0.6, this.seed + 21) * 0.5 + vnoise(x * 0.7, y * 0.05, this.seed + 23) * 0.35;
          const blotch = vnoise(x * 0.012, y * 0.012, this.seed + 29);
          const speck = hash(x, y, this.seed + 31);
          let t = 0.18 * fib + 0.35 * blotch + (speck > 0.985 ? 0.5 : 0) + speck * 0.08;
          // Edge darkening where the paper is torn.
          const edge = !mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W];
          if (edge) t += 0.55;
          t = Math.min(1, t * 0.55);
          d[o] = pr + (sr - pr) * t;
          d[o + 1] = pg + (sg - pg) * t;
          d[o + 2] = pb + (sb - pb) * t;
          d[o + 3] = 255;
        } else {
          // Drop shadow cast by paper up-left of this pixel.
          let sh = 0;
          for (let k = 2; k <= 6; k += 2) {
            const sx = x - k;
            const sy = y - k;
            if (sx >= 0 && sy >= 0 && mask[sy * W + sx]) sh += 1;
          }
          d[o] = 0;
          d[o + 1] = 0;
          d[o + 2] = 0;
          d[o + 3] = sh * 42;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    tex.refresh();
  }

  /** Cell under a world point, or -1 (outside the sheet). */
  cellAt(x: number, y: number): number {
    const cx = Math.floor((x - this.rect.x) / this.cellSize);
    const cy = Math.floor((y - this.rect.y) / this.cellSize);
    if (cx < 0 || cy < 0 || cx >= this.map.width || cy >= this.map.height) return -1;
    return cy * this.map.width + cx;
  }

  cellCenter(cell: number): { x: number; y: number } {
    const cx = cell % this.map.width;
    const cy = (cell - cx) / this.map.width;
    return { x: this.rect.x + (cx + 0.5) * this.cellSize, y: this.rect.y + (cy + 0.5) * this.cellSize };
  }

  /** Grey out these colonies' ink (eliminated colonies leave no land, but the HUD may use it). */
  setDimmed(ids: Iterable<number>): void {
    this.dimmed = new Set(ids);
  }

  /** Redraw everything (start of a match). */
  fullRedraw(src: InkSource): void {
    const all: number[] = [];
    for (let i = 0; i < this.map.width * this.map.height; i++) all.push(i);
    src.dirty.length = 0;
    this.redrawCells(src, all, true);
  }

  /** Drain the sim's dirty list and settle fresh cells. Call once per frame. */
  sync(src: InkSource): number {
    const list: number[] = [];
    const w = this.map.width;
    const h = this.map.height;
    const add = (c: number): void => {
      if (c < 0 || this.mark[c]) return;
      this.mark[c] = 1;
      list.push(c);
    };
    for (const c of src.dirty) {
      this.fresh.set(c, -1);
      const x = c % w;
      const y = (c - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < w && ny < h) add(ny * w + nx);
        }
      }
    }
    src.dirty.length = 0;
    // Fresh cells whose darkness step changed since they were drawn.
    for (const [c, drawn] of this.fresh) {
      const step = this.freshStep(src, c);
      if (step !== drawn) {
        add(c);
        if (step === 0) {
          // Last step: neighbours' pixels may sample this cell; settle them too.
          const x = c % w;
          const y = (c - x) / w;
          if (x > 0) add(c - 1);
          if (x < w - 1) add(c + 1);
          if (y > 0) add(c - w);
          if (y < h - 1) add(c + w);
        }
      }
    }
    for (const c of list) this.mark[c] = 0;
    if (list.length) this.redrawCells(src, list, false);
    return list.length;
  }

  private freshStep(src: InkSource, cell: number): number {
    const age = src.tickCount - src.changedAt[cell]!;
    return Math.max(0, Math.min(FRESH_STEPS, FRESH_STEPS - Math.floor(age / 2)));
  }

  private redrawCells(src: InkSource, cells: readonly number[], full: boolean): void {
    const d = this.img.data;
    const w = this.map.width;
    const iw = this.iw;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    const owner = src.owner;
    const land = this.map.land;
    for (const c of cells) {
      const cx = c % w;
      const cy = (c - cx) / w;
      const step = this.freshStep(src, c);
      if (step === 0) this.fresh.delete(c);
      else if (this.fresh.has(c)) this.fresh.set(c, step);
      const x0 = cx * INK_RES;
      const y0 = cy * INK_RES;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x0 + INK_RES > maxX) maxX = x0 + INK_RES;
      if (y0 + INK_RES > maxY) maxY = y0 + INK_RES;
      for (let py = y0; py < y0 + INK_RES; py++) {
        for (let px = x0; px < x0 + INK_RES; px++) {
          const i = py * iw + px;
          const o = i * 4;
          const s = this.sample[i]!;
          const own = s >= 0 && land[s] ? owner[s]! : -1;
          if (own < 0) {
            d[o + 3] = 0;
            continue;
          }
          let edge = 0;
          for (let k = 0; k < 4; k++) {
            const n = this.sampleN[i * 4 + k]!;
            const no = n >= 0 && land[n] ? owner[n]! : -2;
            if (no !== own) edge++;
          }
          const f = this.freshStep(src, s) / FRESH_STEPS;
          const g = this.grain[i]! / 255;
          const col = this.dimmed.has(own) ? this.washedRgb : this.inkRgb[own % this.inkRgb.length]!;
          // Darker at pooled borders and when fresh; slight fibre texture throughout.
          const dark = 1 - Math.min(0.5, edge * 0.12 + f * 0.38) - g * 0.08;
          d[o] = col[0] * dark;
          d[o + 1] = col[1] * dark;
          d[o + 2] = col[2] * dark;
          d[o + 3] = Math.min(255, 196 + edge * 14 + f * 50 - g * 26);
        }
      }
    }
    if (maxX < 0) return;
    const ctx = this.inkTex.getContext();
    if (full) ctx.putImageData(this.img, 0, 0);
    else ctx.putImageData(this.img, 0, 0, minX, minY, maxX - minX, maxY - minY);
    this.inkTex.refresh();
  }

  destroy(): void {
    if (this.paper.active) this.paper.destroy();
    if (this.ink.active) this.ink.destroy();
    if (this.scene.textures.exists(this.paperTex.key)) this.scene.textures.remove(this.paperTex.key);
    if (this.scene.textures.exists(this.inkTex.key)) this.scene.textures.remove(this.inkTex.key);
  }
}
