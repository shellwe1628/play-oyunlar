/**
 * Pooled cosmetic particles: a port of the 2D game's scenes/fx.ts (same kinds, speeds, gravity,
 * drag, lifetimes and sizes, in simulation px) drawn as instanced sprites, plus three kinds the
 * 3D view adds for weight: additive glow flashes, motion streaks and light rays, and the firework
 * rocket's burst (`firework`: confetti that flutters down, smoke, coloured stars, sized by radius).
 * `spawn` reuses a dead slot of the kind's pool (or steals the oldest), so play never allocates.
 * Cosmetic randomness only (Math.random is fine here, never in the simulation).
 */
import { PALETTE } from '@okcu/textures';
import { m, sx, sy } from '../../coords';
import { TILE } from './atlas';
import { SpriteBatch } from './batch';
import { type Ribbons } from './ribbons';

export type FxKind = 'puff' | 'feather' | 'shard' | 'confetti' | 'ring' | 'spark' | 'glow' | 'streak' | 'rays';

interface KindDef {
  size: number;
  tile: number;
  /** sprite size at scale 1, px (the 2D texture sizes) */
  w: number;
  h: number;
  add: number;
}

// pool order is draw order: clouds at the back, light on top
const KINDS: Record<FxKind, KindDef> = {
  rays: { size: 3, tile: TILE.rays, w: 520, h: 520, add: 0.85 },
  puff: { size: 64, tile: TILE.puff, w: 66, h: 66, add: 0 },
  feather: { size: 70, tile: TILE.feather, w: 40, h: 18, add: 0 },
  shard: { size: 96, tile: TILE.shard, w: 18, h: 10, add: 0 },
  confetti: { size: 120, tile: TILE.disc, w: 15, h: 9, add: 0 },
  ring: { size: 16, tile: TILE.ring, w: 96, h: 96, add: 0.35 },
  glow: { size: 20, tile: TILE.blob, w: 100, h: 100, add: 1 },
  spark: { size: 96, tile: TILE.star, w: 24, h: 24, add: 0.4 },
  streak: { size: 48, tile: TILE.streak, w: 40, h: 14, add: 1 },
};
const RING_SEGS = 40;
const ORDER: readonly FxKind[] = ['rays', 'puff', 'feather', 'shard', 'confetti', 'ring', 'glow', 'spark', 'streak'];
const CONFETTI = [PALETTE.gold, PALETTE.pink, PALETTE.bubble, PALETTE.leaf, PALETTE.danger, PALETTE.white];

export interface SpawnOpts {
  life?: number;
  g?: number;
  drag?: number;
  scale?: number;
  scaleEnd?: number;
  tint?: number;
  alpha?: number;
  vr?: number;
  rot?: number;
}

export class Particles {
  readonly batch: SpriteBatch;
  private readonly start: Record<FxKind, number>;
  private readonly total: number;
  private readonly alive: Uint8Array;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly rot: Float32Array;
  private readonly vr: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly g: Float32Array;
  private readonly drag: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly a0: Float32Array;
  private readonly tint: Uint32Array;
  private readonly born: Int32Array;
  private seq = 0;

  /** `lines`: shockwave rings are drawn into it as thin circles (begin / commit are the owner's). */
  constructor(renderOrder: number, private readonly lines: Ribbons) {
    let n = 0;
    const start = {} as Record<FxKind, number>;
    for (const k of ORDER) {
      start[k] = n;
      n += KINDS[k].size;
    }
    this.start = start;
    this.total = n;
    this.batch = new SpriteBatch(n, renderOrder);
    this.alive = new Uint8Array(n);
    const f = (): Float32Array => new Float32Array(n);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.rot = f();
    this.vr = f();
    this.life = f();
    this.max = f();
    this.g = f();
    this.drag = f();
    this.s0 = f();
    this.s1 = f();
    this.a0 = f();
    this.tint = new Uint32Array(n);
    this.born = new Int32Array(n);
  }

  spawn(kind: FxKind, x: number, y: number, vx: number, vy: number, o: SpawnOpts = {}): void {
    const from = this.start[kind];
    const to = from + KINDS[kind].size;
    let i = from;
    let oldest = from;
    for (; i < to; i++) {
      if (!this.alive[i]) break;
      if (this.born[i]! < this.born[oldest]!) oldest = i;
    }
    if (i === to) i = oldest;
    this.alive[i] = 1;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = 0;
    this.max[i] = o.life ?? 0.6;
    this.g[i] = o.g ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.s0[i] = o.scale ?? 1;
    this.s1[i] = o.scaleEnd ?? this.s0[i]!;
    this.a0[i] = o.alpha ?? 1;
    this.rot[i] = o.rot ?? Math.random() * Math.PI * 2;
    this.vr[i] = o.vr ?? 0;
    this.tint[i] = o.tint ?? PALETTE.white;
    this.born[i] = this.seq++;
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

  /** Splinters thrown back along the arrow's direction at a hit. */
  shards(x: number, y: number, dir: number, tint: number, n: number, speed = 420): void {
    for (let i = 0; i < n; i++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 2.2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.spawn('shard', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.35 + Math.random() * 0.25, g: 900, drag: 1.5, scale: 0.8 + Math.random() * 0.8, scaleEnd: 0.2, tint, vr: (Math.random() - 0.5) * 20 });
    }
  }

  /**
   * A firework rocket's burst of radius `r` px (the simulation's blast radius): a white flash and
   * two shockwaves out to `r`, coloured stars and streaks thrown to its edge, paper confetti that
   * flutters down, and a ring of smoke that swells and drifts up.
   */
  firework(x: number, y: number, r: number, calm = false): void {
    // a ring reaches 40 × 1.4 × size px
    this.ring(x, y, PALETTE.white, r / 56, 0.32);
    this.ring(x, y, PALETTE.gold, r / 70, 0.45);
    this.flash(x, y, PALETTE.white, r * 1.6, 0.12, 0.95);
    this.flash(x, y, PALETTE.gold, r * 2.6, 0.3, 0.6);
    const n = calm ? 10 : 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const col = CONFETTI[i % 4]!;
      // stars: drag 3 over ~0.6 s travels ≈ 0.28 × speed: out to the radius
      const sp = r * (3.2 + Math.random() * 0.6);
      this.spawn('spark', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.55 + Math.random() * 0.25, drag: 3, g: 120, scale: 1 + Math.random() * 0.5, scaleEnd: 0.1, tint: col, vr: 8 });
      if (i % 2 === 0) this.spawn('streak', x, y, Math.cos(a) * sp * 0.9, Math.sin(a) * sp * 0.9, { life: 0.22 + Math.random() * 0.1, drag: 4.5, g: 200, scale: 1, tint: col });
    }
    for (let i = 0; i < (calm ? 18 : 40); i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random());
      const sp = r * (1.2 + 2.2 * d);
      this.spawn('confetti', x, y, Math.cos(a) * sp, Math.sin(a) * sp - r * 0.8, { life: 1.3 + Math.random() * 0.9, g: 420, drag: 3.2, scale: 0.8 + Math.random() * 0.6, tint: CONFETTI[i % CONFETTI.length]!, vr: (Math.random() - 0.5) * 14 });
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const k = r / 145;
      this.spawn('puff', x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9 - 50, { life: 0.9 + Math.random() * 0.3, drag: 3, scale: 0.9 * k, scaleEnd: 2.4 * k, tint: PALETTE.smoke, alpha: 0.75 });
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

  /** A burst of light: `size` is the diameter in px at its peak. */
  flash(x: number, y: number, tint: number, size: number, life = 0.14, alpha = 0.9): void {
    this.spawn('glow', x, y, 0, 0, { life, scale: (size / 100) * 0.55, scaleEnd: size / 100, tint, alpha, rot: 0 });
  }

  /** Hot streaks thrown in a cone around `dir` (radians, sim frame); `spread` is the full cone. */
  streaks(x: number, y: number, dir: number, spread: number, n: number, tint: number, speed: number): void {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = speed * (0.55 + Math.random() * 0.6);
      this.spawn('streak', x, y, Math.cos(a) * sp, Math.sin(a) * sp, { life: 0.16 + Math.random() * 0.14, drag: 4.5, g: 300, scale: 0.7 + Math.random() * 0.6, tint });
    }
  }

  update(dt: number): void {
    const b = this.batch;
    for (const kind of ORDER) {
      const def = KINDS[kind];
      const from = this.start[kind];
      const to = from + def.size;
      for (let i = from; i < to; i++) {
        if (!this.alive[i]) continue;
        const life = (this.life[i] = this.life[i]! + dt);
        if (life >= this.max[i]!) {
          this.alive[i] = 0;
          b.hide(i);
          continue;
        }
        const t = life / this.max[i]!;
        const d = Math.max(0, 1 - this.drag[i]! * dt);
        this.vx[i] = this.vx[i]! * d;
        this.vy[i] = this.vy[i]! * d + this.g[i]! * dt;
        if (kind === 'feather') {
          // flutter: sideways sway and slow fall
          this.vx[i] = this.vx[i]! + Math.sin(life * 7 + this.born[i]!) * 260 * dt;
          if (this.vy[i]! > 90) this.vy[i] = 90;
        } else if (kind === 'confetti') {
          // paper: sways, falls slowly once the burst has spent itself
          this.vx[i] = this.vx[i]! + Math.sin(life * 9 + this.born[i]!) * 180 * dt;
          if (this.vy[i]! > 120) this.vy[i] = 120;
        }
        if (kind === 'ring') {
          // a shockwave: bursts out fast, thins as it goes
          const e = 1 - (1 - t) ** 2.4;
          const r = 40 * (this.s0[i]! + (this.s1[i]! - this.s0[i]!) * e);
          const half = (1.4 + 7 * Math.min(1.6, this.s1[i]! / 1.4) ** 0.6 * (1 - e)) * 0.5 + 0.6;
          const a = this.a0[i]! * Math.min(1, (1 - t) * 1.7);
          const cx = this.x[i]!;
          const cy = this.y[i]!;
          this.lines.strip();
          for (let k = 0; k <= RING_SEGS; k++) {
            const ang = (k / RING_SEGS) * Math.PI * 2;
            this.lines.point(sx(cx + Math.cos(ang) * r), sy(cy + Math.sin(ang) * r), 0, m(half), this.tint[i]!, a, 0.3, 0.12);
          }
          this.lines.strip();
          for (let k = 0; k <= RING_SEGS; k++) {
            const ang = (k / RING_SEGS) * Math.PI * 2;
            this.lines.point(sx(cx + Math.cos(ang) * r), sy(cy + Math.sin(ang) * r), 0, m(half * 3.2 + 3), this.tint[i]!, a * 0.3, 1, 1);
          }
          b.hide(i);
          continue;
        }
        const x = (this.x[i] = this.x[i]! + this.vx[i]! * dt);
        const y = (this.y[i] = this.y[i]! + this.vy[i]! * dt);
        this.rot[i] = this.rot[i]! + this.vr[i]! * dt;
        // rings and flashes burst out fast and settle (the 2D ring grows linearly; this reads heavier)
        const e = kind === 'glow' || kind === 'rays' ? 1 - (1 - t) * (1 - t) : t;
        const sc = this.s0[i]! + (this.s1[i]! - this.s0[i]!) * e;
        let alpha = kind === 'feather' || kind === 'confetti' ? this.a0[i]! * Math.min(1, (1 - t) * 3) : this.a0[i]! * (1 - t);
        let w = def.w * sc;
        let h = def.h * sc;
        let rot = -this.rot[i]!;
        if (kind === 'feather') rot = -Math.sin(life * 6 + this.born[i]!) * 0.9;
        else if (kind === 'confetti') h *= 0.25 + 0.75 * Math.abs(Math.cos(life * 11 + this.born[i]!));
        else if (kind === 'streak') {
          const sp = Math.hypot(this.vx[i]!, this.vy[i]!);
          rot = -Math.atan2(this.vy[i]!, this.vx[i]!);
          w = (14 + sp * 0.075) * sc;
          h = 9 * sc;
          alpha = this.a0[i]! * Math.min(1, (1 - t) * 2);
        } else if (kind === 'rays') alpha = this.a0[i]! * Math.min(1, (1 - t) * 2.2);
        b.put(i, sx(x), sy(y), 0, m(w), m(h), rot, this.tint[i]!, alpha, def.tile, def.add);
      }
    }
    b.commit();
  }

  clear(): void {
    this.alive.fill(0);
    this.batch.hideRange(0, this.total);
    this.batch.commit();
  }
}
