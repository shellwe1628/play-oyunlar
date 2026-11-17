/**
 * Draws the world-2+ mechanics in world space with one Graphics, redrawn per frame for the
 * visible range only: split islands and moving walls (pills), lasers, spinners, portal pairs,
 * wind zones and the mirror axis. Shapes are drawn from the same functions the sim collides with
 * (pillX, laserOn, spinnerAngle) at the spark's interpolated time, a few px outside the lethal
 * shape. The dark-section overlay and the mirror twin are screen objects owned by the scene;
 * this class says how dark it is and whether the twin is out. No per-frame allocation.
 */
import Phaser from 'phaser';
import { SHAFT_W } from '../sim/constants';
import { laserOn, lowerBound, pillX, segmentAt, spinnerAngle, wallXAt, zoneAt, type Track } from '../sim/track';
import { PALETTE, type Palette } from '../textures';

const LIVE = 0xff3d5a;
const PORTAL_COLORS = [0x3ff6ff, 0xff5ad1, 0x9dff3a, 0xffb02e] as const;
const WIND = 0xbff4ff;

export class MechView {
  readonly g: Phaser.GameObjects.Graphics;
  /** Additive layer: glows (beams, rings, streaks). */
  readonly glow: Phaser.GameObjects.Graphics;
  private track!: Track;
  private pal!: Palette;
  /** Presentation switch: off draws only the lethal shapes, flat. */
  fx = true;

  constructor(scene: Phaser.Scene, world: Phaser.GameObjects.Container) {
    this.glow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.g = scene.add.graphics();
    world.add([this.glow, this.g]);
  }

  setTrack(track: Track, pal: Palette): void {
    this.track = track;
    this.pal = pal;
  }

  setPalette(pal: Palette): void {
    this.pal = pal;
  }

  /** Darkness 0..1 at height y (fades in and out over 260 px at the zone ends). */
  darkness(y: number): number {
    const zs = this.track.darks;
    let best = 0;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i]!;
      if (y < z.y0 - 260 || y > z.y1 + 260) continue;
      const a = Math.min(1, (y - z.y0 + 260) / 260, (z.y1 + 260 - y) / 260);
      if (a > best) best = a;
    }
    return best;
  }

  inMirror(y: number): boolean {
    return this.track.mirrors.length > 0 && zoneAt(this.track.mirrors, y) >= 0;
  }

  /**
   * Redraw for the spark at world height sy, sim time t (interpolated), speed v (px/s) and beat
   * pulse; lo..hi is the visible world range.
   */
  update(sy: number, sparkX: number, t: number, v: number, pulse: number, now: number): void {
    const g = this.g;
    const gl = this.glow;
    g.clear();
    gl.clear();
    const tr = this.track;
    if (!tr) return;
    const lo = sy - 420;
    const hi = sy + 1050;
    const fx = this.fx;
    const edge = this.pal.edge;

    // Wind zones: streaks blowing across the zone, chevrons at its start.
    for (let i = 0; i < tr.winds.length; i++) {
      const w = tr.winds[i]!;
      if (w.y1 < lo || w.y0 > hi) continue;
      const dir = w.w > 0 ? 1 : -1;
      const y0 = Math.max(lo, w.y0);
      const y1 = Math.min(hi, w.y1);
      const n = 18;
      for (let k = 0; k < n; k++) {
        const yy = w.y0 + ((k * 197) % Math.max(1, w.y1 - w.y0));
        if (yy < y0 || yy > y1) continue;
        const sp = 260 + (k % 5) * 70;
        const x = (((k * 131 + (now / 1000) * sp * dir * Math.abs(w.w) * 2.4) % SHAFT_W) + SHAFT_W) % SHAFT_W;
        const l = 40 + (k % 3) * 30;
        gl.lineStyle(3, WIND, fx ? 0.35 : 0.25).lineBetween(x, -yy, x + dir * l, -yy - 6);
      }
      if (w.y0 > lo && w.y0 < hi) {
        const si = segmentAt(tr.wy, w.y0);
        const l = wallXAt(tr.wy, tr.lx, si, w.y0);
        const r = wallXAt(tr.wy, tr.rx, si, w.y0);
        for (let c = 0; c < 4; c++) {
          const cx = l + ((r - l) * (c + 0.5)) / 4;
          const pop = 0.6 + 0.4 * pulse;
          g.lineStyle(6, WIND, 0.8 * pop).lineBetween(cx - dir * 14, -w.y0 + 14, cx + dir * 6, -w.y0).lineBetween(cx + dir * 6, -w.y0, cx - dir * 14, -w.y0 - 14);
        }
      }
    }

    // Mirror sections: the axis the twin is reflected in.
    for (let i = 0; i < tr.mirrors.length; i++) {
      const z = tr.mirrors[i]!;
      if (z.y1 < lo || z.y0 > hi) continue;
      const y0 = Math.max(lo, z.y0);
      const y1 = Math.min(hi, z.y1);
      const dash = 40;
      const off = (now / 20) % (dash * 2);
      for (let y = y0 - (y0 % (dash * 2)) + off; y < y1; y += dash * 2) gl.lineStyle(4, 0xc8b8ff, 0.4 + 0.2 * pulse).lineBetween(SHAFT_W / 2, -y, SHAFT_W / 2, -Math.min(y1, y + dash));
      for (const yy of [z.y0, z.y1]) if (yy > lo && yy < hi) gl.lineStyle(8, 0xc8b8ff, 0.5).lineBetween(SHAFT_W / 2 - 60, -yy, SHAFT_W / 2 + 60, -yy);
    }

    // Pills: static islands look like wall; moving walls get hazard stripes and a travel rail.
    const pills = tr.pills;
    for (let k = lowerBound(pills, lo - 420); k < pills.length; k++) {
      const p = pills[k]!;
      if (p.y - p.hl - p.r > hi) break;
      if (p.y + p.hl + p.r < lo) continue;
      const x = pillX(p, t);
      const top = -(p.y + p.hl);
      const h = 2 * p.hl;
      if (p.amp > 0) {
        gl.lineStyle(10, edge, 0.12).lineBetween(p.x0 - p.amp, -p.y, p.x0 + p.amp, -p.y);
        g.fillStyle(0x2a0d18, 1).fillRoundedRect(x - p.r - 2, top - p.r - 2, 2 * p.r + 4, h + 2 * p.r + 4, p.r + 2);
        g.fillStyle(PALETTE.gold, 1);
        for (let s = 0; s < 5; s++) g.fillRect(x - p.r + 6, top - p.r + 18 + s * ((h + 2 * p.r - 30) / 4) - 4, 2 * p.r - 12, 8);
        g.lineStyle(4, LIVE, 1).strokeRoundedRect(x - p.r - 2, top - p.r - 2, 2 * p.r + 4, h + 2 * p.r + 4, p.r + 2);
        if (fx) gl.fillStyle(LIVE, 0.18 + 0.15 * pulse).fillCircle(x, -p.y, p.r * 1.6);
      } else {
        g.fillStyle(this.pal.wallDeep, 1).fillRoundedRect(x - p.r - 2, top - p.r - 2, 2 * p.r + 4, h + 2 * p.r + 4, p.r + 2);
        g.fillStyle(this.pal.wall, 1).fillRoundedRect(x - p.r + 6, top - p.r + 6, 2 * p.r - 12, h + 2 * p.r - 12, Math.max(4, p.r - 6));
        g.lineStyle(4, edge, 1).strokeRoundedRect(x - p.r - 2, top - p.r - 2, 2 * p.r + 4, h + 2 * p.r + 4, p.r + 2);
        if (fx) gl.lineStyle(10, edge, 0.18 + 0.2 * pulse).strokeRoundedRect(x - p.r - 6, top - p.r - 6, 2 * p.r + 12, h + 2 * p.r + 12, p.r + 6);
      }
    }

    // Lasers and portal fences.
    const lasers = tr.lasers;
    for (let k = lowerBound(lasers, lo); k < lasers.length; k++) {
      const l = lasers[k]!;
      if (l.y > hi) break;
      const y = -l.y;
      const x0 = Math.max(0, l.x0);
      const x1 = Math.min(SHAFT_W, l.x1);
      if (l.duty >= 1) {
        // Fence of a portal pair: always on.
        gl.lineStyle(18, 0xb06bff, 0.25 + 0.15 * pulse).lineBetween(x0, y, x1, y);
        g.lineStyle(2 * l.thick + 2, 0x8a3dff, 1).lineBetween(x0, y, x1, y);
        g.lineStyle(3, 0xffffff, 0.9).lineBetween(x0, y, x1, y);
        continue;
      }
      const on = laserOn(l, t);
      // Which half is live when the spark gets here (climb is input-independent): warn early.
      const eta = (l.y - sy) / Math.max(1, v);
      const liveAtArrival = eta > 0 && eta < 1.2 && laserOn(l, t + eta);
      if (on) {
        gl.lineStyle(40, LIVE, 0.35 + 0.2 * pulse).lineBetween(x0, y, x1, y);
        g.lineStyle(2 * l.thick + 4, LIVE, 1).lineBetween(x0, y, x1, y);
        g.lineStyle(5, 0xffffff, 1).lineBetween(x0, y, x1, y);
      } else {
        // Off: a dim dashed line; it flickers just before switching on.
        const f = l.period * (1 - l.duty);
        const ph = t / l.period + l.phase;
        const toOn = (1 - (ph - Math.floor(ph))) * l.period;
        const soon = toOn < 0.16 && toOn < f;
        const a = soon ? 0.5 + 0.4 * (Math.floor(now / 40) % 2) : 0.42;
        for (let x = x0; x < x1; x += 28) g.lineStyle(6, LIVE, a).lineBetween(x, y, Math.min(x1, x + 14), y);
      }
      if (fx && liveAtArrival && !on) {
        // Warning chevrons over the half that will be lit as you arrive.
        const mid = (x0 + x1) / 2;
        const a = Math.min(1, (1.2 - eta) / 0.6) * 0.75;
        g.lineStyle(5, LIVE, a).lineBetween(mid - 16, y - 26, mid, y - 12).lineBetween(mid, y - 12, mid + 16, y - 26);
      }
      // Emitters at the ends.
      g.fillStyle(0x14062b, 1).fillCircle(l.x0 < l.x1 - 1 ? x0 + 6 : x0, y, 10);
      g.fillStyle(on ? LIVE : 0x55203a, 1).fillCircle(x0 + 6, y, 6).fillCircle(x1 - 6, y, 6);
    }

    // Portal pairs: two rings in matching colours, an arc linking them.
    const portals = tr.portals;
    for (let k = lowerBound(portals, lo); k < portals.length; k++) {
      const p = portals[k]!;
      if (p.y > hi) break;
      const col = PORTAL_COLORS[k % PORTAL_COLORS.length]!;
      const y = -p.y;
      const safe = p.r - 19;
      for (const x of [p.xa, p.xb]) {
        gl.fillStyle(col, 0.18 + 0.12 * pulse).fillCircle(x, y, p.r);
        g.lineStyle(6, col, 1).strokeCircle(x, y, p.r);
        g.lineStyle(2, 0xffffff, 0.8).strokeCircle(x, y, safe);
        // Rotating dashes.
        for (let d = 0; d < 6; d++) {
          const a = now / 300 + (d * Math.PI) / 3;
          g.lineStyle(5, 0xffffff, 0.9).lineBetween(x + Math.cos(a) * (p.r - 8), y + Math.sin(a) * (p.r - 8) * 0.5, x + Math.cos(a + 0.35) * (p.r - 8), y + Math.sin(a + 0.35) * (p.r - 8) * 0.5);
        }
      }
      if (fx) {
        const mx = (p.xa + p.xb) / 2;
        const span = p.xb - p.xa;
        let lx = p.xa;
        let ly = y;
        for (let s = 1; s <= 10; s++) {
          const f = s / 10;
          const x = p.xa + span * f;
          const yy = y - Math.sin(f * Math.PI) * 70;
          gl.lineStyle(4, col, 0.45).lineBetween(lx, ly, x, yy);
          lx = x;
          ly = yy;
        }
        void mx;
      }
    }

    // Spinners: a rotating capsule on a hub, with a ghost of where it was.
    const sp = tr.spinners;
    for (let k = lowerBound(sp, lo - 170); k < sp.length; k++) {
      const s = sp[k]!;
      if (s.y - s.len > hi) break;
      const a = spinnerAngle(s, t);
      const ux = Math.cos(a) * s.len;
      const uy = Math.sin(a) * s.len;
      if (fx) {
        const a2 = a - s.omega * 0.08;
        gl.lineStyle(2 * s.thick, LIVE, 0.25).lineBetween(s.x - Math.cos(a2) * s.len, -(s.y - Math.sin(a2) * s.len), s.x + Math.cos(a2) * s.len, -(s.y + Math.sin(a2) * s.len));
        gl.lineStyle(1.5, LIVE, 0.25).strokeCircle(s.x, -s.y, s.len + s.thick);
      }
      g.lineStyle(2 * s.thick + 4, 0x14062b, 1).lineBetween(s.x - ux, -(s.y - uy), s.x + ux, -(s.y + uy));
      g.fillStyle(0x14062b, 1).fillCircle(s.x - ux, -(s.y - uy), s.thick + 2).fillCircle(s.x + ux, -(s.y + uy), s.thick + 2);
      g.lineStyle(2 * s.thick - 4, LIVE, 1).lineBetween(s.x - ux, -(s.y - uy), s.x + ux, -(s.y + uy));
      g.fillStyle(LIVE, 1).fillCircle(s.x - ux, -(s.y - uy), s.thick - 2).fillCircle(s.x + ux, -(s.y + uy), s.thick - 2);
      g.lineStyle(3, 0xffffff, 0.9).lineBetween(s.x - ux * 0.9, -(s.y - uy * 0.9), s.x + ux * 0.9, -(s.y + uy * 0.9));
      g.fillStyle(0xffffff, 1).fillCircle(s.x, -s.y, 9);
      g.fillStyle(0x14062b, 1).fillCircle(s.x, -s.y, 4);
    }
    void sparkX;
  }

  clear(): void {
    this.g.clear();
    this.glow.clear();
  }
}
