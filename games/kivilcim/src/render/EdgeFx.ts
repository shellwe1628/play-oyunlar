/**
 * Living walls: a glow that pulses on the beat along both edges, a highlight that travels down
 * each wall, and ripples that run along a wall from a near miss. One additive Graphics in the
 * world container, a handful of line segments per frame over the visible part only; the baked
 * wall chunks are never touched. Fixed ripple pool, no per-frame allocation.
 */
import Phaser from 'phaser';
import { segmentAt, wallXAt, type Track } from '../sim/track';

const RIPPLES = 6;

export class EdgeFx {
  readonly g: Phaser.GameObjects.Graphics;
  private readonly ry = new Float32Array(RIPPLES);
  private readonly rt = new Float32Array(RIPPLES).fill(-1);
  private readonly rs = new Int8Array(RIPPLES);
  private next = 0;
  private time = 0;
  color = 0xffffff;

  constructor(scene: Phaser.Scene, world: Phaser.GameObjects.Container) {
    this.g = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    world.add(this.g);
  }

  /** A near miss at height y on the left (-1) or right (1) wall. */
  ripple(y: number, side: -1 | 1): void {
    const i = this.next++ % RIPPLES;
    this.ry[i] = y;
    this.rt[i] = 0;
    this.rs[i] = side;
  }

  clear(): void {
    this.rt.fill(-1);
    this.g.clear();
  }

  /** Stroke wall `xs` between heights a and b (world y; drawn at local y = -y). */
  private stroke(track: Track, xs: Float64Array, a: number, b: number): void {
    const wy = track.wy;
    const g = this.g;
    let i = segmentAt(wy, a);
    let px = wallXAt(wy, xs, i, a);
    let py = a;
    while (i < wy.length - 1) {
      const end = Math.min(b, wy[i + 1]!);
      const x = wallXAt(wy, xs, i, end);
      g.lineBetween(px, -py, x, -end);
      px = x;
      py = end;
      if (end >= b) break;
      i++;
    }
  }

  update(track: Track, sy: number, lo: number, hi: number, pulse: number, dt: number, speedK: number): void {
    this.time += dt;
    const g = this.g;
    g.clear();
    // Beat pulse along both edges.
    if (pulse > 0.04) {
      g.lineStyle(10, this.color, 0.32 * pulse);
      this.stroke(track, track.lx, lo, hi);
      this.stroke(track, track.rx, lo, hi);
    }
    // A highlight running down each wall (toward the player), faster after FAST.
    const span = hi - lo;
    const off = (this.time * 520 * speedK) % span;
    const hy = hi - off;
    g.lineStyle(6, 0xffffff, 0.65);
    this.stroke(track, track.lx, Math.max(lo, hy - 70), Math.min(hi, hy + 70));
    const hy2 = hi - ((off + span * 0.5) % span);
    this.stroke(track, track.rx, Math.max(lo, hy2 - 70), Math.min(hi, hy2 + 70));
    // Near-miss ripples: two bright pieces running away from the contact point.
    for (let i = 0; i < RIPPLES; i++) {
      const t = this.rt[i]!;
      if (t < 0) continue;
      const nt = t + dt;
      if (nt > 0.55) {
        this.rt[i] = -1;
        continue;
      }
      this.rt[i] = nt;
      const d = nt * 900;
      const a = 1 - nt / 0.55;
      const xs = this.rs[i] === -1 ? track.lx : track.rx;
      g.lineStyle(8 * a + 2, 0xffffff, 0.9 * a);
      const y0 = this.ry[i]!;
      this.stroke(track, xs, Math.max(lo, y0 + d - 40), Math.min(hi, y0 + d + 40));
      this.stroke(track, xs, Math.max(lo, y0 - d - 40), Math.min(hi, y0 - d + 40));
    }
    void sy;
  }
}
