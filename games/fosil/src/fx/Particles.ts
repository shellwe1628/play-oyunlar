import type Phaser from 'phaser';

export interface EmitOptions {
  texture?: string;
  tint?: number;
  /** Speed range px/s and direction (radians) with spread. */
  speed?: [number, number];
  angle?: number;
  spread?: number;
  gravity?: number;
  life?: [number, number];
  scale?: [number, number];
  /** Scale at end of life relative to start (0..1+). */
  endScale?: number;
  spin?: number;
  /** y of the floor: particles bounce there and settle (rubble). */
  floor?: number;
  bounce?: number;
  alpha?: number;
  /** Fade only during the last part of life (0..1 of life). */
  fadeTail?: number;
  drag?: number;
}

/**
 * Fixed pool of particles updated by hand: no allocation per emit or per frame. When the pool is
 * full the oldest particle is reused, so a tap flurry can never pile up work.
 */
export class Particles {
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly g: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly spin: Float32Array;
  private readonly floor: Float32Array;
  private readonly bounce: Float32Array;
  private readonly a0: Float32Array;
  private readonly tail: Float32Array;
  private readonly drag: Float32Array;
  private next = 0;
  active = 0;

  constructor(
    scene: Phaser.Scene,
    readonly size: number,
    depth: number,
  ) {
    for (let i = 0; i < size; i++) this.imgs.push(scene.add.image(0, 0, 'oyun-dot').setVisible(false).setDepth(depth));
    const f = (): Float32Array => new Float32Array(size);
    this.x = f();
    this.y = f();
    this.vx = f();
    this.vy = f();
    this.g = f();
    this.life = f();
    this.max = f();
    this.s0 = f();
    this.s1 = f();
    this.spin = f();
    this.floor = f();
    this.bounce = f();
    this.a0 = f();
    this.tail = f();
    this.drag = f();
  }

  emit(x: number, y: number, count: number, o: EmitOptions = {}): void {
    const [smin, smax] = o.speed ?? [80, 200];
    const [lmin, lmax] = o.life ?? [0.3, 0.5];
    const [cmin, cmax] = o.scale ?? [0.5, 1];
    const spread = o.spread ?? Math.PI * 2;
    const base = o.angle ?? 0;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.size;
      const img = this.imgs[i]!;
      if (o.texture && img.texture.key !== o.texture) img.setTexture(o.texture);
      else if (!o.texture && img.texture.key !== 'oyun-dot') img.setTexture('oyun-dot');
      img.setTint(o.tint ?? 0xffffff).setVisible(true).setAngle(Math.random() * 360);
      const a = base + (Math.random() - 0.5) * spread;
      const sp = smin + Math.random() * (smax - smin);
      this.x[i] = x;
      this.y[i] = y;
      this.vx[i] = Math.cos(a) * sp;
      this.vy[i] = Math.sin(a) * sp;
      this.g[i] = o.gravity ?? 0;
      this.max[i] = lmin + Math.random() * (lmax - lmin);
      this.life[i] = this.max[i]!;
      this.s0[i] = cmin + Math.random() * (cmax - cmin);
      this.s1[i] = this.s0[i] * (o.endScale ?? 0.2);
      this.spin[i] = (Math.random() - 0.5) * (o.spin ?? 0);
      this.floor[i] = o.floor ?? 1e9;
      this.bounce[i] = o.bounce ?? 0;
      this.a0[i] = o.alpha ?? 1;
      this.tail[i] = o.fadeTail ?? 1;
      this.drag[i] = o.drag ?? 0;
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const life = this.life[i]!;
      if (life <= 0) continue;
      const img = this.imgs[i]!;
      const left = life - dt;
      this.life[i] = left;
      if (left <= 0) {
        img.setVisible(false);
        continue;
      }
      n++;
      const drag = 1 - this.drag[i]! * dt;
      this.vx[i] = this.vx[i]! * drag;
      this.vy[i] = (this.vy[i]! + this.g[i]! * dt) * drag;
      let y = this.y[i]! + this.vy[i]! * dt;
      const x = this.x[i]! + this.vx[i]! * dt;
      if (y > this.floor[i]!) {
        y = this.floor[i]!;
        this.vy[i] = -this.vy[i]! * this.bounce[i]!;
        this.vx[i] = this.vx[i]! * 0.6;
        this.spin[i] = this.spin[i]! * 0.5;
        if (Math.abs(this.vy[i]!) < 40) this.vy[i] = 0;
      }
      this.x[i] = x;
      this.y[i] = y;
      const t = 1 - left / this.max[i]!; // 0 → 1
      const tail = this.tail[i]!;
      const fade = t < 1 - tail ? 1 : (1 - t) / tail;
      img.setPosition(x, y);
      img.setScale(this.s0[i]! + (this.s1[i]! - this.s0[i]!) * t);
      img.setAlpha(this.a0[i]! * fade);
      if (this.spin[i] !== 0) img.rotation += this.spin[i]! * dt;
    }
    this.active = n;
  }

  /** Hide everything (scene change, layer travel). */
  clear(): void {
    for (let i = 0; i < this.size; i++) {
      this.life[i] = 0;
      this.imgs[i]!.setVisible(false);
    }
  }
}
