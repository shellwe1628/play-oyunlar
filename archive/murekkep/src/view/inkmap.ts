/**
 * Draws a sheet: a static paper layer (fibres, torn edges, drop shadow) baked once per sheet and
 * cached, and one ink layer per colony on small canvases (INK_RES px per cell) shown scaled up with
 * linear filtering, so every border is soft.
 *
 * Each ink pixel is a kernel-weighted vote of the 3×3 cells around a noise-jittered position:
 * borders are organic, a narrow winning margin marks a border (ink pools darker there), and freshly
 * taken cells are darker for a moment (the visible wave front). Layers store only a grey shade and
 * alpha; the colour is a per-frame tint, so a colony's ink can show its density at no redraw cost:
 * thin colonies look pale and watery, dense ones deep and saturated. Only changed cells (and their
 * 3×3 neighbourhood) are redrawn and uploaded.
 */
import Phaser from 'phaser';
import type { GameMap } from '../sim/mapgen';
import { PALETTE } from '../textures';

/** Ink canvas pixels per cell. */
const INK_RES = 8;
/** Fresh-ink darkness steps (one per 2 ticks). */
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

/** Stable cosmetic seed for a sheet (so paper and borders are the same every visit, and cacheable). */
function sheetSeed(map: GameMap): number {
  let h = 2166136261;
  for (let i = 0; i < map.id.length; i++) h = Math.imul(h ^ map.id.charCodeAt(i), 16777619);
  return (h >>> 0) & 0xffff;
}

/**
 * Subtle per-colony ink texture (0 = plain, else a hatch, rule, dot or cross pattern), so colonies
 * stay apart even when their colours are hard to tell (colour-vision deficiency, pale thin ink).
 */
function pattern(k: number, px: number, py: number): number {
  switch (k % 6) {
    case 1:
      return (px + py) % 7 < 2 ? 1 : 0;
    case 2:
      return py % 6 < 2 ? 1 : 0;
    case 3:
      return px % 6 < 2 && py % 6 < 2 ? 1 : 0;
    case 4:
      return (px - py + 700) % 7 < 2 ? 1 : 0;
    case 5:
      return (px + py) % 8 < 1 || (px - py + 800) % 8 < 1 ? 1 : 0;
    default:
      return 0;
  }
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/**
 * A canvas texture whose 2D context lives in CPU memory. Phaser's createCanvas() takes its canvas
 * from CanvasPool, which first opens the context with willReadFrequently: false; such a canvas is
 * GPU-backed and every WebGL upload of it can become a GPU readback. Candidate for core.
 */
export function cpuCanvasTexture(scene: Phaser.Scene, key: string, width: number, height: number): Phaser.Textures.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d', { willReadFrequently: true });
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas)!;
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return tex;
}

/** Per-sheet data that is expensive to build: jittered pixel positions, grain, baked paper. */
interface SheetCache {
  pos: Float32Array;
  grain: Uint8Array;
  paper: Map<string, ImageData>;
}
const caches = new Map<string, SheetCache>();

/**
 * Kernel weight for a squared distance (cell units); 0 beyond ~1.2 cells.
 */
function kernel(d2: number): number {
  const k = 1 - d2 / 1.45;
  return k > 0 ? k * k : 0;
}

/** Display colour for colony `k` at ink fill `f` (reserve ÷ cap, 0..1): pale when thin, deep when full. */
export function inkTint(k: number, f: number): number {
  const [r, g, b] = rgb(PALETTE.inks[k % PALETTE.inks.length]!);
  const fill = Math.max(0, Math.min(1, f));
  const pale = 0.38 * (1 - fill) * (1 - fill); // up to 38 % toward white when empty
  const deep = 1 - 0.28 * fill * fill; // up to 28 % darker when full
  const ch = (c: number): number => Math.round((c + (255 - c) * pale) * deep);
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/** Layer alpha for ink fill `f`: watery when thin, opaque when full. */
export function inkAlpha(f: number): number {
  return 0.62 + 0.38 * Math.max(0, Math.min(1, f));
}

let textureSerial = 0;

interface Layer {
  tex: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
  data: ImageData;
  dirty: boolean;
  tint: number;
  alpha: number;
}

export class InkMap {
  readonly cellSize: number;
  readonly rect: Rect;
  readonly paper: Phaser.GameObjects.Image;
  private readonly paperTex: Phaser.Textures.CanvasTexture;
  private readonly layers: Layer[] = [];
  private readonly iw: number;
  private readonly ih: number;
  private readonly seed: number;
  private readonly cache: SheetCache;
  /** Colony currently drawn at each ink pixel (-1 none). */
  private readonly pixOwner: Int8Array;
  private readonly acc = new Float32Array(10);
  private readonly fresh = new Map<number, number>();
  private readonly mark: Uint8Array;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly map: GameMap,
    area: Rect,
    colonies: number,
    depth = 0,
  ) {
    const cs = Math.min(area.width / map.width, area.height / map.height);
    this.cellSize = cs;
    const w = cs * map.width;
    const h = cs * map.height;
    this.rect = { x: area.x + (area.width - w) / 2, y: area.y + (area.height - h) / 2, width: w, height: h };
    this.iw = map.width * INK_RES;
    this.ih = map.height * INK_RES;
    this.seed = sheetSeed(map);
    this.mark = new Uint8Array(map.width * map.height);
    this.pixOwner = new Int8Array(this.iw * this.ih).fill(-1);
    this.cache = this.sheetCache();

    const serial = textureSerial++;
    const pw = Math.round(w) + 16;
    const ph = Math.round(h) + 16;
    this.paperTex = cpuCanvasTexture(scene, `sheet-paper-${serial}`, pw, ph);
    this.drawPaper(pw, ph);
    this.paper = scene.add
      .image(this.rect.x - 8, this.rect.y - 8, this.paperTex.key)
      .setOrigin(0, 0)
      .setDepth(depth);
    for (let k = 0; k < colonies; k++) {
      const tex = cpuCanvasTexture(scene, `sheet-ink-${serial}-${k}`, this.iw, this.ih);
      const data = tex.getContext().createImageData(this.iw, this.ih);
      const img = scene.add
        .image(this.rect.x, this.rect.y, tex.key)
        .setOrigin(0, 0)
        .setDisplaySize(w, h)
        .setDepth(depth + 1);
      this.layers.push({ tex, img, data, dirty: false, tint: -1, alpha: -1 });
      this.setInk(k, 0.5);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private sheetCache(): SheetCache {
    const key = `${this.map.id}:${this.map.width}x${this.map.height}`;
    let c = caches.get(key);
    if (c) return c;
    const n = this.iw * this.ih;
    const pos = new Float32Array(n * 2);
    const grain = new Uint8Array(n);
    for (let py = 0; py < this.ih; py++) {
      for (let px = 0; px < this.iw; px++) {
        const u = (px + 0.5) / INK_RES;
        const v = (py + 0.5) / INK_RES;
        const [jx, jy] = jitter(u, v, this.seed);
        const i = py * this.iw + px;
        pos[i * 2] = u + jx;
        pos[i * 2 + 1] = v + jy;
        grain[i] = Math.floor(vnoise(px * 0.45, py * 0.45, this.seed + 3) * 160 + hash(px, py, this.seed + 9) * 95);
      }
    }
    c = { pos, grain, paper: new Map() };
    caches.set(key, c);
    return c;
  }

  /** Paper minus gap score around (u, v): > 0 means paper. */
  private landScore(u: number, v: number): number {
    const { width: w, height: h, land } = this.map;
    const cx = Math.floor(u);
    const cy = Math.floor(v);
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ddx = u - (x + 0.5);
        const ddy = v - (y + 0.5);
        const k = kernel(ddx * ddx + ddy * ddy);
        if (k === 0) continue;
        const on = x >= 0 && y >= 0 && x < w && y < h && land[y * w + x] === 1;
        sum += on ? k : -k;
      }
    }
    return sum;
  }

  /** Paper layer at display resolution (shadow, torn edge, fibres), cached per sheet and size. */
  private drawPaper(W: number, H: number): void {
    const ctx = this.paperTex.getContext();
    const key = `${W}x${H}`;
    let out = this.cache.paper.get(key);
    if (!out) {
      out = ctx.createImageData(W, H);
      const d = out.data;
      const cs = this.cellSize;
      const [pr, pg, pb] = rgb(PALETTE.paper);
      const [sr, sg, sb] = rgb(PALETTE.paperShade);
      const mask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const u = (x - 8) / cs;
          const v = (y - 8) / cs;
          const [jx, jy] = jitter(u, v, this.seed);
          mask[y * W + x] = this.landScore(u + jx, v + jy) > 0 ? 1 : 0;
        }
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          const o = i * 4;
          if (mask[i]) {
            const fib = vnoise(x * 0.04, y * 0.6, this.seed + 21) * 0.5 + vnoise(x * 0.7, y * 0.05, this.seed + 23) * 0.35;
            const blotch = vnoise(x * 0.012, y * 0.012, this.seed + 29);
            const speck = hash(x, y, this.seed + 31);
            let t = 0.18 * fib + 0.35 * blotch + (speck > 0.985 ? 0.5 : 0) + speck * 0.08;
            if (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]) t += 0.55;
            t = Math.min(1, t * 0.55);
            d[o] = pr + (sr - pr) * t;
            d[o + 1] = pg + (sg - pg) * t;
            d[o + 2] = pb + (sb - pb) * t;
            d[o + 3] = 255;
          } else {
            let sh = 0;
            for (let k = 2; k <= 6; k += 2) {
              const sx = x - k;
              const sy = y - k;
              if (sx >= 0 && sy >= 0 && mask[sy * W + sx]) sh += 1;
            }
            d[o + 3] = sh * 42; // drop shadow (rgb stays 0)
          }
        }
      }
      this.cache.paper.set(key, out);
    }
    ctx.putImageData(out, 0, 0);
    this.paperTex.refresh();
  }

  /** Colour and opacity of colony k's ink from its fill (reserve ÷ cap). Cheap: per-frame tint. */
  setInk(k: number, fill: number): void {
    const layer = this.layers[k];
    if (!layer) return;
    // Quantized so the tint changes in visible steps, not every frame.
    const q = Math.round(Math.max(0, Math.min(1, fill)) * 20) / 20;
    const tint = inkTint(k, q);
    const alpha = inkAlpha(q);
    if (tint !== layer.tint) layer.img.setTint((layer.tint = tint));
    if (alpha !== layer.alpha) layer.img.setAlpha((layer.alpha = alpha));
  }

  /** Fade every ink layer (menu backdrop). */
  setLayersAlpha(mul: number): void {
    for (const l of this.layers) l.img.setAlpha(l.alpha * mul);
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

  /** Redraw everything (start of a match). */
  fullRedraw(src: InkSource): void {
    const all: number[] = [];
    for (let i = 0; i < this.map.width * this.map.height; i++) all.push(i);
    for (const c of src.dirty) if (this.freshStep(src, c) > 0) this.fresh.set(c, this.freshStep(src, c));
    src.dirty.length = 0;
    this.redrawCells(src, all);
  }

  /** Drain the sim's dirty list and settle fresh cells. Call once per frame; returns cells redrawn. */
  sync(src: InkSource): number {
    const list: number[] = [];
    const w = this.map.width;
    const h = this.map.height;
    const add3x3 = (c: number): void => {
      const x = c % w;
      const y = (c - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (this.mark[n]) continue;
          this.mark[n] = 1;
          list.push(n);
        }
      }
    };
    for (const c of src.dirty) {
      const step = this.freshStep(src, c);
      if (step > 0) this.fresh.set(c, step);
      add3x3(c);
    }
    src.dirty.length = 0;
    // Fresh cells whose darkness step changed: neighbours' jittered pixels sample them too.
    for (const [c, drawn] of this.fresh) {
      const step = this.freshStep(src, c);
      if (step === drawn) continue;
      if (step === 0) this.fresh.delete(c);
      else this.fresh.set(c, step);
      add3x3(c);
    }
    for (const c of list) this.mark[c] = 0;
    if (list.length) this.redrawCells(src, list);
    return list.length;
  }

  private freshStep(src: InkSource, cell: number): number {
    const age = src.tickCount - src.changedAt[cell]!;
    return Math.max(0, Math.min(FRESH_STEPS, FRESH_STEPS - Math.floor(age / 2)));
  }

  private redrawCells(src: InkSource, cells: readonly number[]): void {
    const w = this.map.width;
    const mh = this.map.height;
    const iw = this.iw;
    const owner = src.owner;
    const land = this.map.land;
    const acc = this.acc;
    const pos = this.cache.pos;
    const grain = this.cache.grain;
    const gapSlot = this.layers.length + 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;
    for (const c of cells) {
      const cx = c % w;
      const cy = (c - cx) / w;
      const x0 = cx * INK_RES;
      const y0 = cy * INK_RES;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x0 + INK_RES > maxX) maxX = x0 + INK_RES;
      if (y0 + INK_RES > maxY) maxY = y0 + INK_RES;
      for (let py = y0; py < y0 + INK_RES; py++) {
        for (let px = x0; px < x0 + INK_RES; px++) {
          const i = py * iw + px;
          const u = pos[i * 2]!;
          const v = pos[i * 2 + 1]!;
          const ux = Math.floor(u);
          const vy = Math.floor(v);
          acc.fill(0);
          let freshW = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = ux + dx;
              const y = vy + dy;
              const ddx = u - (x + 0.5);
              const ddy = v - (y + 0.5);
              const k = kernel(ddx * ddx + ddy * ddy);
              if (k === 0) continue;
              let slot = gapSlot;
              if (x >= 0 && y >= 0 && x < w && y < mh) {
                const cc = y * w + x;
                if (land[cc]) {
                  slot = Math.min(gapSlot - 1, owner[cc]! + 1);
                  if (slot > 0) freshW += k * this.freshStep(src, cc);
                }
              }
              acc[slot] = acc[slot]! + k;
            }
          }
          let best = 0;
          let second = 0;
          let win = 0;
          for (let k = 0; k <= gapSlot; k++) {
            const a = acc[k]!;
            if (a > best) {
              second = best;
              best = a;
              win = k;
            } else if (a > second) second = a;
          }
          const own = win === 0 || win === gapSlot ? -1 : win - 1;
          const prev = this.pixOwner[i]!;
          if (prev >= 0 && prev !== own) {
            const l = this.layers[prev]!;
            l.data.data[i * 4 + 3] = 0;
            l.dirty = true;
          }
          this.pixOwner[i] = own;
          if (own < 0) continue;
          const layer = this.layers[own]!;
          const d = layer.data.data;
          const o = i * 4;
          // Border = narrow winning margin: ink pools there. Fresh ink is darker. Fibre grain and
          // the colony's texture pattern give the ink body.
          const margin = (best - second) / best;
          const edge = margin < 0.45 ? 1 - margin / 0.45 : 0;
          const f = Math.min(1, freshW / best / FRESH_STEPS);
          const g = grain[i]! / 255;
          const shade = 1 - Math.min(0.6, edge * 0.3 + f * 0.42) - g * 0.07 - pattern(own, px, py) * 0.13;
          const s = Math.round(255 * shade);
          d[o] = s;
          d[o + 1] = s;
          d[o + 2] = s;
          const rim = second === acc[0] && margin < 0.12 ? margin / 0.12 : 1;
          d[o + 3] = Math.min(255, (205 + edge * 40 + f * 30 - g * 22) * (0.35 + 0.65 * rim));
          layer.dirty = true;
        }
      }
    }
    if (maxX < 0) return;
    for (const l of this.layers) {
      if (!l.dirty) continue;
      l.dirty = false;
      l.tex.getContext().putImageData(l.data, 0, 0, minX, minY, maxX - minX, maxY - minY);
      l.tex.refresh();
    }
  }

  destroy(): void {
    if (this.paper.active) this.paper.destroy();
    if (this.scene.textures.exists(this.paperTex.key)) this.scene.textures.remove(this.paperTex.key);
    for (const l of this.layers) {
      if (l.img.active) l.img.destroy();
      if (this.scene.textures.exists(l.tex.key)) this.scene.textures.remove(l.tex.key);
    }
  }
}
