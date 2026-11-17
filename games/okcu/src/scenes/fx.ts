/**
 * Pooled cosmetic particles: feathers, shards, puffs, flash rings and coins. Created once per
 * scene; `spawn` reuses a dead slot (or steals the oldest), so play never allocates objects.
 * Cosmetic randomness only (Math.random is fine here, never in src/sim).
 */
import type Phaser from 'phaser';
import { PALETTE } from '../textures';

export type FxKind = 'feather' | 'shard' | 'puff' | 'ring' | 'coin' | 'spark';

interface P {
  img: Phaser.GameObjects.Image;
  kind: FxKind;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  g: number;
  drag: number;
  s0: number;
  s1: number;
  a0: number;
  /** coins: fly to (tx, ty) after `home` seconds */
  home: number;
  tx: number;
  ty: number;
  born: number;
  onArrive: (() => void) | null;
}

const TEX: Record<FxKind, string> = { feather: 'feather', shard: 'shard', puff: 'puff', ring: 'ring', coin: 'coin', spark: 'oyun-star' };
const SIZE: Record<FxKind, number> = { feather: 70, shard: 70, puff: 40, ring: 12, coin: 40, spark: 30 };

export class Fx {
  private readonly pools = new Map<FxKind, P[]>();
  private seq = 0;

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, overlay: Phaser.GameObjects.Container) {
    for (const kind of Object.keys(TEX) as FxKind[]) {
      const list: P[] = [];
      for (let i = 0; i < SIZE[kind]; i++) {
        const img = scene.add.image(0, 0, TEX[kind]).setVisible(false);
        (kind === 'coin' ? overlay : parent).add(img);
        list.push({ img, kind, alive: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, life: 0, max: 1, g: 0, drag: 0, s0: 1, s1: 1, a0: 1, home: 0, tx: 0, ty: 0, born: 0, onArrive: null });
      }
      this.pools.set(kind, list);
    }
  }

  private take(kind: FxKind): P {
    const list = this.pools.get(kind)!;
    let oldest = list[0]!;
    for (const p of list) {
      if (!p.alive) return p;
      if (p.born < oldest.born) oldest = p;
    }
    oldest.onArrive?.();
    return oldest;
  }

  spawn(kind: FxKind, x: number, y: number, vx: number, vy: number, o: { life?: number; g?: number; drag?: number; scale?: number; scaleEnd?: number; tint?: number; alpha?: number; vr?: number; rot?: number } = {}): P {
    const p = this.take(kind);
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = 0;
    p.max = o.life ?? 0.6;
    p.g = o.g ?? 0;
    p.drag = o.drag ?? 0;
    p.s0 = o.scale ?? 1;
    p.s1 = o.scaleEnd ?? p.s0;
    p.a0 = o.alpha ?? 1;
    p.rot = o.rot ?? Math.random() * Math.PI * 2;
    p.vr = o.vr ?? 0;
    p.home = 0;
    p.onArrive = null;
    p.born = this.seq++;
    p.img.setVisible(true).setTint(o.tint ?? PALETTE.white).setAlpha(p.a0).setScale(p.s0).setPosition(x, y).setRotation(p.rot);
    return p;
  }

  /** Feathers fluttering out of a knocked-out archer. */
  feathers(x: number, y: number, tint: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 140 + Math.random() * 320;
      const col = i % 3 === 0 ? PALETTE.white : tint;
      this.spawn('feather', x, y, Math.cos(a) * sp, Math.sin(a) * sp - 160, { life: 1.4 + Math.random() * 0.9, g: 260, drag: 2.6, scale: 0.9 + Math.random() * 0.7, tint: col, vr: (Math.random() - 0.5) * 10 });
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      this.spawn('puff', x, y, Math.cos(a) * 160, Math.sin(a) * 160, { life: 0.45, drag: 5, scale: 0.9, scaleEnd: 2.0, alpha: 0.95 });
    }
  }

  /** Cartoon poof: a ring of puffs that swell and drift up, with a few stars. */
  poof(x: number, y: number, tint: number, size = 1): void {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      this.spawn('puff', x + Math.cos(a) * 18 * size, y + Math.sin(a) * 14 * size, Math.cos(a) * 90 * size, Math.sin(a) * 70 * size - 40, { life: 0.55, drag: 4, scale: 0.8 * size, scaleEnd: 1.9 * size, alpha: 1 });
    }
    this.spawn('puff', x, y, 0, -30, { life: 0.5, scale: 1.4 * size, scaleEnd: 2.4 * size, alpha: 1 });
    this.sparks(x, y, 6, tint, 260 * size);
  }

  /** Splinters along the arrow's direction at a hit. */
  shards(x: number, y: number, dir: number, tint: number, n: number, speed = 420): void {
    for (let i = 0; i < n; i++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 2.2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn('shard', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35 + Math.random() * 0.25, g: 900, drag: 1.5, scale: 0.8 + Math.random() * 0.8, scaleEnd: 0.2, tint, vr: (Math.random() - 0.5) * 20 });
    }
  }

  ring(x: number, y: number, tint: number, size = 1, life = 0.25): void {
    this.spawn('ring', x, y, 0, 0, { life, scale: 0.3 * size, scaleEnd: 1.4 * size, tint, alpha: 1 });
  }

  puffs(x: number, y: number, n: number, tint: number = PALETTE.white, speed = 120): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn('puff', x, y, Math.cos(a) * speed * Math.random(), Math.sin(a) * speed * Math.random() - 40, { life: 0.4 + Math.random() * 0.3, drag: 3, scale: 0.5 + Math.random() * 0.4, scaleEnd: 1.3, tint, alpha: 0.85 });
    }
  }

  sparks(x: number, y: number, n: number, tint: number, speed = 300): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35 + Math.random() * 0.3, drag: 3, scale: 0.7 + Math.random() * 0.6, scaleEnd: 0, tint, vr: 8 });
    }
  }

  /** Coins burst out of (x, y) in overlay (screen) space, then fly to (tx, ty). */
  coins(x: number, y: number, n: number, tx: number, ty: number, onEach: () => void): void {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const sp = 300 + Math.random() * 380;
      const p = this.spawn('coin', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 3, g: 1400, drag: 1.2, scale: 1, vr: 0, rot: 0 });
      p.home = 0.32 + i * 0.045;
      p.tx = tx;
      p.ty = ty;
      p.onArrive = onEach;
    }
  }

  update(dt: number): void {
    for (const list of this.pools.values()) {
      for (const p of list) {
        if (!p.alive) continue;
        p.life += dt;
        if (p.kind === 'coin' && p.life > p.home) {
          // home in on the counter with growing pull
          const k = Math.min(1, (p.life - p.home) * 5.5);
          p.x += (p.tx - p.x) * k * k * 0.5 + 0;
          p.y += (p.ty - p.y) * k * k * 0.5;
          const sc = 1 - k * 0.35;
          p.img.setPosition(p.x, p.y).setScale(sc).setScale(sc * Math.abs(Math.cos(p.life * 14)) + 0.15, sc);
          if (Math.abs(p.tx - p.x) < 8 && Math.abs(p.ty - p.y) < 8) {
            p.alive = false;
            p.img.setVisible(false);
            const cb = p.onArrive;
            p.onArrive = null;
            cb?.();
          }
          continue;
        }
        if (p.life >= p.max) {
          p.alive = false;
          p.img.setVisible(false);
          continue;
        }
        const t = p.life / p.max;
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy = p.vy * d + p.g * dt;
        if (p.kind === 'feather') {
          // flutter: sideways sway and slow fall
          p.vx += Math.sin(p.life * 7 + p.born) * 260 * dt;
          if (p.vy > 90) p.vy = 90;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const sc = p.s0 + (p.s1 - p.s0) * t;
        const alpha = p.kind === 'feather' ? p.a0 * Math.min(1, (1 - t) * 3) : p.a0 * (1 - t);
        p.img.setPosition(p.x, p.y).setRotation(p.kind === 'feather' ? Math.sin(p.life * 6 + p.born) * 0.9 : p.rot).setScale(p.kind === 'coin' ? sc * Math.abs(Math.cos(p.life * 14)) + 0.15 : sc, sc).setAlpha(alpha);
      }
    }
  }

  clear(): void {
    for (const list of this.pools.values()) {
      for (const p of list) {
        p.alive = false;
        p.onArrive = null;
        p.img.setVisible(false);
      }
    }
  }
}
