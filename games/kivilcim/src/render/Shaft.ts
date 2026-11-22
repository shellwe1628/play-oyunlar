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
const POOL = 10;
/** World px visible below / above the spark in the normal view (twists widen the range). */
export const VIEW_BELOW = 380;
export const VIEW_ABOVE = 1000;
/**
 * Wall filler beside the shaft (seen only when a twist shows what lies outside x 0..720): a flat
 * wall-coloured quad per side, and the chunks' diagonal stripes as plain images of one 512 px
 * tile, kept on the chunks' 64 px stripe lattice.
 *
 * Note for whoever tests this headless: Chromium's software GL (SwiftShader) drops screen-aligned
 * blocks out of rotated quads when these large quads are in the same frame (holes in the walls
 * under a lean); the same frames are complete on a real GPU (D3D11) and on WARP. The round's
 * screenshots were taken with --use-angle=d3d11.
 */
const FILL_TILE = 512;
const FILL_COLS = 2;
const FILL_ROWS = 7;
const FILL_W = FILL_TILE * FILL_COLS;
const FILL_H = FILL_TILE * FILL_ROWS;

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
  glint: Phaser.GameObjects.Image;
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
  private readonly gemGlint: Phaser.GameObjects.Image[] = [];
  private readonly auras: Phaser.GameObjects.Image[] = [];
  private readonly finishRings: Phaser.GameObjects.Image[] = [];
  private readonly finishBeams: Phaser.GameObjects.Image[] = [];
  /** Spark position (world) and gates already crossed: objects react to them (read-only). */
  sparkX = 360;
  gatesPassed = 0;
  /** Presentation switch (off = the plain look; the sim never depends on it). */
  fx = true;
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
  /** Endless has no finish line. */
  showFinish = true;
  /** Screen y of the spark and the bottom of the HUD band: labels fade out under the band. */
  sparkScreenY = 930;
  hudBottom = 300;
  /** The stretch of the track to draw, in world px behind and ahead of the spark. */
  viewBelow = VIEW_BELOW;
  viewAbove = VIEW_ABOVE;
  /**
   * View twists: screen y of a world point (labels fade under the HUD band wherever the view
   * puts them), and the local transform that keeps label text upright and readable when the
   * view is mirrored.
   */
  screenY: ((wx: number, wy: number) => number) | null = null;
  labelRot = 0;
  labelFlipY = 1;
  /** Distance of a gate's label past its band (world px). */
  labelGap = 66;
  private readonly fills: Phaser.GameObjects.Image[] = [];
  private readonly fillStripes: Phaser.GameObjects.Image[] = [];
  private sy = 0;
  private finishBurstAt = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly world: Phaser.GameObjects.Container,
  ) {
    // Wall filler either side of the shaft, behind everything: plain wall with the chunks'
    // diagonal stripes, so a leaning, zoomed-out or sideways view never shows a hole.
    for (let i = 0; i < 2; i++) {
      const fill = scene.add.image(0, 0, 'flash').setOrigin(0, 0).setDisplaySize(FILL_W, FILL_H);
      world.add(fill);
      this.fills.push(fill);
    }
    for (let i = 0; i < 2 * FILL_COLS * FILL_ROWS; i++) {
      const tile = scene.add.image(0, 0, 'wall-fill').setOrigin(0, 0);
      world.add(tile);
      this.fillStripes.push(tile);
    }
    const mk = (name: string): Slot => {
      const key = `chunk-${this.id}-${name}`;
      const tex = scene.textures.createCanvas(key, SHAFT_W, CHUNK_H)!;
      const img = scene.add.image(0, 0, key).setOrigin(0, 0).setVisible(false);
      world.add(img);
      return { key, tex, img, index: NaN };
    };
    for (let i = 0; i < START_CHUNKS; i++) this.start.push(mk(`s${i}`));
    for (let i = 0; i < POOL; i++) this.pool.push(mk(`p${i}`));

    for (let i = 0; i < 8; i++) {
      const aura = scene.add.image(0, 0, 'block-aura').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      world.add(aura);
      this.auras.push(aura);
    }
    for (let i = 0; i < 6; i++) {
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setScale(1.3).setTint(PALETTE.gem).setVisible(false);
      const g = scene.add.image(0, 0, 'gem').setVisible(false);
      const glint = scene.add.image(0, 0, 'w-star4').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      world.add([glow, g, glint]);
      this.gemGlow.push(glow);
      this.gemPool.push(g);
      this.gemGlint.push(glint);
    }
    for (let i = 0; i < 6; i++) {
      const glow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
      const l = scene.add.image(0, 0, 'bar-cap');
      const m = scene.add.image(0, 0, 'bar-mid');
      const r = scene.add.image(0, 0, 'bar-cap');
      const glint = scene.add.image(0, 0, 'w-star4').setBlendMode(Phaser.BlendModes.ADD).setScale(0.55);
      const root = scene.add.container(0, 0, [glow, l, m, r, glint]).setVisible(false);
      world.add(root);
      this.barPool.push({ root, l, m, r, glow, glint });
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
    for (let i = 0; i < 2; i++) {
      const ring = scene.add.image(0, 0, 'ring-burst').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const beam = scene.add.image(0, 0, 'w-beam').setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      world.add([ring, beam]);
      this.finishRings.push(ring);
      this.finishBeams.push(beam);
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
    this.finishBurstAt = -1;
    for (const f of this.fills) f.setTint(pal.wallDeep);
    for (const s of this.pool) {
      s.index = NaN;
      s.img.setVisible(false);
    }
    this.start.forEach((s, i) => this.bake(s, i - 1));
    this.pending = -1;
  }

  /**
   * Swap in a longer version of the same track (endless grows ahead): same geometry where they
   * overlap, so nothing is re-baked.
   */
  replaceTrack(track: Track): void {
    this.track = track;
  }

  /** Palette change mid-track (endless): only chunks baked from now on use it. */
  setPalette(pal: Palette): void {
    this.pal = pal;
    for (const f of this.fills) f.setTint(pal.wallDeep);
  }

  /**
   * Place everything for a spark drawn at world height sy; t is the sim time the spark is drawn
   * at (interpolated like the spark, so bars and spark agree). taken[i] hides taken gems.
   */
  update(sy: number, t: number, taken: Uint8Array, pulse: number): void {
    this.sy = sy;
    const lo = sy - this.viewBelow;
    const hi = sy + this.viewAbove;
    // The filler follows the spark in steps of 64 px, so its stripes stay in line with the
    // stripes baked into the chunks.
    const fy = -(Math.floor((sy + FILL_H * 0.7) / 64) * 64);
    let n = 0;
    for (let i = 0; i < 2; i++) {
      const fx = i === 0 ? -FILL_W : SHAFT_W;
      this.fills[i]!.setPosition(i === 0 ? fx + 2 : fx - 2, fy);
      // Stripe tiles on the 64 px lattice (the right side starts at 704, under the last chunk px).
      const sx0 = i === 0 ? -FILL_W : SHAFT_W - 16;
      for (let c = 0; c < FILL_COLS; c++) for (let r = 0; r < FILL_ROWS; r++) this.fillStripes[n++]!.setPosition(sx0 + c * FILL_TILE, fy + r * FILL_TILE);
    }
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

    this.placeGems(lo, hi, taken, pulse);
    this.placeAuras(lo, hi, pulse);
    this.placeBars(lo, hi, t);
    this.placeGates(lo, hi, pulse);
    this.placeFinish(lo, hi, pulse);
  }

  private placeGems(lo: number, hi: number, taken: Uint8Array, pulse: number): void {
    const gems = this.track.gems;
    let n = 0;
    for (let i = lowerBound(gems, lo); i < gems.length && n < this.gemPool.length; i++) {
      const g = gems[i]!;
      if (g.y > hi) break;
      if (taken[i]) continue;
      const img = this.gemPool[n]!;
      const glow = this.gemGlow[n]!;
      const now = this.scene.time.now;
      const bob = Math.sin(now / 260 + i) * 5;
      // React as the spark approaches: swell, brighten, lean toward it (drawing only).
      const dx = this.sparkX - g.x;
      const dy = this.sy - g.y;
      const near = this.fx ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 260) : 0;
      const lean = near * 8 * Math.sign(dx);
      const spin = this.fx ? Math.max(0.25, Math.abs(Math.cos(now / 380 + i))) : 1;
      const sc = 0.9 + pulse * 0.12 + near * 0.35;
      img.setVisible(true).setPosition(g.x + lean, -g.y + bob).setScale(sc * spin, sc);
      glow.setVisible(true).setPosition(g.x + lean, -g.y + bob).setAlpha(0.55 + pulse * 0.3 + near * 0.4).setScale(1.3 + near);
      const glint = this.gemGlint[n]!;
      const gp = ((now / 1300 + i * 0.37) % 1) * 6;
      glint.setVisible(this.fx && gp < 1).setPosition(g.x + lean + 10, -g.y + bob - 14).setScale(0.4 + Math.sin(gp * Math.PI) * 0.7).setAngle(gp * 90);
      n++;
    }
    for (; n < this.gemPool.length; n++) {
      this.gemPool[n]!.setVisible(false);
      this.gemGlow[n]!.setVisible(false);
      this.gemGlint[n]!.setVisible(false);
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
      // Drawn 2 px outside the lethal capsule (cap texture radius 18 at scale 1).
      const s = (b.thick + 2) / 18;
      v.l.setPosition(-b.half, 0).setScale(s).setTint(this.pal.edge);
      v.r.setPosition(b.half, 0).setScale(s).setTint(this.pal.edge);
      v.m.setPosition(0, 0).setDisplaySize(w, 40 * s).setTint(this.pal.edge);
      const now = this.scene.time.now;
      v.glow.setDisplaySize(w + 140, 120).setTint(this.pal.edge).setAlpha(this.fx ? 0.7 + 0.25 * Math.sin(now / 180 + i) : 0.85);
      // A glint slides along the bar (idle motion; the capsule itself never changes).
      const gp = ((now / 900 + i * 0.3) % 1) * 2 - 1;
      v.glint.setVisible(this.fx).setPosition(gp * b.half, 0).setAngle(now / 4);
    }
    for (; n < this.barPool.length; n++) this.barPool[n]!.root.setVisible(false);
  }

  /** Rotating auras around visible spike blocks (light, behind nothing lethal). */
  private placeAuras(lo: number, hi: number, pulse: number): void {
    const blocks = this.track.blocks;
    let n = 0;
    if (this.fx) {
      const now = this.scene.time.now;
      for (let i = lowerBound(blocks, lo - 80); i < blocks.length && n < this.auras.length; i++) {
        const b = blocks[i]!;
        if (b.y > hi + 80) break;
        const a = this.auras[n++]!;
        a.setVisible(true).setPosition(b.x, -b.y).setRotation(now / 1400 + i).setScale((b.s / 44) * (0.95 + 0.12 * pulse)).setTint(this.pal.edge).setAlpha(0.35 + 0.25 * pulse);
      }
    }
    for (; n < this.auras.length; n++) this.auras[n]!.setVisible(false);
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
      const tex = g.kind === 'unflip' ? 'gate-band-plain' : g.kind === 'flip' ? 'gate-band-flip' : 'gate-band';
      if (v.band.texture.key !== tex) v.band.setTexture(tex);
      // Each kind moves its own way before the crossing; crossed gates dim and thin out.
      const now = this.scene.time.now;
      const passed = i < this.gatesPassed;
      const k = !this.fx ? 0 : g.kind === 'fast' ? now / 2 : g.kind === 'slow' ? now / 30 : g.kind === 'flip' ? Math.sin(now / 200) * 60 : now / 8;
      let sy = 1;
      if (this.fx && !passed) {
        if (g.kind === 'mini') sy = 0.75 + 0.25 * Math.abs(Math.sin(now / 180));
        else if (g.kind === 'big') sy = 1 + 0.2 * Math.abs(Math.sin(now / 180));
      }
      v.band.setVisible(true).setPosition((l + r) / 2, -g.y).setSize(r - l, 72).setTint(color).setScale(1, passed ? 0.4 : sy).setAlpha(passed ? 0.35 : 1);
      v.band.tilePositionX = k;
      if (g.kind === 'slow') v.band.setFlipY(true);
      else v.band.setFlipY(false);
      v.glow.setVisible(true).setPosition((l + r) / 2, -g.y).setDisplaySize(r - l + 160, 220).setTint(color).setAlpha(passed ? 0.15 : 0.55 + 0.35 * pulse);
      if (v.idx !== i) {
        v.idx = i;
        v.text.setText(this.gateLabel(g.kind));
      }
      const ls = 1 + pulse * 0.08;
      v.text
        .setVisible(true)
        .setPosition((l + r) / 2, -g.y - this.labelGap)
        .setColor(css(color))
        .setScale(ls, ls * this.labelFlipY)
        .setRotation(this.labelRot)
        .setAlpha(this.labelAlpha((l + r) / 2, g.y + this.labelGap));
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
    // The finish announces itself from far off: halos and light beams build up as it nears.
    const toGo = y - this.sy;
    const build = this.showFinish && this.fx && toGo < 1600 && toGo > -400 ? Math.min(1, 1 - toGo / 1600) : 0;
    for (let i = 0; i < 2; i++) {
      const ring = this.finishRings[i]!;
      const beam = this.finishBeams[i]!;
      ring.setVisible(build > 0);
      beam.setVisible(build > 0);
      if (build <= 0) continue;
      const [l0, r0] = this.corridorAt(Math.min(y, Math.max(lo, y)));
      const now = this.scene.time.now;
      ring.setPosition((l0 + r0) / 2, -y).setScale((1.4 + i * 0.9) * (0.7 + 0.3 * pulse) * (0.6 + build * 0.6)).setRotation(now / (900 + i * 400) * (i ? -1 : 1)).setAlpha(0.35 * build).setTint(i ? PALETTE.gold : 0xffffff);
      beam.setPosition(i ? r0 - 40 : l0 + 40, -y - 300).setScale(1.6, 3.2 + pulse).setAlpha(0.45 * build).setTint(PALETTE.gold);
    }
    const show = this.showFinish && y >= lo - 80 && y <= hi + 80;
    this.finishBand.setVisible(show);
    this.finishGlow.setVisible(show);
    this.finishText.setVisible(show);
    if (!show) return;
    const [l, r] = this.corridorAt(y);
    this.finishBand.setPosition((l + r) / 2, -y).setSize(r - l, 64);
    this.finishBand.tilePositionX = this.scene.time.now / 10;
    this.finishGlow.setPosition((l + r) / 2, -y).setDisplaySize(r - l + 200, 300).setTint(PALETTE.gold).setAlpha(0.7 + pulse * 0.3);
    if (this.finishText.text !== this.finishLabel) this.finishText.setText(this.finishLabel);
    // On the crossing the label bursts up and away instead of sitting under the spark.
    const since = this.finishBurstAt < 0 ? -1 : this.scene.time.now - this.finishBurstAt;
    const k = since < 0 ? 0 : Math.min(1, since / 420);
    this.finishText
      .setPosition((l + r) / 2, -y - 70 - k * 520)
      .setColor(css(PALETTE.gold))
      .setScale(1 + pulse * 0.1 + k * 0.8)
      .setAlpha((1 - k) * this.labelAlpha((l + r) / 2, y + 70));
  }

  /** The finish label flies off (call on the crossing). */
  burstFinishLabel(): void {
    this.finishBurstAt = this.scene.time.now;
  }

  /** World label at height wy: fades as it slides under the HUD band. */
  private labelAlpha(wx: number, wy: number): number {
    const screenY = this.screenY ? this.screenY(wx, wy) : this.sparkScreenY - (wy - this.sy);
    return Math.min(1, Math.max(0, (screenY - this.hudBottom) / 90));
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
      // Teeth along each face, reaching 4 px past the lethal diamond (what you see is what kills).
      c.fillStyle = css(pal.edge, 1);
      const r = row(b.y);
      const fd = b.s * Math.SQRT1_2;
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const tx = -ny;
        const ty = nx;
        for (const o of [-0.42 * b.s, 0, 0.42 * b.s]) {
          const fx = b.x + nx * fd + tx * o;
          const fy = r + ny * fd + ty * o;
          c.beginPath();
          c.moveTo(fx + tx * 6 - nx * 2, fy + ty * 6 - ny * 2);
          c.lineTo(fx + nx * 4, fy + ny * 4);
          c.lineTo(fx - tx * 6 - nx * 2, fy - ty * 6 - ny * 2);
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
        [22, 0.1, pal.edge],
        [11, 0.25, pal.edge],
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
