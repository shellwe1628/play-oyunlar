/**
 * The forged bow's glow: an additive, flame-like aura that hugs the whole bow (both limbs and
 * the grip), brighter and whiter at the core, licking tongues rising off the limbs, wisps and
 * embers peeling off the tips and trailing when the archer moves, a flare on every shot and a
 * surge on headshots and streaks. Seven bands (see GLOW_BANDS) read from the colour alone.
 *
 * Cheap: three textures baked once (soft blob, flame tongue, ember), a fixed set of images and
 * a pooled particle set in typed arrays; nothing is allocated per frame.
 */
import Phaser from 'phaser';
import { bowGlow, type BowGlow } from '../sim/bow';
import { PALETTE } from '../textures';
import { hueColor, type BowGeom } from './gear';

const BLOB = 'okcu-glow-blob';
const TONGUE = 'okcu-glow-tongue';
const N = 11; // samples along the bow
const TONGUES = 9;
const MOTES = 56;

/** Bake the glow textures once per game (canvas radial gradients, so they are soft). */
export function bakeGlowTextures(scene: Phaser.Scene): void {
  const tex = scene.textures;
  if (!tex.exists(BLOB)) {
    const c = tex.createCanvas(BLOB, 64, 64);
    if (c) {
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.15)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
      c.refresh();
    }
  }
  if (!tex.exists(TONGUE)) {
    // a flame tongue: a soft teardrop, widest near the base, tapering to the tip (up)
    const c = tex.createCanvas(TONGUE, 32, 96);
    if (c) {
      const ctx = c.getContext();
      ctx.save();
      ctx.translate(16, 80);
      ctx.scale(1, 3.2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(255,255,255,0.5)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      c.refresh();
    }
  }
}

export class BowAura {
  private readonly blobs: Phaser.GameObjects.Image[] = [];
  /** a normal-blend colour underlay, so the glow reads on light skies (snow, meadow) too */
  private readonly under: Phaser.GameObjects.Image[] = [];
  private readonly cores: Phaser.GameObjects.Image[] = [];
  private readonly tongues: Phaser.GameObjects.Image[] = [];
  private readonly light: Phaser.GameObjects.Image;
  private readonly motes: Phaser.GameObjects.Image[] = [];
  private readonly mx = new Float32Array(MOTES);
  private readonly my = new Float32Array(MOTES);
  private readonly mvx = new Float32Array(MOTES);
  private readonly mvy = new Float32Array(MOTES);
  private readonly mlife = new Float32Array(MOTES);
  private readonly mmax = new Float32Array(MOTES);
  private readonly msize = new Float32Array(MOTES);
  private readonly px = new Float32Array(N);
  private readonly py = new Float32Array(N);
  private next = 0;
  private emit = 0;
  private flareK = 0;
  private lastX = 0;
  private lastY = 0;
  private glow: BowGlow = bowGlow(0);
  private level = -1;
  private time = 0;
  /** the archer's look side (+1 right): tongues lean back from the shot */
  facing = 1;

  /** `parent`: the container the glow sits in (above the archer); `size`: 1 for a bow in hand. */
  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container | null, private readonly size = 1) {
    bakeGlowTextures(scene);
    const add = (key: string): Phaser.GameObjects.Image => {
      const img = scene.add.image(0, 0, key).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      if (parent) parent.add(img);
      return img;
    };
    this.light = add(BLOB);
    for (let i = 0; i < N; i += 2) this.under.push(add(BLOB).setBlendMode(Phaser.BlendModes.NORMAL));
    for (let i = 0; i < N; i++) this.blobs.push(add(BLOB));
    for (let i = 0; i < TONGUES; i++) this.tongues.push(add(TONGUE).setOrigin(0.5, 0.86));
    for (let i = 0; i < N; i++) this.cores.push(add(BLOB));
    for (let i = 0; i < MOTES; i++) this.motes.push(add(BLOB));
  }

  /** A shot (k ≈ 1) or a headshot / streak (k ≈ 2): the aura flares and throws off sparks. */
  flare(k: number): void {
    this.flareK = Math.max(this.flareK, k);
    if (this.glow.band === 0) return;
    for (let i = 0; i < Math.round(6 * k + this.glow.motes / 4); i++) this.spawn(i % 2 === 0 ? 0 : N - 1, 1.6 * k);
  }

  setDepth(d: number): void {
    for (const img of [this.light, ...this.under, ...this.blobs, ...this.tongues, ...this.cores, ...this.motes]) img.setDepth(d);
  }

  hide(): void {
    this.light.setVisible(false);
    for (const i of this.under) i.setVisible(false);
    for (const i of this.blobs) i.setVisible(false);
    for (const i of this.tongues) i.setVisible(false);
    for (const i of this.cores) i.setVisible(false);
    for (let i = 0; i < MOTES; i++) {
      this.mlife[i] = 0;
      this.motes[i]!.setVisible(false);
    }
  }

  private spawn(at: number, speed: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MOTES;
    const s = this.size;
    this.mx[i] = this.px[at]! + (Math.random() - 0.5) * 8 * s;
    this.my[i] = this.py[at]! + (Math.random() - 0.5) * 8 * s;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.4 - this.facing * 0.35;
    const v = (30 + Math.random() * 60) * s * speed;
    this.mvx[i] = Math.cos(a) * v;
    this.mvy[i] = Math.sin(a) * v;
    this.mmax[i] = this.mlife[i] = 0.5 + Math.random() * 0.7;
    this.msize[i] = (2.5 + Math.random() * 3) * s * (this.glow.band >= 4 ? 1.2 : 1);
  }

  /**
   * Follow the bow this frame. `drawn` (0 … 1) tightens and brightens the aura; `shown` false
   * hides it (the bow is gone or the level has no glow).
   */
  update(dt: number, level: number, g: BowGeom, drawn: number, shown = true): void {
    if (level !== this.level) {
      this.level = level;
      this.glow = bowGlow(level);
    }
    const gl = this.glow;
    this.time += dt;
    const t = this.time;
    if (!shown || gl.band === 0) {
      this.hide();
      return;
    }
    this.flareK = Math.max(0, this.flareK - dt * 2.2);
    const flare = this.flareK;
    const s = g.s * this.size;
    const col = gl.cycle ? hueColor((t * 0.25) % 1) : gl.color;
    // points along the bow: the same quadratic the limbs are drawn with
    const cx = 2 * g.mx - (g.t1x + g.t2x) / 2;
    const cy = 2 * g.my - (g.t1y + g.t2y) / 2;
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1);
      const u = 1 - k;
      this.px[i] = u * u * g.t1x + 2 * u * k * cx + k * k * g.t2x;
      this.py[i] = u * u * g.t1y + 2 * u * k * cy + k * k * g.t2y;
    }
    // the bow's back (away from the string): tongues lick outward and up from it
    let nx = g.mx - (g.t1x + g.t2x) / 2;
    let ny = g.my - (g.t1y + g.t2y) / 2;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    const breathe = 0.85 + Math.sin(t * 3.1) * 0.1 + Math.sin(t * 7.3) * 0.05;
    const power = gl.aura * breathe * (1 + 0.25 * drawn + 0.6 * flare);
    // underlay: the band's colour, softly, so it shows on a white sky as well as a dark one
    for (let i = 0; i < this.under.length; i++) {
      const at = Math.min(N - 1, i * 2);
      const r = (14 + 18 * gl.aura) * s;
      this.under[i]!.setVisible(true).setPosition(this.px[at], this.py[at]).setScale(r / 32).setTint(col).setAlpha(Math.min(0.5, 0.12 + 0.25 * gl.aura));
    }
    // the aura hugging the limbs
    for (let i = 0; i < N; i++) {
      const b = this.blobs[i]!;
      const tip = i === 0 || i === N - 1 ? 0.8 : 1;
      const flick = 1 + Math.sin(t * 11 + i * 1.9) * 0.12;
      const r = (10 + 16 * gl.aura) * s * tip * flick * (1 + 0.3 * flare);
      b.setVisible(true).setPosition(this.px[i], this.py[i]).setScale(r / 32).setTint(col).setAlpha(Math.min(1, 0.22 + 0.5 * power) * (gl.band === 1 ? 0.85 : 1));
    }
    // flame tongues rising along the limbs
    for (let i = 0; i < TONGUES; i++) {
      const im = this.tongues[i]!;
      if (gl.flame <= 0) {
        im.setVisible(false);
        continue;
      }
      const k = (i + 0.5) / TONGUES;
      const at = Math.min(N - 1, Math.round(k * (N - 1)));
      const ph = (t * 1.7 + i * 0.37) % 1;
      const h = (0.45 + 0.55 * Math.sin(ph * Math.PI)) * gl.flame * (1 + 0.5 * flare);
      const lean = Math.atan2(ny * 0.55 - 0.75, nx * 0.55 - this.facing * 0.2) + Math.PI / 2 + Math.sin(t * 6 + i * 2.3) * 0.25;
      im.setVisible(true)
        .setPosition(this.px[at]! + nx * 3 * s, this.py[at]! + ny * 3 * s)
        .setRotation(lean)
        .setScale((0.55 + 0.35 * gl.flame) * s, h * 0.95 * s * (0.8 + 0.4 * gl.aura))
        .setTint(col)
        .setAlpha(Math.min(1, 0.35 + 0.45 * power) * (1 - ph * 0.5));
    }
    // a white-hot core along the bow's edge
    for (let i = 0; i < N; i++) {
      const c = this.cores[i]!;
      if (gl.core <= 0) {
        // the thinnest band: a bright sheen sliding up and down the limbs
        if (i < 2 && gl.sheen > 0) {
          const k = (Math.sin(t * 2.2 + i * Math.PI) + 1) / 2;
          const at = Math.min(N - 1, Math.round(k * (N - 1)));
          c.setVisible(true).setPosition(this.px[at], this.py[at]).setScale((6 * s) / 32).setTint(PALETTE.white).setAlpha(0.8 * gl.sheen);
        } else c.setVisible(false);
        continue;
      }
      const r = (5 + 5 * gl.core) * s * (1 + Math.sin(t * 13 + i * 2.7) * 0.15);
      c.setVisible(true).setPosition(this.px[i], this.py[i]).setScale(r / 32).setTint(gl.cycle ? PALETTE.white : mixWhite(col, 0.6)).setAlpha(Math.min(1, 0.45 * gl.core * breathe * (1 + flare)));
    }
    // light cast on the archer and the ledge
    if (gl.light > 0) {
      const r = 150 * s;
      this.light.setVisible(true).setPosition(g.mx, g.my + 20 * s).setScale(r / 32).setTint(col).setAlpha(gl.light * 0.5 * breathe * (1 + 0.5 * flare));
    } else this.light.setVisible(false);
    // wisps and embers: peel off the tips and limbs, and stream behind a moving bow
    const vx = dt > 0 ? (g.mx - this.lastX) / dt : 0;
    const vy = dt > 0 ? (g.my - this.lastY) / dt : 0;
    const moving = Math.min(1, Math.hypot(vx, vy) / (300 * s));
    this.lastX = g.mx;
    this.lastY = g.my;
    this.emit += dt * gl.motes * (1 + 2 * moving + 2 * flare);
    while (this.emit >= 1) {
      this.emit -= 1;
      const r = Math.random();
      this.spawn(r < 0.3 ? 0 : r < 0.6 ? N - 1 : Math.floor(Math.random() * N), 1);
    }
    const drag = Math.exp(-dt * 1.5);
    for (let i = 0; i < MOTES; i++) {
      const m = this.motes[i]!;
      if (this.mlife[i]! <= 0) {
        if (m.visible) m.setVisible(false);
        continue;
      }
      this.mlife[i] = this.mlife[i]! - dt;
      this.mvx[i] = this.mvx[i]! * drag - vx * 0.02 * dt * 60;
      this.mvy[i] = (this.mvy[i]! - 20 * s * dt) * drag - vy * 0.02 * dt * 60;
      this.mx[i] = this.mx[i]! + this.mvx[i]! * dt + Math.sin(t * 5 + i) * 10 * s * dt;
      this.my[i] = this.my[i]! + this.mvy[i]! * dt;
      const k = this.mlife[i]! / this.mmax[i]!;
      m.setVisible(true)
        .setPosition(this.mx[i], this.my[i])
        .setScale((this.msize[i]! * (0.5 + 0.5 * k)) / 6)
        .setTint(gl.cycle ? hueColor((t * 0.25 + i / MOTES) % 1) : k > 0.6 && gl.core > 0 ? mixWhite(col, 0.5) : col)
        .setAlpha(Math.min(1, k * 1.3));
    }
  }
}

function mixWhite(c: number, k: number): number {
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return (m((c >> 16) & 0xff) << 16) | (m((c >> 8) & 0xff) << 8) | m(c & 0xff);
}
