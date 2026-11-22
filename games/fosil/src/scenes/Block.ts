import Phaser from 'phaser';
import { shade } from '../art/fossils';
import { LAYERS, at } from '../sim/data';
import type { BlockKind } from '../sim/dig';
import { PALETTE } from '../textures';

/** Highest spring velocity of the hit kick (degrees/s) and the furthest the block may tilt (degrees). */
const KICK_MAX = 200;
const KICK_ANGLE = 6;

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
  /** The crack segments that opened on the last hit, drawn bright; they fade to the dark crack. */
  private readonly fresh: Phaser.GameObjects.Graphics;
  /** Segments already showing per strike origin. */
  private opened: number[] = [];
  private readonly deco: Phaser.GameObjects.Graphics;
  /** Pressure gauge (needle follows your combo), meteor core, white hit flash. */
  private readonly gauge: Phaser.GameObjects.Graphics;
  private readonly core: Phaser.GameObjects.Container;
  private readonly flash: Phaser.GameObjects.Graphics;
  private kind: BlockKind = 'normal';
  private echo = -1;
  private needle = -1;
  /** Hit kick (degrees) and its spring velocity; damage shown, for the near-break shudder. */
  private kick = 0;
  private kickV = 0;
  private dmg = 0;
  /** Set from the scene: no kick, no shudder. */
  reducedMotion = false;
  private clock = 0;
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
    this.fresh = scene.add.graphics().setAlpha(0);
    this.deco = scene.add.graphics();
    this.gauge = scene.add.graphics();
    this.flash = scene.add.graphics();
    this.flash.fillStyle(0xffffff, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 26);
    this.flash.setAlpha(0);
    // the star core: a hot glow, a spinning star and a ring that breathes
    const glow = scene.add.image(0, 0, 'glow').setTint(0xffb040).setScale(1.1).setAlpha(0.85);
    const ring = scene.add.circle(0, 0, 40).setStrokeStyle(5, 0xfff0c0, 0.9);
    const star = scene.add.image(0, 0, 'spark').setTint(0xffffff).setScale(2.2);
    this.core = scene.add.container(0, 0, [glow, ring, star]).setVisible(false);
    this.add([this.base, this.deco, this.cracks, this.fresh, this.gauge, this.core, this.flash]);
    scene.add.existing(this);
  }

  setLayer(layer: number): this {
    this.layer = layer;
    return this.regenerate();
  }

  /** The block's special kind (vein, unstable, twin, golden, cave-in, boss, ...): its own look. */
  setKind(kind: BlockKind, echo = -1): this {
    if (kind === this.kind && echo === this.echo) return this;
    this.kind = kind;
    this.echo = echo;
    return this.regenerate();
  }

  /** A fresh block of `kind` (one redraw). */
  renew(kind: BlockKind, echo = -1): this {
    this.kind = kind;
    this.echo = echo;
    return this.regenerate();
  }

  /** Meteor: where the star core glows (0..1 of the face), or null to hide it. */
  setCore(at: { x: number; y: number } | null): void {
    if (!at) {
      this.core.setVisible(false);
      return;
    }
    const x = (at.x - 0.5) * this.bw;
    const y = (at.y - 0.5) * this.bh;
    if (!this.core.visible) this.core.setVisible(true).setPosition(x, y).setScale(0.2);
    else if (Math.abs(this.core.x - x) > 1 || Math.abs(this.core.y - y) > 1) {
      // the core is knocked away: it zips to its new spot
      this.scene.tweens.killTweensOf(this.core);
      this.scene.tweens.add({ targets: this.core, x, y, duration: 140, ease: 'Cubic.easeOut' });
      this.core.setScale(0.5);
    }
  }

  /** Core position in world px (for the strike effects). */
  get corePos(): { x: number; y: number } | null {
    return this.core.visible ? { x: this.x + this.core.x, y: this.y + this.core.y } : null;
  }

  /** A hit lands at block-local x: white flash and a springy kick away from the strike side. */
  impact(lx: number, strength = 1): void {
    this.flash.setAlpha(Math.min(0.4, 0.16 + 0.12 * strength));
    if (this.reducedMotion) return;
    // capped: several hits in the same instant (assistant + finger) tilt it no further than one hard hit
    this.kickV = Phaser.Math.Clamp(this.kickV + (lx >= 0 ? 1 : -1) * 90 * Math.min(2, strength), -KICK_MAX, KICK_MAX);
  }

  get blockKind(): BlockKind {
    return this.kind;
  }

  /**
   * Per-frame life for special blocks: unstable trembles faster as its window runs out
   * (`urgency` 0..1), golden glitters, the boss breathes. Returns the angle wobble applied.
   */
  animate(dt: number, urgency = 0, combo = 0): void {
    this.clock += dt;
    const k = this.kind;
    // spring back from the last hit kick; when nearly broken the block shudders. Integrated in
    // small steps (a slow frame must not throw the spring) and held within a few degrees however
    // many hits land together.
    for (let left = Math.min(dt, 0.1); left > 0; left -= 1 / 120) {
      const h = Math.min(left, 1 / 120);
      this.kickV += (-this.kick * 420 - this.kickV * 16) * h;
      this.kick += this.kickV * h;
    }
    if (Math.abs(this.kick) > KICK_ANGLE) {
      this.kick = Math.sign(this.kick) * KICK_ANGLE;
      if (this.kickV * this.kick > 0) this.kickV = 0;
    }
    const shudder = !this.reducedMotion && this.dmg > 0.72 ? Math.sin(this.clock * 60) * (this.dmg - 0.72) * 2.4 : 0;
    let angle = this.kick + shudder;
    if (this.flash.alpha > 0) this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 3.2));
    if (this.fresh.alpha > 0) this.fresh.setAlpha(Math.max(0, this.fresh.alpha - dt * 3.6));
    if (k === 'unstable') {
      const f = 10 + urgency * 26;
      angle += Math.sin(this.clock * f) * (0.6 + urgency * 1.8);
      this.deco.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(this.clock * (3 + urgency * 8))));
    } else if (k === 'golden') {
      this.deco.setAlpha(0.8 + 0.2 * Math.sin(this.clock * 4));
    } else if (k === 'boss') {
      this.deco.setAlpha(0.75 + 0.25 * Math.sin(this.clock * 2.2));
    } else if (k === 'echo') {
      this.deco.setAlpha(0.6 + 0.4 * Math.sin(this.clock * 1.6));
      this.deco.setX(Math.sin(this.clock * 7) * 2);
    } else if (k === 'pressure') {
      this.drawGauge(combo);
      // the plates creak under the weight
      this.deco.setY(Math.sin(this.clock * 1.3) * 1.5);
    }
    if (this.core.visible) {
      const ring = this.core.list[1] as Phaser.GameObjects.Arc;
      const star = this.core.list[2] as Phaser.GameObjects.Image;
      ring.setScale(1 + 0.25 * Math.sin(this.clock * 6));
      star.setAngle(this.clock * 140);
      if (this.core.scale < 1) this.core.setScale(Math.min(1, this.core.scale + dt * 4));
    }
    if (Math.abs(angle - this.angle) > 0.01) this.setAngle(angle);
  }

  /** The pressure gauge on top of the block: the needle shows your tap multiplier. */
  private drawGauge(combo: number): void {
    const v = Math.round(combo * 40) / 40;
    if (v === this.needle) return;
    this.needle = v;
    const g = this.gauge.clear();
    const cx = 0;
    const cy = -this.bh / 2 + 62;
    g.fillStyle(0x0a1020, 0.9).fillCircle(cx, cy, 44);
    g.lineStyle(5, 0x9ab0d0, 1).strokeCircle(cx, cy, 44);
    // red (weak) → green (strong) arc
    for (let i = 0; i < 10; i++) {
      const a0 = Math.PI * (0.8 + i * 0.14);
      g.lineStyle(7, i < 3 ? 0xf0445f : i < 6 ? 0xffd23f : 0x4fe08a, 0.9).beginPath().arc(cx, cy, 34, a0, a0 + 0.12).strokePath();
    }
    const a = Math.PI * (0.8 + v * 1.4);
    g.lineStyle(5, 0xffffff, 1).lineBetween(cx, cy, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
    g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 6);
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
    this.drawKind(x0, y0, w, h);
    this.gauge.clear();
    this.needle = -1;
    if (this.kind !== 'meteor') this.core.setVisible(false);
    this.deco.setPosition(0, 0);
    // bevel: light top edge, dark right edge
    g.fillStyle(0xffffff, 0.16).fillRoundedRect(x0 + 8, y0 + 6, w - 16, 18, 9);
    g.fillStyle(0x000000, 0.16).fillRoundedRect(x0 + w - 22, y0 + 20, 14, h - 40, 7);
    this.origins = [];
    this.opened = [];
    this.fresh.clear().setAlpha(0);
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
    } else if (this.layer === 4) {
      // coal: glossy black seams and fern prints
      for (let i = 0; i < 4; i++) {
        const y = r(y0 + 30, y0 + h - 40);
        g.fillStyle(0x0a0d0b, 0.85).fillRect(x0, y, w, r(10, 22));
        g.fillStyle(0x8aa0b0, 0.35).fillRect(x0 + r(20, 200), y + 3, r(40, 120), 2);
      }
      for (let i = 0; i < 3; i++) {
        const x = r(x0 + 60, x0 + w - 60);
        const y = r(y0 + 60, y0 + h - 60);
        g.lineStyle(2, 0x2a4a30, 0.8).lineBetween(x, y + 40, x, y - 40);
        for (let k = -3; k <= 3; k++) g.lineBetween(x, y + k * 11, x + 18, y + k * 11 - 9).lineBetween(x, y + k * 11, x - 18, y + k * 11 - 9);
      }
    } else if (this.layer === 5) {
      // amber: translucent drops with something caught inside
      for (let i = 0; i < 6; i++) {
        const x = r(x0 + 40, x0 + w - 40);
        const y = r(y0 + 40, y0 + h - 40);
        const rad = r(12, 24);
        g.fillStyle(0xffa020, 0.3).fillCircle(x, y, rad * 1.5);
        g.fillStyle(0xf09018, 0.85).fillEllipse(x, y, rad * 2, rad * 1.6);
        g.fillStyle(0x3a2008, 0.8).fillEllipse(x + 2, y + 2, rad * 0.6, rad * 0.3);
        g.fillStyle(0xfff0b0, 0.85).fillCircle(x - rad * 0.4, y - rad * 0.3, rad * 0.25);
      }
    } else if (this.layer === 6) {
      // salt: cubic crystals, pink and white
      for (let i = 0; i < 16; i++) {
        const x = r(x0 + 30, x0 + w - 30);
        const y = r(y0 + 30, y0 + h - 30);
        const sz = r(8, 22);
        g.fillStyle(i % 3 ? 0xf8f4ff : 0xffc8dc, 0.75).fillRect(x - sz / 2, y - sz / 2, sz, sz);
        g.lineStyle(2, 0xffffff, 0.8).strokeRect(x - sz / 2, y - sz / 2, sz, sz);
        g.fillStyle(0xffffff, 0.6).fillRect(x - sz / 2 + 2, y - sz / 2 + 2, sz / 3, sz / 3);
      }
    } else if (this.layer === 7) {
      // geode: a hollow of violet points in the middle of the stone
      const cx = r(x0 + w * 0.35, x0 + w * 0.65);
      const cy = r(y0 + h * 0.4, y0 + h * 0.6);
      g.fillStyle(0x2a1040, 0.9).fillEllipse(cx, cy, w * 0.5, h * 0.5);
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const ox = cx + Math.cos(a) * w * 0.25;
        const oy = cy + Math.sin(a) * h * 0.25;
        const len = r(30, 60);
        const tx = ox - Math.cos(a) * len;
        const ty = oy - Math.sin(a) * len;
        const n = { x: -Math.sin(a) * 9, y: Math.cos(a) * 9 };
        g.fillStyle(i % 2 ? 0xb07aff : 0xd8b8ff, 0.95).fillTriangle(ox + n.x, oy + n.y, ox - n.x, oy - n.y, tx, ty);
      }
    } else if (this.layer === 8) {
      // basalt with glowing lava veins
      g.fillStyle(0x000000, 0.25).fillRoundedRect(x0, y0, w, h, 26);
      for (let k = 0; k < 4; k++) {
        let x = r(x0 + 40, x0 + w - 40);
        let y = y0 + 10;
        for (let i = 0; i < 6; i++) {
          const nx = Phaser.Math.Clamp(x + r(-50, 50), x0 + 10, x0 + w - 10);
          const ny = Math.min(y0 + h - 10, y + r(40, 70));
          g.lineStyle(9, 0xff5a10, 0.3).lineBetween(x, y, nx, ny);
          g.lineStyle(3, 0xffc040, 0.95).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    } else if (this.layer === 10) {
      // trench rock: dark basalt pillows, pale fish bones, faint lights
      g.fillStyle(0x000000, 0.3).fillRoundedRect(x0, y0, w, h, 26);
      for (let i = 0; i < 9; i++) {
        const x = r(x0 + 40, x0 + w - 40);
        const y = r(y0 + 40, y0 + h - 40);
        const rr = r(18, 36);
        g.fillStyle(0x0e1830, 0.85).fillEllipse(x, y, rr * 2.2, rr * 1.4);
        g.lineStyle(2, 0x2a4068, 0.8).strokeEllipse(x, y, rr * 2.2, rr * 1.4);
      }
      for (let i = 0; i < 3; i++) {
        const x = r(x0 + 70, x0 + w - 90);
        const y = r(y0 + 50, y0 + h - 50);
        g.lineStyle(3, 0xc8d4e8, 0.6).lineBetween(x, y, x + 60, y);
        for (let k = 1; k < 6; k++) g.lineBetween(x + k * 10, y, x + k * 10 - 5, y - 12).lineBetween(x + k * 10, y, x + k * 10 - 5, y + 12);
      }
      for (let i = 0; i < 10; i++) g.fillStyle(0x60e0ff, 0.6).fillCircle(r(x0 + 20, x0 + w - 20), r(y0 + 20, y0 + h - 20), r(1.5, 3.5));
    } else if (this.layer === 11) {
      // crater glass: scorched rock fused with star iron, splashes of glassy melt
      for (let i = 0; i < 6; i++) {
        const x = r(x0 + 40, x0 + w - 40);
        const y = r(y0 + 40, y0 + h - 40);
        g.fillStyle(0x1a1620, 0.8).fillCircle(x, y, r(14, 26));
        g.lineStyle(2, 0x6a5a7a, 0.7).strokeCircle(x, y, r(26, 34));
      }
      for (let i = 0; i < 8; i++) {
        const x = r(x0 + 30, x0 + w - 30);
        const y = r(y0 + 30, y0 + h - 30);
        const sz = r(6, 12);
        g.fillStyle(i % 2 ? 0x9ad0ff : 0xffb060, 0.9).fillTriangle(x - sz, y + sz * 0.6, x + sz, y + sz * 0.4, x, y - sz * 1.5);
      }
    } else if (this.layer === 12) {
      // rift stone: slabs of older strata fused at odd angles, seams of violet light
      for (let i = 0; i < 5; i++) {
        const L = at(LAYERS, Math.floor(r(0, 10)));
        const x = r(x0 + 50, x0 + w - 110);
        const y = r(y0 + 40, y0 + h - 70);
        for (let b = 0; b < 3; b++) g.fillStyle(at(L.bands, b), 0.85).fillRect(x, y + b * 10, r(60, 100), 10);
      }
      for (let k = 0; k < 3; k++) {
        let x = r(x0 + 30, x0 + w - 30);
        let y = y0 + 10;
        for (let i = 0; i < 6; i++) {
          const nx = Phaser.Math.Clamp(x + r(-40, 40), x0 + 10, x0 + w - 10);
          const ny = Math.min(y0 + h - 10, y + r(40, 70));
          g.lineStyle(8, 0xb060ff, 0.25).lineBetween(x, y, nx, ny);
          g.lineStyle(2, 0xf0d0ff, 0.9).lineBetween(x, y, nx, ny);
          x = nx;
          y = ny;
        }
      }
    } else if (this.layer === 9) {
      // first seas mud: quilted fronds and disc prints
      for (let i = 0; i < 3; i++) {
        const x = r(x0 + 70, x0 + w - 70);
        const y = r(y0 + 70, y0 + h - 70);
        for (let k = 0; k < 7; k++) g.lineStyle(3, 0x2a5a58, 0.7).strokeEllipse(x, y - 36 + k * 12, 50 - Math.abs(k - 3) * 8, 10);
      }
      for (let i = 0; i < 4; i++) {
        const x = r(x0 + 40, x0 + w - 40);
        const y = r(y0 + 40, y0 + h - 40);
        g.lineStyle(3, 0xbfe8e0, 0.6).strokeCircle(x, y, r(12, 20));
        g.lineStyle(2, 0xbfe8e0, 0.5).strokeCircle(x, y, r(4, 8));
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

  /** The look of a special block, drawn over the layer material. */
  private drawKind(x0: number, y0: number, w: number, h: number): void {
    const g = this.deco.clear().setAlpha(1);
    const r = (a: number, b: number): number => a + Math.random() * (b - a);
    switch (this.kind) {
      case 'vein':
        // thick metallic veins through the rock, with bright flecks
        for (let k = 0; k < 3; k++) {
          const ya = y0 + r(30, h - 30);
          const yb = y0 + r(30, h - 30);
          g.lineStyle(26, 0x2a3440, 0.95).lineBetween(x0 + 6, ya, x0 + w - 6, yb);
          g.lineStyle(8, 0x8a9cb0, 0.9).lineBetween(x0 + 6, ya - 6, x0 + w - 6, yb - 6);
          for (let i = 0; i < 6; i++) {
            const t = Math.random();
            g.fillStyle(0xe8f4ff, 0.95).fillCircle(x0 + 6 + t * (w - 12), ya + (yb - ya) * t, r(2, 4));
          }
        }
        g.lineStyle(6, 0x8a9cb0, 1).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        break;
      case 'unstable':
        // glowing fault lines: it wants to fall apart
        for (let k = 0; k < 5; k++) {
          let x = x0 + r(30, w - 30);
          let y = y0 + 8;
          for (let i = 0; i < 6; i++) {
            const nx = Phaser.Math.Clamp(x + r(-40, 40), x0 + 8, x0 + w - 8);
            const ny = Math.min(y0 + h - 8, y + r(30, 70));
            g.lineStyle(8, 0xff7a20, 0.35).lineBetween(x, y, nx, ny);
            g.lineStyle(3, 0xffe080, 1).lineBetween(x, y, nx, ny);
            x = nx;
            y = ny;
          }
        }
        g.lineStyle(6, 0xff9a30, 1).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        break;
      case 'twin':
        // two blocks fused: a seam down the middle and two cores
        g.fillStyle(0x000000, 0.35).fillRect(-6, y0 + 4, 12, h - 8);
        g.lineStyle(3, 0xffffff, 0.5).lineBetween(-8, y0 + 8, -8, y0 + h - 8);
        for (const cx of [-w / 4, w / 4]) {
          g.fillStyle(0xffffff, 0.14).fillCircle(cx, 0, 64);
          g.lineStyle(4, 0xffffff, 0.55).strokeCircle(cx, 0, 64);
        }
        break;
      case 'golden':
        g.fillStyle(0xffd23f, 0.42).fillRoundedRect(x0, y0, w, h, 26);
        for (let i = 0; i < 6; i++) g.fillStyle(0xfff2a0, 0.35).fillRect(x0 + r(0, w - 60), y0 + 4, r(14, 30), h - 8);
        for (let i = 0; i < 18; i++) {
          const x = x0 + r(20, w - 20);
          const y = y0 + r(20, h - 20);
          const s = r(4, 9);
          g.fillStyle(0xffffff, 0.95).fillTriangle(x - s, y, x + s, y, x, y - s * 2).fillTriangle(x - s, y, x + s, y, x, y + s * 2);
        }
        g.lineStyle(8, 0xffd23f, 1).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        break;
      case 'cavein':
        // a heap of grey boulders instead of a clean face
        g.fillStyle(0x3a3634, 0.75).fillRoundedRect(x0, y0, w, h, 26);
        for (let i = 0; i < 16; i++) {
          const x = x0 + r(40, w - 40);
          const y = y0 + r(40, h - 30);
          const rx = r(30, 70);
          const c = [0x6a645e, 0x5a544e, 0x7a746c][i % 3]!;
          g.fillStyle(c, 1).fillEllipse(x, y, rx, rx * 0.75);
          g.fillStyle(0xffffff, 0.15).fillEllipse(x - rx * 0.15, y - rx * 0.15, rx * 0.4, rx * 0.22);
        }
        break;
      case 'pressure': {
        // iron plates bolted over the rock, holding back the deep (the gauge is drawn live)
        g.fillStyle(0x1a2438, 0.55).fillRoundedRect(x0, y0, w, h, 26);
        for (let k = 0; k < 3; k++) {
          const y = y0 + 120 + k * ((h - 150) / 2);
          g.fillStyle(0x3a4a66, 0.95).fillRect(x0 + 6, y - 9, w - 12, 18);
          for (let i = 0; i < 8; i++) g.fillStyle(0xb0c4e0, 1).fillCircle(x0 + 24 + i * ((w - 48) / 7), y, 4);
        }
        g.lineStyle(8, 0x6a80a8, 1).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        break;
      }
      case 'meteor':
        // star iron: a dark glassy mass with a glowing crust; the core itself is a live object
        g.fillStyle(0x140c18, 0.6).fillRoundedRect(x0, y0, w, h, 26);
        for (let i = 0; i < 20; i++) {
          const a = r(0, Math.PI * 2);
          const d = r(40, 200);
          g.lineStyle(2, 0xffa040, 0.45).lineBetween(Math.cos(a) * d * 0.5, Math.sin(a) * d * 0.4, Math.cos(a) * d, Math.sin(a) * d * 0.8);
        }
        for (let i = 0; i < 14; i++) g.fillStyle(0xffd080, 0.8).fillCircle(x0 + r(20, w - 20), y0 + r(20, h - 20), r(1.5, 3.5));
        g.lineStyle(7, 0xffa040, 1).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        break;
      case 'echo': {
        // a window into an older layer: its sediment bands shimmer through the rift stone
        const older = this.echo >= 0 ? at(LAYERS, this.echo) : at(LAYERS, 0);
        const n = older.bands.length;
        for (let i = 0; i < n; i++) g.fillStyle(at(older.bands, i), 0.55).fillRect(x0 + 30, y0 + 30 + ((h - 60) * i) / n, w - 60, (h - 60) / n + 1);
        g.lineStyle(10, 0xd090ff, 0.85).strokeRoundedRect(x0 + 24, y0 + 24, w - 48, h - 48, 18);
        g.lineStyle(4, 0xfff0c0, 0.9).strokeRoundedRect(x0 + 3, y0 + 3, w - 6, h - 6, 24);
        for (let i = 0; i < 4; i++) g.lineStyle(2, 0xffffff, 0.35).lineBetween(x0 + 30, y0 + 30 + i * 70, x0 + w - 30, y0 + 50 + i * 70);
        break;
      }
      case 'boss':
        // an ancient guardian slab: dark, ringed, with a glowing core and three phase marks
        g.fillStyle(0x140820, 0.6).fillRoundedRect(x0, y0, w, h, 26);
        g.fillStyle(0x3fe3e0, 0.25).fillCircle(0, 0, 110);
        g.lineStyle(6, 0x3fe3e0, 0.9).strokeCircle(0, 0, 80);
        g.lineStyle(3, 0x3fe3e0, 0.6).strokeCircle(0, 0, 120);
        g.fillStyle(0xbffcff, 1).fillCircle(0, 0, 26);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          g.lineStyle(4, 0x3fe3e0, 0.7).lineBetween(Math.cos(a) * 130, Math.sin(a) * 130, Math.cos(a) * 160, Math.sin(a) * 160);
        }
        g.lineStyle(10, 0x3fe3e0, 1).strokeRoundedRect(x0 + 4, y0 + 4, w - 8, h - 8, 24);
        break;
      default:
        break;
    }
  }

  /** Show damage as a fraction 0..1 of the block's HP. */
  setDamage(f: number): void {
    this.dmg = f;
    if (f > 0 && this.origins.length === 0) this.hit((Math.random() - 0.5) * this.bw * 0.4, (Math.random() - 0.5) * this.bh * 0.4);
    const key = Math.ceil(Math.min(1, Math.max(0, f)) * 15) * 4 + this.origins.length;
    if (key === this.shown) return;
    this.shown = key;
    const g = this.cracks.clear();
    if (f <= 0) return;
    const crack =
      this.kind === 'unstable' ? 0xffe080 : this.kind === 'meteor' || this.layer === 8 ? 0xffa030 : this.layer === 12 ? 0xe0b0ff : this.layer === 10 ? 0x7ad0ff : this.layer === 1 ? 0x2a5a78 : this.layer === 3 || this.layer === 9 ? 0x06141c : PALETTE.crack;
    const lip = 0xffffff;
    g.fillStyle(0x000000, Math.min(0.32, f * 0.36)).fillRoundedRect(-this.bw / 2, -this.bh / 2, this.bw, this.bh, 26);
    // each origin spreads its own branches as damage grows; the stretch that just opened is drawn
    // bright on top and fades (animate), so the eye sees the crack run
    let grew = false;
    this.origins.forEach((segs, o) => {
      const n = Math.max(1, Math.ceil(Math.min(1, f * 1.15) * segs.length));
      for (let i = 0; i < n; i++) {
        const s = segs[i]!;
        g.lineStyle(s.w + 3, lip, this.layer === 1 ? 0.35 : 0.12).lineBetween(s.x1, s.y1 + 2, s.x2, s.y2 + 2);
        g.lineStyle(s.w, crack, 1).lineBetween(s.x1, s.y1, s.x2, s.y2);
      }
      const from = this.opened[o] ?? 0;
      if (n > from && !this.reducedMotion) {
        if (!grew) this.fresh.clear();
        grew = true;
        for (let i = from; i < n; i++) {
          const s = segs[i]!;
          this.fresh.lineStyle(Math.max(2, s.w - 1), 0xffe6b0, 1).lineBetween(s.x1, s.y1, s.x2, s.y2);
        }
      }
      this.opened[o] = n;
    });
    if (grew) this.fresh.setAlpha(0.7);
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
