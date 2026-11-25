/**
 * The animated world behind the shaft: each level theme is a different place. Two parallax
 * layers of a baked tiling motif, feature images (sunburst, aurora ribbons) and a fixed pool of
 * motif sprites, all moved by transform only (nothing redrawn), pulsing on the beat and running
 * faster after a FAST gate, calmer after SLOW. Fixed pools, typed arrays: no per-frame allocation.
 * Presentation only: it reads time, height, beat and speed, and writes nothing back.
 */
import Phaser from 'phaser';
import type { Palette } from '../textures';
import { motifOf, type Motif } from './worldArt';

type Motion = 'rise' | 'fall' | 'drift' | 'radiate' | 'twinkle' | 'travel' | 'swirl';

interface Spec {
  near: number;
  far: number;
  /** Pattern scroll per px climbed (near, far) and sideways drift px/s. */
  scrollNear: number;
  scrollFar: number;
  driftX: number;
  sprite: string;
  count: number;
  motion: Motion;
  speed: number;
  scale: [number, number];
  alpha: number;
  spin: number;
  rays?: boolean;
  ribbons?: boolean;
}

const SPECS: Record<Motif, Spec> = {
  rays: { near: 0.22, far: 0.1, scrollNear: 0.35, scrollFar: 0.15, driftX: 0, sprite: 'w-bubble', count: 14, motion: 'rise', speed: 70, scale: [0.5, 1.4], alpha: 0.55, spin: 0, rays: true },
  circuit: { near: 0.26, far: 0.12, scrollNear: 0.45, scrollFar: 0.2, driftX: 0, sprite: 'oyun-dot', count: 18, motion: 'travel', speed: 520, scale: [0.6, 1.1], alpha: 0.9, spin: 0 },
  aurora: { near: 0.2, far: 0.12, scrollNear: 0.25, scrollFar: 0.12, driftX: 18, sprite: 'w-star4', count: 16, motion: 'twinkle', speed: 0, scale: [0.3, 0.8], alpha: 0.9, spin: 0.6, ribbons: true },
  rain: { near: 0.24, far: 0.12, scrollNear: 0.9, scrollFar: 0.45, driftX: 0, sprite: 'streak', count: 20, motion: 'fall', speed: 900, scale: [0.6, 1.3], alpha: 0.6, spin: 0 },
  hex: { near: 0.24, far: 0.12, scrollNear: 0.4, scrollFar: 0.18, driftX: 0, sprite: 'w-hex', count: 12, motion: 'twinkle', speed: 0, scale: [0.6, 1.4], alpha: 0.75, spin: 0.25 },
  tunnel: { near: 0.24, far: 0.14, scrollNear: 0.5, scrollFar: 0.25, driftX: 0, sprite: 'w-star4', count: 22, motion: 'radiate', speed: 260, scale: [0.15, 1.1], alpha: 0.9, spin: 1.2 },
  waves: { near: 0.28, far: 0.14, scrollNear: 0.3, scrollFar: 0.14, driftX: 40, sprite: 'w-ember', count: 16, motion: 'drift', speed: 40, scale: [0.6, 1.6], alpha: 0.6, spin: 0 },
  grid: { near: 0.24, far: 0.12, scrollNear: 0.6, scrollFar: 0.3, driftX: 0, sprite: 'w-beam', count: 8, motion: 'fall', speed: 420, scale: [0.8, 1.6], alpha: 0.45, spin: 0 },
  bokeh: { near: 0.3, far: 0.18, scrollNear: 0.2, scrollFar: 0.1, driftX: 8, sprite: 'glow', count: 14, motion: 'drift', speed: 22, scale: [0.6, 2.2], alpha: 0.32, spin: 0 },
  embers: { near: 0.22, far: 0.12, scrollNear: 0.5, scrollFar: 0.22, driftX: 0, sprite: 'w-ember', count: 22, motion: 'rise', speed: 160, scale: [0.4, 1.2], alpha: 0.85, spin: 0 },
  // World 5: sprites circle a point behind the shaft and are drawn into it.
  vortex: { near: 0.24, far: 0.12, scrollNear: 0.4, scrollFar: 0.18, driftX: 12, sprite: 'w-ember', count: 20, motion: 'swirl', speed: 0.55, scale: [0.5, 1.5], alpha: 0.8, spin: 0 },
  whirl: { near: 0.22, far: 0.13, scrollNear: 0.3, scrollFar: 0.14, driftX: -10, sprite: 'w-star4', count: 18, motion: 'swirl', speed: -0.4, scale: [0.3, 0.9], alpha: 0.9, spin: 0.9 },
};

const POOL = 22;

function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export class World {
  private readonly near: Phaser.GameObjects.TileSprite;
  private readonly far: Phaser.GameObjects.TileSprite;
  private readonly rays: Phaser.GameObjects.Image;
  private readonly ribbons: Phaser.GameObjects.Image[] = [];
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly sx = new Float32Array(POOL);
  private readonly sy = new Float32Array(POOL);
  private readonly sv = new Float32Array(POOL);
  private readonly sph = new Float32Array(POOL);
  private readonly ssc = new Float32Array(POOL);
  private spec: Spec = SPECS.rays;
  motif: Motif = 'rays';
  private time = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly w: number,
    private readonly h: number,
  ) {
    this.far = scene.add.tileSprite(0, 0, w, h, 'wp-rays').setOrigin(0, 0).setScrollFactor(0).setDepth(-98.5).setBlendMode(Phaser.BlendModes.ADD).setTileScale(2.2);
    this.near = scene.add.tileSprite(0, 0, w, h, 'wp-rays').setOrigin(0, 0).setScrollFactor(0).setDepth(-98).setBlendMode(Phaser.BlendModes.ADD);
    this.rays = scene.add.image(w / 2, h * 0.08, 'w-rays').setScrollFactor(0).setDepth(-98.6).setBlendMode(Phaser.BlendModes.ADD).setScale(3.2);
    for (let i = 0; i < 3; i++) {
      this.ribbons.push(scene.add.image(w / 2, h * (0.22 + i * 0.25), 'w-ribbon').setScrollFactor(0).setDepth(-98.6).setBlendMode(Phaser.BlendModes.ADD).setScale(2.4, 1.6 + i * 0.4));
    }
    for (let i = 0; i < POOL; i++) {
      this.sprites.push(scene.add.image(0, 0, 'oyun-dot').setScrollFactor(0).setDepth(-97.5).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
  }

  /** Switch to theme `theme` (0..19) with palette `pal`. */
  setTheme(theme: number, pal: Palette): void {
    const m = motifOf(theme);
    this.motif = m;
    this.spec = SPECS[m];
    const tint = mix(pal.top2, 0xffffff, 0.45);
    this.near.setTexture(`wp-${m}`).setTint(tint);
    this.far.setTexture(`wp-${m}`).setTint(mix(pal.bottom2, 0xffffff, 0.3));
    this.rays.setVisible(!!this.spec.rays).setTint(mix(pal.top, 0xffffff, 0.6));
    for (const r of this.ribbons) r.setVisible(!!this.spec.ribbons);
    this.ribbons.forEach((r, i) => r.setTint(i === 1 ? mix(pal.top2, 0xffffff, 0.3) : mix(pal.bottom2, 0xffffff, 0.3)));
    for (let i = 0; i < POOL; i++) {
      const s = this.sprites[i]!;
      const on = i < this.spec.count;
      s.setVisible(on);
      if (!on) continue;
      s.setTexture(this.spec.sprite).setTint(i % 3 === 0 ? 0xffffff : tint);
      this.respawn(i, true);
    }
  }

  setVisible(v: boolean): void {
    this.near.setVisible(v);
    this.far.setVisible(v);
    this.rays.setVisible(v && !!this.spec.rays);
    for (const r of this.ribbons) r.setVisible(v && !!this.spec.ribbons);
    for (let i = 0; i < POOL; i++) this.sprites[i]!.setVisible(v && i < this.spec.count);
  }

  private respawn(i: number, anywhere: boolean): void {
    const sp = this.spec;
    const w = this.w;
    const h = this.h;
    const r = Math.random;
    this.ssc[i] = sp.scale[0] + r() * (sp.scale[1] - sp.scale[0]);
    this.sph[i] = r() * Math.PI * 2;
    this.sv[i] = sp.speed * (0.6 + r() * 0.8);
    switch (sp.motion) {
      case 'rise':
        this.sx[i] = r() * w;
        this.sy[i] = anywhere ? r() * h : h + 40;
        break;
      case 'fall':
        this.sx[i] = r() * w;
        this.sy[i] = anywhere ? r() * h : -200;
        break;
      case 'travel':
        // Pulses running down circuit columns (32 px grid at 2.8× scale of the pattern).
        this.sx[i] = Math.floor(r() * (w / 32)) * 32 + 16;
        this.sy[i] = anywhere ? r() * h : -40 - r() * 400;
        break;
      case 'swirl':
        // sx = angle about the eye, sy = distance from it as a share of the outer radius.
        this.sx[i] = r() * Math.PI * 2;
        this.sy[i] = anywhere ? 0.08 + r() * 0.92 : 1;
        break;
      case 'radiate':
        this.sx[i] = 0;
        this.sy[i] = anywhere ? r() : 0; // progress 0..1 along the ray
        this.sph[i] = r() * Math.PI * 2; // ray angle
        break;
      default:
        this.sx[i] = r() * w;
        this.sy[i] = r() * h;
        break;
    }
  }

  /**
   * dt seconds; dy = world px climbed this frame; pulse 0..1 on the beat; speedK ≈ 1 normal,
   * 1.38 after FAST, 0.72 after SLOW (smoothed by the caller).
   */
  /** Flow makes the world brighter (1 = normal). */
  boost = 1;

  update(dt: number, dy: number, pulse: number, speedK: number): void {
    const sp = this.spec;
    this.time += dt * speedK;
    const energy = (0.85 + 0.6 * (speedK - 1)) * this.boost;
    this.near.tilePositionY -= dy * sp.scrollNear;
    this.near.tilePositionX += sp.driftX * dt * speedK;
    this.far.tilePositionY -= dy * sp.scrollFar * 0.45;
    this.far.tilePositionX -= sp.driftX * 0.5 * dt * speedK;
    this.near.setAlpha(sp.near * 1.45 * (0.75 + 0.6 * pulse) * energy);
    this.far.setAlpha(sp.far * 1.3 * (0.8 + 0.3 * pulse) * energy);
    if (sp.rays) this.rays.setRotation(this.time * 0.12).setAlpha(0.18 + 0.12 * pulse);
    if (sp.ribbons) {
      for (let i = 0; i < 3; i++) {
        const r = this.ribbons[i]!;
        r.setX(this.w / 2 + Math.sin(this.time * (0.25 + i * 0.1) + i * 2) * 120).setAlpha((0.22 + 0.12 * pulse) * (i === 1 ? 1.2 : 0.9));
      }
    }
    const w = this.w;
    const h = this.h;
    for (let i = 0; i < sp.count; i++) {
      const s = this.sprites[i]!;
      let a = sp.alpha;
      let sc = this.ssc[i]!;
      switch (sp.motion) {
        case 'rise':
          this.sy[i] = this.sy[i]! + -this.sv[i]! * speedK * dt + dy * 0.3;
          this.sx[i] = this.sx[i]! + Math.sin(this.time * 2 + this.sph[i]!) * 20 * dt;
          if (this.sy[i]! < -60 || this.sy[i]! > h + 80) this.respawn(i, false);
          a *= 0.6 + 0.4 * Math.sin(this.time * 6 + this.sph[i]!);
          break;
        case 'fall':
          this.sy[i] = this.sy[i]! + this.sv[i]! * speedK * dt + dy * 0.6;
          if (this.sy[i]! > h + 200) this.respawn(i, false);
          break;
        case 'travel':
          this.sy[i] = this.sy[i]! + this.sv[i]! * speedK * dt * 0.5 + dy * 0.45;
          if (this.sy[i]! > h + 40) this.respawn(i, false);
          break;
        case 'radiate': {
          // Stars fly out of a vanishing point near the top, growing as they come.
          const p = (this.sy[i] = this.sy[i]! + dt * (this.sv[i]! / 600) * speedK * (0.4 + this.sy[i]!));
          if (p > 1.2) this.respawn(i, false);
          const ang = this.sph[i]!;
          const dist = p * p * Math.max(w, h) * 0.9;
          s.setPosition(w / 2 + Math.cos(ang) * dist, h * 0.18 + Math.sin(ang) * dist);
          sc *= p;
          a *= Math.min(1, p * 3);
          break;
        }
        case 'swirl': {
          // Round the eye and inward: the nearer the eye, the faster the turn.
          const d = (this.sy[i] = this.sy[i]! - dt * 0.07 * speedK * (0.5 + Math.abs(this.sv[i]!) / Math.abs(sp.speed)));
          if (d < 0.05) this.respawn(i, false);
          const ang = (this.sx[i] = this.sx[i]! + dt * this.sv[i]! * speedK * (0.6 + 0.9 / Math.max(0.15, d)));
          const reach = Math.max(w, h) * 0.62;
          s.setPosition(w / 2 + Math.cos(ang) * d * reach, h * 0.42 + Math.sin(ang) * d * reach * 0.86);
          sc *= 0.35 + 0.65 * d;
          a *= Math.min(1, d * 6) * Math.min(1, (1.05 - d) * 8);
          break;
        }
        case 'twinkle':
          a *= Math.max(0, Math.sin(this.time * 1.7 + this.sph[i]! * 3)) * (0.7 + 0.6 * pulse);
          this.sy[i] = this.sy[i]! + dy * 0.35;
          if (this.sy[i]! > h + 60) {
            this.sy[i] = -40;
            this.sx[i] = Math.random() * w;
          }
          break;
        case 'drift':
          this.sx[i] = this.sx[i]! + Math.cos(this.sph[i]!) * this.sv[i]! * dt * speedK;
          this.sy[i] = this.sy[i]! + Math.sin(this.sph[i]!) * this.sv[i]! * dt * speedK * 0.5 + dy * 0.25;
          if (this.sx[i]! < -120) this.sx[i] = w + 100;
          if (this.sx[i]! > w + 120) this.sx[i] = -100;
          if (this.sy[i]! > h + 120) this.sy[i] = -100;
          if (this.sy[i]! < -140) this.sy[i] = h + 100;
          break;
      }
      if (sp.motion !== 'radiate' && sp.motion !== 'swirl') s.setPosition(this.sx[i], this.sy[i]);
      s.setScale(sp.sprite === 'streak' || sp.sprite === 'w-beam' ? sc * 0.8 : sc * (1 + 0.25 * pulse), sp.sprite === 'streak' ? sc * 1.6 : sp.sprite === 'w-beam' ? sc * 2.4 : sc * (1 + 0.25 * pulse));
      s.setAlpha(Math.min(1, Math.max(0, a) * energy * 1.25));
      if (sp.spin) s.setRotation(this.time * sp.spin + this.sph[i]!);
    }
  }
}
