/**
 * Code-drawn stage objects: cover walls, barrels, hanging rocks and their ropes, the ropes of
 * swinging ledges, boss shield plates, orbs, bonus-round targets and the wind sign.
 */
import type Phaser from 'phaser';
import type { Theme } from '../anim/themes';
import { PIVOT_Y, type Mover, type Plate, type Prop, type Target } from '../sim/world';
import type { Ledge } from '../sim/body';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;
const INK = PALETTE.ink;

export function drawWall(g: G, L: Ledge, th: Theme): void {
  const { x, y, w, h } = L;
  g.fillStyle(INK, 1).fillRoundedRect(x - 6, y - 6, w + 12, h + 10, 10);
  g.fillStyle(th.body, 1).fillRoundedRect(x, y, w, h, 7);
  g.fillStyle(th.bodyDark, 1).fillRect(x + w * 0.55, y + 6, w * 0.4, h - 10);
  // stacked stones
  g.lineStyle(3, INK, 0.6);
  for (let k = 1; k < 4; k++) g.lineBetween(x + 2, y + (h * k) / 4, x + w - 2, y + (h * k) / 4 + (k % 2 ? 4 : -4));
  g.fillStyle(PALETTE.white, 0.25).fillRoundedRect(x + 4, y + 4, w * 0.35, h * 0.3, 4);
}

export function drawBarrel(g: G, p: Prop, time: number): void {
  const { x, y, w, h } = p;
  g.fillStyle(INK, 1).fillRoundedRect(x - 5, y - 5, w + 10, h + 10, 12);
  g.fillStyle(0xd8402f, 1).fillRoundedRect(x, y, w, h, 9);
  g.fillStyle(0xa52a1f, 1).fillRect(x + w * 0.62, y + 3, w * 0.3, h - 6);
  g.fillStyle(INK, 1).fillRect(x, y + h * 0.22, w, 5).fillRect(x, y + h * 0.72, w, 5);
  // hazard sign
  const cx = x + w / 2;
  const cy = y + h * 0.47;
  g.fillStyle(PALETTE.fireCore, 1).fillTriangle(cx, cy - 9, cx - 9, cy + 7, cx + 9, cy + 7);
  g.fillStyle(INK, 1).fillRect(cx - 1.5, cy - 4, 3, 6).fillCircle(cx, cy + 4, 1.6);
  // a fizzing fuse cap
  const fl = 3 + Math.sin(time * 30 + x) * 1.5;
  g.fillStyle(PALETTE.fire, 0.9).fillCircle(x + w * 0.3, y - 3, fl);
}

export function drawRope(g: G, x0: number, y0: number, x1: number, y1: number): void {
  g.lineStyle(7, INK, 1).lineBetween(x0, y0, x1, y1);
  g.lineStyle(3.5, 0xd9b27a, 1).lineBetween(x0, y0, x1, y1);
}

export function drawRock(g: G, p: Prop, th: Theme): void {
  if (p.hanging) drawRope(g, p.x, PIVOT_Y, p.x, p.y - p.w + 4);
  const r = p.w;
  g.fillStyle(INK, 1).fillCircle(p.x, p.y, r + 6);
  g.fillStyle(th.ambient === 'snow' ? 0xcfe8ff : th.body, 1).fillCircle(p.x, p.y, r);
  g.fillStyle(th.ambient === 'snow' ? 0x8fb8e8 : th.bodyDark, 1).fillCircle(p.x + r * 0.3, p.y + r * 0.3, r * 0.55);
  g.fillStyle(PALETTE.white, 0.4).fillCircle(p.x - r * 0.35, p.y - r * 0.35, r * 0.25);
  if (p.hanging) {
    // the knot: what to shoot
    g.fillStyle(INK, 1).fillCircle(p.x, p.y - r - 2, 6);
    g.fillStyle(0xd9b27a, 1).fillCircle(p.x, p.y - r - 2, 3.5);
  }
}

/** Two ropes from the pivot down to the ends of a swinging ledge. */
export function drawSwingRopes(g: G, m: Mover, L: Ledge): void {
  if (m.cut) return;
  drawRope(g, m.pivotX, PIVOT_Y, L.x + 10, L.y);
  drawRope(g, m.pivotX, PIVOT_Y, L.x + L.w - 10, L.y);
  g.fillStyle(INK, 1).fillCircle(L.x + 10, L.y, 6).fillCircle(L.x + L.w - 10, L.y, 6);
}

export function drawPlate(g: G, p: Plate, time: number, i: number): void {
  const r = p.r;
  g.fillStyle(INK, 1).fillCircle(p.x, p.y, r + 6);
  g.fillStyle(PALETTE.bossPlate, 1).fillCircle(p.x, p.y, r);
  g.fillStyle(PALETTE.bossPlateShade, 1).fillCircle(p.x + r * 0.2, p.y + r * 0.2, r * 0.6);
  // a thorny bramble emblem that spins
  const a = time * 3 + i;
  g.lineStyle(4, INK, 1);
  for (let k = 0; k < 3; k++) {
    const ang = a + (k * Math.PI * 2) / 3;
    g.lineBetween(p.x, p.y, p.x + Math.cos(ang) * r * 0.7, p.y + Math.sin(ang) * r * 0.7);
  }
  g.fillStyle(PALETTE.white, 0.45).fillCircle(p.x - r * 0.4, p.y - r * 0.45, r * 0.2);
}

export function drawOrb(g: G, x: number, y: number, r: number, time: number, color: number = 0xb08bff): void {
  const k = 1 + Math.sin(time * 18 + x * 0.05) * 0.12;
  g.fillStyle(color, 0.3).fillCircle(x, y, r * 1.7 * k);
  g.fillStyle(INK, 1).fillCircle(x, y, r + 4);
  g.fillStyle(color, 1).fillCircle(x, y, r);
  g.fillStyle(PALETTE.white, 0.9).fillCircle(x - r * 0.3, y - r * 0.3, r * 0.35);
}

export function drawTarget(g: G, t: Target, time: number, th: Theme): void {
  switch (t.kind) {
    case 'target': {
      // a straw target on a little balloon
      g.lineStyle(3, INK, 1).lineBetween(t.x, t.y - t.r, t.x, t.y - t.r - 30);
      g.fillStyle(INK, 1).fillEllipse(t.x, t.y - t.r - 44, 30, 36);
      g.fillStyle(PALETTE.pink, 1).fillEllipse(t.x, t.y - t.r - 44, 23, 29);
      const rings = [PALETTE.white, PALETTE.danger, PALETTE.white, PALETTE.danger, PALETTE.gold];
      g.fillStyle(INK, 1).fillCircle(t.x, t.y, t.r + 5);
      rings.forEach((c, i) => g.fillStyle(c, 1).fillCircle(t.x, t.y, t.r * (1 - i * 0.2)));
      break;
    }
    case 'apple': {
      const wob = Math.sin(t.t * 9) * 0.08;
      g.fillStyle(INK, 1).fillEllipse(t.x, t.y, (t.r + 5) * 2 * (1 + wob), (t.r + 5) * 2 * (1 - wob));
      g.fillStyle(PALETTE.apple, 1).fillEllipse(t.x, t.y, t.r * 2 * (1 + wob), t.r * 2 * (1 - wob));
      g.fillStyle(PALETTE.white, 0.5).fillCircle(t.x - t.r * 0.35, t.y - t.r * 0.35, t.r * 0.25);
      g.lineStyle(5, INK, 1).lineBetween(t.x, t.y - t.r, t.x + 4, t.y - t.r - 12);
      g.fillStyle(PALETTE.leaf, 1).fillEllipse(t.x + 10, t.y - t.r - 8, 14, 8);
      break;
    }
    default: {
      // a thrown boulder with a dust tail
      const ang = Math.atan2(t.vy, t.vx);
      for (let i = 1; i <= 3; i++) g.fillStyle(PALETTE.dust, 0.4 / i).fillCircle(t.x - Math.cos(ang) * 18 * i, t.y - Math.sin(ang) * 18 * i, t.r * (1 - i * 0.15));
      g.fillStyle(INK, 1).fillCircle(t.x, t.y, t.r + 5);
      g.fillStyle(th.body, 1).fillCircle(t.x, t.y, t.r);
      g.fillStyle(th.bodyDark, 1).fillCircle(t.x + 6, t.y + 6, t.r * 0.5);
      g.fillStyle(PALETTE.white, 0.35 + Math.sin(time * 20) * 0.1).fillCircle(t.x - 7, t.y - 7, 5);
    }
  }
}

/** A wind sock and streaks: direction and strength at a glance. */
export function drawWind(g: G, x: number, y: number, wind: number, time: number): void {
  if (wind === 0) return;
  const dir = Math.sign(wind);
  const k = Math.min(1, Math.abs(wind) / 260);
  g.lineStyle(8, INK, 1).lineBetween(x, y - 34, x, y + 34);
  g.lineStyle(4, PALETTE.cream, 1).lineBetween(x, y - 34, x, y + 34);
  const segs = 4;
  for (let i = 0; i < segs; i++) {
    const w0 = 18 - i * 3;
    const sx = x + dir * (6 + i * 20 * (0.5 + k * 0.5));
    const sag = (1 - k) * i * 6 + Math.sin(time * 8 + i) * 3 * k;
    g.fillStyle(INK, 1).fillRect(Math.min(sx, sx + dir * 22) - 2, y - 30 + sag - w0 / 2 - 2, 24, w0 + 4);
    g.fillStyle(i % 2 ? PALETTE.white : PALETTE.danger, 1).fillRect(Math.min(sx, sx + dir * 20), y - 30 + sag - w0 / 2, 20, w0);
  }
  // streaks in the wind's direction
  for (let i = 0; i < 3; i++) {
    const ph = (time * (0.8 + k) + i / 3) % 1;
    const sx = x - dir * 40 + dir * ph * 120;
    const sy = y + 6 + i * 12;
    g.lineStyle(3, PALETTE.white, 0.7 * (1 - ph)).lineBetween(sx, sy, sx + dir * 26 * (0.5 + k), sy);
  }
}
