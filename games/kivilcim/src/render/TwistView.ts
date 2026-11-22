/**
 * Twist gates: the line across a calm chamber where the view changes. Each kind of twist has
 * its own look (dive: chevrons parting both ways, side: quarter-turn arrows, lean and rock:
 * slanted strokes, zoom: brackets that spread or pinch); the way back to the normal view is a
 * plain mint band, like the NORMAL gate. Drawn in world space with two Graphics (one additive)
 * for the gates in view only; every glyph is symmetric about its line, so it reads the same
 * whichever way the view is flipped. Presentation only; no per-frame allocation.
 */
import Phaser from 'phaser';
import { lowerBound, segmentAt, wallXAt, type Track, type TwistKind } from '../sim/track';

export const TWIST_COLORS: Readonly<Record<TwistKind, number>> = {
  dive: 0x3fd0ff,
  side: 0xffa53b,
  tilt: 0x9dff3a,
  rock: 0x9dff3a,
  far: 0xff6be1,
  near: 0xff6be1,
};
/** Back to the normal view. */
export const TWIST_OUT_COLOR = 0x7dffb0;

interface Line {
  y: number;
  kind: TwistKind;
  amount: number;
  /** The gate that ends a twist. */
  out: boolean;
}

const BAND = 34;

export class TwistView {
  readonly g: Phaser.GameObjects.Graphics;
  readonly glow: Phaser.GameObjects.Graphics;
  private track: Track | null = null;
  private lines: Line[] = [];
  /** Off under ?fx=0 / ?twist=0: nothing is drawn. */
  on = true;

  constructor(scene: Phaser.Scene, world: Phaser.GameObjects.Container) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.g = scene.add.graphics();
    world.add([this.glow, this.g]);
  }

  /** Gate lines of a track: the middle of each ease (one line where several twists share it). */
  setTrack(track: Track): void {
    this.track = track;
    const lines: Line[] = [];
    for (const t of track.twists) {
      if (t.ease <= 0) continue;
      for (const out of [false, true]) {
        const y = out ? t.y1 - t.ease / 2 : t.y0 + t.ease / 2;
        // Flips first: a dive or side gate wins the line it shares with a lean or a zoom.
        const same = lines.find((l) => l.out === out && Math.abs(l.y - y) < 400);
        if (same) {
          if ((t.kind === 'dive' || t.kind === 'side') && same.kind !== 'dive' && same.kind !== 'side') {
            same.kind = t.kind;
            same.amount = t.amount;
            same.y = y;
          }
          continue;
        }
        lines.push({ y, kind: t.kind, amount: t.amount, out });
      }
    }
    this.lines = lines.sort((a, b) => a.y - b.y);
  }

  /** Redraw the gates between sy - below and sy + above. */
  update(sy: number, below: number, above: number, pulse: number, now: number): void {
    const g = this.g;
    const gl = this.glow;
    g.clear();
    gl.clear();
    const tr = this.track;
    if (!tr || !this.on || !this.lines.length) return;
    const lo = sy - below - 80;
    const hi = sy + above + 80;
    for (let i = lowerBound(this.lines, lo); i < this.lines.length; i++) {
      const ln = this.lines[i]!;
      if (ln.y > hi) break;
      const si = segmentAt(tr.wy, ln.y);
      const l = wallXAt(tr.wy, tr.lx, si, ln.y);
      const r = wallXAt(tr.wy, tr.rx, si, ln.y);
      const passed = sy > ln.y + 40;
      const a = passed ? 0.3 : 1;
      const color = ln.out ? TWIST_OUT_COLOR : TWIST_COLORS[ln.kind];
      const y = -ln.y;
      if (passed) {
        // Crossed: only two dim rails stay (a translucent band behind the spark reads as a fault).
        for (const ry of [y - BAND * 0.4, y + BAND * 0.4]) g.lineStyle(3, color, 0.35).lineBetween(l, ry, r, ry);
        continue;
      }
      // The band: a soft glow, a dark core so the glyphs read, two bright rails.
      gl.fillStyle(color, (passed ? 0.06 : 0.16 + 0.12 * pulse)).fillRect(l - 20, y - BAND - 46, r - l + 40, 2 * BAND + 92);
      gl.fillStyle(color, (passed ? 0.08 : 0.22 + 0.1 * pulse)).fillRect(l, y - BAND - 12, r - l, 2 * BAND + 24);
      g.fillStyle(0x10042a, 0.55 * a).fillRect(l, y - BAND, r - l, 2 * BAND);
      for (const ry of [y - BAND, y + BAND]) {
        g.lineStyle(6, color, a).lineBetween(l, ry, r, ry);
        g.lineStyle(2, 0xffffff, 0.9 * a).lineBetween(l, ry, r, ry);
      }
      const n = Math.max(3, Math.floor((r - l) / 86));
      const step = (r - l) / n;
      const t = now / 1000;
      g.lineStyle(5, 0xffffff, 0.95 * a);
      for (let k = 0; k < n; k++) {
        const x = l + step * (k + 0.5);
        if (ln.out) {
          // Level bars: calm.
          g.lineBetween(x - 16, y - 8, x + 16, y - 8);
          g.lineBetween(x - 16, y + 8, x + 16, y + 8);
          continue;
        }
        switch (ln.kind) {
          case 'dive': {
            // Chevrons parting from the line, both ways.
            const o = passed ? 12 : 8 + ((t * 26 + k * 5) % 14);
            g.lineBetween(x - 14, y - o + 9, x, y - o - 5);
            g.lineBetween(x, y - o - 5, x + 14, y - o + 9);
            g.lineBetween(x - 14, y + o - 9, x, y + o + 5);
            g.lineBetween(x, y + o + 5, x + 14, y + o - 9);
            break;
          }
          case 'side': {
            // A quarter turn: up, then across, with an arrow head (and its mirror image).
            const o = passed ? 0 : Math.sin(t * 5 + k) * 3;
            for (const s of [-1, 1]) {
              g.lineBetween(x - 15, y + s * (20 + o), x - 15, y + s * 7);
              g.lineBetween(x - 15, y + s * 7, x + 13, y + s * 7);
              g.lineBetween(x + 13, y + s * 7, x + 4, y + s * 14);
              g.lineBetween(x + 13, y + s * 7, x + 4, y);
            }
            break;
          }
          case 'tilt':
          case 'rock': {
            // Strokes leaning the way the world will lean (a rock sways).
            const lean = ln.kind === 'rock' ? Math.sin(t * 2.2 + k * 0.4) * 0.5 : Math.sign(ln.amount || 1) * 0.42;
            const dx = Math.sin(lean) * 24;
            const dy = Math.cos(lean) * 24;
            g.lineBetween(x - dx, y + dy, x + dx, y - dy);
            break;
          }
          case 'far':
          case 'near': {
            // Brackets spreading from the middle (far) or closing on it (near).
            const side = x < (l + r) / 2 ? -1 : 1;
            const dir = ln.kind === 'far' ? side : -side;
            const o = passed ? 0 : ((t * 22 + k * 3) % 10) * dir;
            g.lineBetween(x + o - dir * 8, y - 16, x + o + dir * 8, y);
            g.lineBetween(x + o + dir * 8, y, x + o - dir * 8, y + 16);
            break;
          }
        }
      }
    }
  }
}
