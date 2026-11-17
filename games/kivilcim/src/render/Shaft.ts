/**
 * Draws a Track in world space (inside the scrolling world container; local y = -worldY).
 *
 * Static geometry (walls, spike blocks, beat lines) is baked once per CHUNK_H of climb into a
 * canvas texture and shown as one image per chunk; chunks are recycled from a fixed pool and at
 * most one is baked per frame, ahead of the screen. The start of the track has its own permanent
 * chunks, so a retry shows instantly without baking anything. Moving and collectable things
 * (bars, gems, gates, finish line) are pooled sprites. Nothing here allocates per frame.
 */
import Phaser from 'phaser';
import { BEAT_PX, SHAFT_W, STEP_PX } from '../sim/constants';
import { barCentre, lowerBound, segmentAt, wallXAt, type GateKind, type Track } from '../sim/track';
import { GATE_COLORS, PALETTE, type Palette } from '../textures';
import { css } from './canvasArt';

export const CHUNK_H = 512;
/** Permanent chunks for the start of every track: indices -1..START_CHUNKS-2. */
const START_CHUNKS = 4;
const POOL = 6;
/** World px visible below / above the spark. */
export const VIEW_BELOW = 380;
export const VIEW_ABOVE = 1000;

interface Slot {
  key: string;
  tex: Phaser.Textures.CanvasTexture;
  img: Phaser.GameObjects.Image;
  /** Chunk index baked into this slot, or NaN. */
  index: number;
}

interface BarVis {
  root: Phaser.GameObjects.Container;
  l: Phaser.GameObjects.Image;
  m: Phaser.GameObjects.Image;
  r: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
}

interface GateVis {
  band: Phaser.GameObjects.TileSprite;
  glow: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  idx: number;
}

let uid = 0;

export class ShaftView {
  private track!: Track;
  private pal!: Palette;
  private readonly start: Slot[] = [];
  private readonly pool: Slot[] = [];
  private readonly gemPool: Phaser.GameObjects.Image[] = [];
  private readonly gemGlow: Phaser.GameObjects.Image[] = [];
  private readonly barPool: BarVis[] = [];
  private readonly gatePool: GateVis[] = [];
  private finishBand!: Phaser.GameObjects.TileSprite;
  private finishGlow!: Phaser.GameObjects.Image;
  private finishText!: Phaser.GameObjects.Text;
  /** Bake requests are served one per frame. */
  private pending = -1;
  private readonly id = uid++;
  gateLabel: (k: GateKind) => string = (k) => k;
  finishLabel = 'FINISH';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: Phaser.GameObjects.Container,
  ) {
    const mk = (name: string): Slot => {
      const key = `chunk-${this.id}-${name}`;
      const tex = scene.textures.createCanvas(key, SHAFT_W, CHUNK_H)!;
      const img = scene.add.image(0, 0, key).setOrigin(0, 0).setVisible(false);
      world.add(img);
      return { key, tex, img, index: NaN };
    };
    for (let i = 0; i < START_CHUNKS; i++) this.start.push(mk(`s${i}`));
    for (let i = 0; i < POOL; i++) this.pool.push(mk(`p${i}`));

    for (let i = 0; i < 6; i++) {
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setTint(PALETTE.gem).setVisible(false);
      const g = scene.add.image(0, 0, 'gem').setVisible(false);
      world.add([glow, g]);
      this.gemGlow.push(glow);
      this.gemPool.push(g);
    }
    for (let i = 0; i < 6; i++) {
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
      const l = scene.add.image(0, 0, 'bar-cap');
      const m = scene.add.image(0, 0, 'bar-mid');
      const r = scene.add.image(0, 0, 'bar-cap');
      const root = scene.add.container(0, 0, [glow, l, m, r]).setVisible(false);
      world.add(root);
      this.barPool.push({ root, l, m, r, glow });
    }
    for (let i = 0; i < 3; i++) {
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const band = scene.add.tileSprite(0, 0, 400, 72, 'gate-band').setVisible(false);
      const text = scene.add
        .text(0, 0, '', { fontFamily: 'Nunito, sans-serif', fontSize: '44px', fontStyle: '800', color: '#ffffff', stroke: css(PALETTE.ink), strokeThickness: 10 })
        .setOrigin(0.5)
        .setVisible(false);
      world.add([glow, band, text]);
      this.gatePool.push({ band, glow, text, idx: -1 });
    }
    this.finishGlow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.finishBand = scene.add.tileSprite(0, 0, 400, 64, 'finish-band').setVisible(false);
    this.finishText = scene.add
      .text(0, 0, '', { fontFamily: 'Nunito, sans-serif', fontSize: '40px', fontStyle: '800', color: '#ffffff', stroke: css(PALETTE.ink), strokeThickness: 10 })
      .setOrigin(0.5)
      .setVisible(false);
    world.add([this.finishGlow, this.finishBand, this.finishText]);
  }

  /** Show a new track: re-bakes the permanent start chunks (a one-off cost per track). */
  setTrack(track: Track, pal: Palette): void {
    this.track = track;
    this.pal = pal;
    for (const s of this.pool) {
      s.index = NaN;
      s.img.setVisible(false);
    }
    this.start.forEach((s, i) => this.bake(s, i - 1));
    this.pending = -1;
  }

  /** Palette change mid-track (endless): only chunks baked from now on use it. */
  setPalette(pal: Palette): void {
    this.pal = pal;
  }

  /**
   * Place everything for a spark at world height sy, sim time t. gemMask hides taken gems.
   * Returns the time spent baking (ms), for the frame-time report.
   */
  update(sy: number, t: number, gemMask: number, pulse: number): void {
    const lo = sy - VIEW_BELOW;
    const hi = sy + VIEW_ABOVE;
    const first = Math.floor(lo / CHUNK_H);
    const last = Math.floor(hi / CHUNK_H);
    // Release pool chunks out of view.
    for (const s of this.pool) {
      if (s.index === s.index && (s.index < first || s.index > last + 1)) {
        s.index = NaN;
        s.img.setVisible(false);
      }
    }
    for (const s of this.start) s.img.setVisible(s.index >= first && s.index <= last);
    let baked = false;
    for (let k = first; k <= last + 1; k++) {
      if (k < START_CHUNKS - 1) continue;
      let slot: Slot | null = null;
      for (const s of this.pool) if (s.index === k) slot = s;
      if (slot) {
        slot.img.setVisible(k <= last);
        continue;
      }
      // Bake at most one chunk per frame; on-screen chunks first, then one ahead.
      if (baked) continue;
      let free: Slot | null = null;
      for (const s of this.pool) if (s.index !== s.index) free = s;
      if (!free) continue;
      this.bake(free, k);
      free.img.setVisible(k <= last);
      baked = true;
    }
    void this.pending;

    this.placeGems(lo, hi, gemMask, pulse);
    this.placeBars(lo, hi, t);
    this.placeGates(lo, hi, pulse);
    this.placeFinish(lo, hi, pulse);
  }

  private placeGems(lo: number, hi: number, mask: number, pulse: number): void {
    const gems = this.track.gems;
    let n = 0;
    for (let i = lowerBound(gems, lo); i < gems.length && n < this.gemPool.length; i++) {
      const g = gems[i]!;
      if (g.y > hi) break;
      if (mask & (1 << i)) continue;
      const img = this.gemPool[n]!;
      const glow = this.gemGlow[n]!;
      const bob = Math.sin(this.scene.time.now / 260 + i) * 5;
      img.setVisible(true).setPosition(g.x, -g.y + bob).setScale(0.9 + pulse * 0.12);
      glow.setVisible(true).setPosition(g.x, -g.y + bob).setAlpha(0.55 + pulse * 0.3);
      n++;
    }
    for (; n < this.gemPool.length; n++) {
      this.gemPool[n]!.setVisible(false);
      this.gemGlow[n]!.setVisible(false);
    }
  }

  private placeBars(lo: number, hi: number, t: number): void {
    const bars = this.track.bars;
    let n = 0;
    for (let i = lowerBound(bars, lo - 40); i < bars.length && n < this.barPool.length; i++) {
      const b = bars[i]!;
      if (b.y > hi + 40) break;
      const v = this.barPool[n++]!;
      const cx = barCentre(b, t);
      const w = b.half * 2;
      v.root.setVisible(true).setPosition(cx, -b.y);
      const s = (b.thick * 2 + 16) / 40;
      v.l.setPosition(-b.half, 0).setScale(s).setTint(this.pal.edge);
      v.r.setPosition(b.half, 0).setScale(s).setTint(this.pal.edge);
      v.m.setPosition(0, 0).setDisplaySize(w, 40 * s).setTint(this.pal.edge);
      v.glow.setDisplaySize(w + 140, 120).setTint(this.pal.edge);
    }
    for (; n < this.barPool.length; n++) this.barPool[n]!.root.setVisible(false);
  }

  private corridorAt(y: number): [number, number] {
    const tr = this.track;
    const i = segmentAt(tr.wy, y);
    return [wallXAt(tr.wy, tr.lx, i, y), wallXAt(tr.wy, tr.rx, i, y)];
  }

  private placeGates(lo: number, hi: number, pulse: number): void {
    const gates = this.track.gates;
    let n = 0;
    for (let i = lowerBound(gates, lo - 60); i < gates.length && n < this.gatePool.length; i++) {
      const g = gates[i]!;
      if (g.y > hi + 60) break;
      const v = this.gatePool[n++]!;
      const [l, r] = this.corridorAt(g.y);
      const color = GATE_COLORS[g.kind];
      v.band.setVisible(true).setPosition((l + r) / 2, -g.y).setSize(r - l, 72).setTint(color);
      v.band.tilePositionX = this.scene.time.now / 6;
      if (g.kind === 'slow') v.band.setFlipY(true);
      else v.band.setFlipY(false);
      v.glow.setVisible(true).setPosition((l + r) / 2, -g.y).setDisplaySize(r - l + 160, 220).setTint(color).setAlpha(0.55 + 0.35 * pulse);
      if (v.idx !== i) {
        v.idx = i;
        v.text.setText(this.gateLabel(g.kind));
      }
      v.text.setVisible(true).setPosition((l + r) / 2, -g.y - 66).setColor(css(color)).setScale(1 + pulse * 0.08);
    }
    for (; n < this.gatePool.length; n++) {
      const v = this.gatePool[n]!;
      v.band.setVisible(false);
      v.glow.setVisible(false);
      v.text.setVisible(false);
    }
  }

  private placeFinish(lo: number, hi: number, pulse: number): void {
    const y = this.track.length;
    const show = y >= lo - 80 && y <= hi + 80;
    this.finishBand.setVisible(show);
    this.finishGlow.setVisible(show);
    this.finishText.setVisible(show);
    if (!show) return;
    const [l, r] = this.corridorAt(y);
    this.finishBand.setPosition((l + r) / 2, -y).setSize(r - l, 64);
    this.finishBand.tilePositionX = this.scene.time.now / 10;
    this.finishGlow.setPosition((l + r) / 2, -y).setDisplaySize(r - l + 200, 300).setTint(PALETTE.gold).setAlpha(0.7 + pulse * 0.3);
    if (this.finishText.text !== this.finishLabel) this.finishText.setText(this.finishLabel);
    this.finishText.setPosition((l + r) / 2, -y - 70).setColor(css(PALETTE.gold)).setScale(1 + pulse * 0.1);
  }

  /** Bake chunk k (world y in [k·H, (k+1)·H)) into a slot. */
  private bake(slot: Slot, k: number): void {
    slot.index = k;
    const y0 = k * CHUNK_H;
    const y1 = y0 + CHUNK_H;
    slot.img.setPosition(0, -y1);
    const c = slot.tex.context;
    const tr = this.track;
    const pal = this.pal;
    c.clearRect(0, 0, SHAFT_W, CHUNK_H);
    const row = (y: number): number => y1 - y;
    const pad = 60;
    const from = Math.max(0, segmentAt(tr.wy, y0 - pad));
    const to = Math.min(tr.wy.length - 2, segmentAt(tr.wy, y1 + pad));

    const wallPath = (xs: Float64Array, edgeX: number): void => {
      c.beginPath();
      c.moveTo(edgeX, row(y0 - pad));
      c.lineTo(wallXAt(tr.wy, xs, from, y0 - pad), row(y0 - pad));
      for (let i = from + 1; i <= to; i++) c.lineTo(xs[i]!, row(tr.wy[i]!));
      c.lineTo(wallXAt(tr.wy, xs, to, y1 + pad), row(y1 + pad));
      c.lineTo(edgeX, row(y1 + pad));
      c.closePath();
    };
    const edgePath = (xs: Float64Array): void => {
      c.beginPath();
      c.moveTo(wallXAt(tr.wy, xs, from, y0 - pad), row(y0 - pad));
      for (let i = from + 1; i <= to; i++) c.lineTo(xs[i]!, row(tr.wy[i]!));
      c.lineTo(wallXAt(tr.wy, xs, to, y1 + pad), row(y1 + pad));
    };

    // Wall bodies: deep at the screen edge, lighter toward the shaft.
    for (const [xs, edgeX] of [
      [tr.lx, -10],
      [tr.rx, SHAFT_W + 10],
    ] as const) {
      const grad = c.createLinearGradient(edgeX < 0 ? 0 : SHAFT_W, 0, SHAFT_W / 2, 0);
      grad.addColorStop(0, css(pal.wallDeep));
      grad.addColorStop(1, css(pal.wall));
      wallPath(xs, edgeX);
      c.fillStyle = grad;
      c.fill();
      // Diagonal stripes and climb ticks, clipped to the wall.
      c.save();
      wallPath(xs, edgeX);
      c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 14;
      const off = y0 % 64;
      for (let s = -CHUNK_H; s < SHAFT_W + CHUNK_H; s += 64) {
        c.beginPath();
        c.moveTo(s - off, CHUNK_H + 10);
        c.lineTo(s - off + CHUNK_H + 20, -10);
        c.stroke();
      }
      c.restore();
    }

    // Spike blocks.
    const blocks = tr.blocks;
    const diamond = (b: { x: number; y: number; s: number }, grow: number): void => {
      const r = row(b.y);
      c.beginPath();
      c.moveTo(b.x, r - b.s - grow);
      c.lineTo(b.x + b.s + grow, r);
      c.lineTo(b.x, r + b.s + grow);
      c.lineTo(b.x - b.s - grow, r);
      c.closePath();
    };
    const inRange: { x: number; y: number; s: number }[] = [];
    for (let i = lowerBound(blocks, y0 - 100); i < blocks.length && blocks[i]!.y < y1 + 100; i++) inRange.push(blocks[i]!);
    for (const b of inRange) {
      // Spikes first (behind the body): two per face, along the face normal.
      c.fillStyle = css(pal.edge, 1);
      const r = row(b.y);
      const fd = b.s * Math.SQRT1_2;
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const tx = -ny;
        const ty = nx;
        for (const o of [-0.3 * b.s, 0.3 * b.s]) {
          const fx = b.x + nx * (fd - 2) + tx * o;
          const fy = r + ny * (fd - 2) + ty * o;
          c.beginPath();
          c.moveTo(fx + tx * 9, fy + ty * 9);
          c.lineTo(fx + nx * 18, fy + ny * 18);
          c.lineTo(fx - tx * 9, fy - ty * 9);
          c.closePath();
          c.fill();
        }
      }
      diamond(b, 0);
      c.fillStyle = css(pal.wall);
      c.fill();
    }

    // Beat lines across the shaft: the scroll reads at any speed.
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(255,255,255,0.13)';
    for (let y = Math.ceil(y0 / BEAT_PX) * BEAT_PX; y < y1; y += BEAT_PX) {
      const i = segmentAt(tr.wy, y);
      c.beginPath();
      c.moveTo(wallXAt(tr.wy, tr.lx, i, y), row(y));
      c.lineTo(wallXAt(tr.wy, tr.rx, i, y), row(y));
      c.stroke();
    }

    // Neon edges with a layered glow (cheaper than shadowBlur).
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const glowStroke = (path: () => void): void => {
      for (const [w, a, col] of [
        [26, 0.14, pal.edge],
        [13, 0.35, pal.edge],
        [6, 1, pal.edge],
        [2, 0.95, 0xffffff],
      ] as const) {
        path();
        c.lineWidth = w;
        c.strokeStyle = css(col, a);
        c.stroke();
      }
    };
    glowStroke(() => edgePath(tr.lx));
    glowStroke(() => edgePath(tr.rx));
    for (const b of inRange) glowStroke(() => diamond(b, 0));

    // Climb ticks just inside each wall edge, every 16th step.
    c.lineWidth = 5;
    c.strokeStyle = css(pal.edge, 0.4);
    for (let y = Math.ceil(y0 / STEP_PX) * STEP_PX; y < y1; y += STEP_PX) {
      const i = segmentAt(tr.wy, y);
      const l = wallXAt(tr.wy, tr.lx, i, y);
      const r = wallXAt(tr.wy, tr.rx, i, y);
      c.beginPath();
      c.moveTo(l - 34, row(y));
      c.lineTo(l - 16, row(y));
      c.moveTo(r + 16, row(y));
      c.lineTo(r + 34, row(y));
      c.stroke();
    }
    slot.tex.refresh();
  }

  destroy(): void {
    for (const s of [...this.start, ...this.pool]) this.scene.textures.remove(s.key);
  }
}
