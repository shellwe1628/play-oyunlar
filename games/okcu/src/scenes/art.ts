/**
 * Code-drawn art for the playfield: archers (fat outlines, round heads, noodle limbs), bows,
 * arrows, bombs, ledges and the sky. Everything draws into Graphics objects every frame; no
 * per-frame allocation beyond what Phaser's Graphics does internally.
 */
import type Phaser from 'phaser';
import type { BowSkin, Cosmetic } from '../sim/meta';
import type { AnimOut } from '../anim/anim';
import { PT } from '../sim/ragdoll';
import type { Archer, Arrow } from '../sim/world';
import { PALETTE } from '../textures';

type G = Phaser.GameObjects.Graphics;

export interface Look {
  body: number;
  shade: number;
  hat: Cosmetic['hat'] | 'hood' | 'helmet' | 'band' | 'goggles' | 'horns-boss';
  scarf: number;
  bow: BowSkin;
}

export function lookFor(a: Archer, cosmetic: Cosmetic): Look {
  switch (a.type) {
    case 'player':
      return { body: PALETTE.player, shade: PALETTE.playerShade, hat: cosmetic.hat, scarf: cosmetic.scarf, bow: cosmetic.bow };
    case 'archer':
      return { body: PALETTE.archer, shade: PALETTE.archerShade, hat: 'hood', scarf: PALETTE.archerScarf, bow: 'wood' };
    case 'shield':
      return { body: PALETTE.shield, shade: PALETTE.shieldShade, hat: 'helmet', scarf: PALETTE.shieldScarf, bow: 'wood' };
    case 'jumper':
      return { body: PALETTE.jumper, shade: PALETTE.jumperShade, hat: 'band', scarf: PALETTE.fireCore, bow: 'wood' };
    case 'bomber':
      return { body: PALETTE.bomber, shade: PALETTE.bomberShade, hat: 'goggles', scarf: PALETTE.bomberGoggle, bow: 'wood' };
    case 'boss':
      return { body: PALETTE.boss, shade: PALETTE.bossShade, hat: 'horns-boss', scarf: PALETTE.bossScarf, bow: 'dark' };
  }
}

const OUT = 7; // outline thickness added around every shape

type Pt = { x: number; y: number };
/** fillPoints takes plain {x, y} objects at runtime; its typing wants Vector2. */
function poly(g: G, pts: Pt[]): void {
  g.fillPoints(pts as unknown as Phaser.Math.Vector2[], true);
}

/** Quadratic "noodle" through p0 → p1 (passes through p1) → p2, with an ink outline. */
function noodle(g: G, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, w: number, color: number, outline = true): void {
  const cx = 2 * x1 - (x0 + x2) / 2;
  const cy = 2 * y1 - (y0 + y2) / 2;
  const N = 6;
  for (let pass = outline ? 0 : 1; pass < 2; pass++) {
    const width = pass === 0 ? w + OUT * 2 : w;
    const col = pass === 0 ? PALETTE.ink : color;
    g.lineStyle(width, col, 1);
    g.fillStyle(col, 1);
    let px = x0;
    let py = y0;
    g.fillCircle(px, py, width / 2);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x2;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y2;
      g.lineBetween(px, py, x, y);
      g.fillCircle(x, y, width / 2);
      px = x;
      py = y;
    }
  }
}

function capsule(g: G, x0: number, y0: number, x1: number, y1: number, r: number, color: number): void {
  g.lineStyle((r + OUT) * 2, PALETTE.ink, 1).lineBetween(x0, y0, x1, y1);
  g.fillStyle(PALETTE.ink, 1).fillCircle(x0, y0, r + OUT).fillCircle(x1, y1, r + OUT);
  g.lineStyle(r * 2, color, 1).lineBetween(x0, y0, x1, y1);
  g.fillStyle(color, 1).fillCircle(x0, y0, r).fillCircle(x1, y1, r);
}

export interface Scarf {
  x: Float64Array;
  y: Float64Array;
  px: Float64Array;
  py: Float64Array;
}

export function createScarf(x: number, y: number): Scarf {
  const n = 6;
  const s: Scarf = { x: new Float64Array(n), y: new Float64Array(n), px: new Float64Array(n), py: new Float64Array(n) };
  for (let i = 0; i < n; i++) {
    s.x[i] = s.px[i] = x - i * 10;
    s.y[i] = s.py[i] = y;
  }
  return s;
}

/** Cosmetic rope: pinned at the neck, trails in the wind (scene-side, real time). */
export function stepScarf(s: Scarf, ax: number, ay: number, wind: number, dt: number, time: number, lift = 0): void {
  const n = s.x.length;
  s.x[0] = ax;
  s.y[0] = ay;
  s.px[0] = ax;
  s.py[0] = ay;
  // drawing the bow lifts the scarf: less weight, more wind
  const g = 900 * dt * dt * (1 - 0.85 * lift);
  wind *= 1 + lift * 1.5;
  for (let i = 1; i < n; i++) {
    const vx = (s.x[i]! - s.px[i]!) * 0.9;
    const vy = (s.y[i]! - s.py[i]!) * 0.9;
    s.px[i] = s.x[i]!;
    s.py[i] = s.y[i]!;
    s.x[i] = s.x[i]! + vx + (wind + Math.sin(time * 6 + i * 0.9) * 500) * dt * dt;
    s.y[i] = s.y[i]! + vy + g;
  }
  const seg = 11;
  for (let it = 0; it < 4; it++) {
    for (let i = 1; i < n; i++) {
      const dx = s.x[i]! - s.x[i - 1]!;
      const dy = s.y[i]! - s.y[i - 1]!;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = (d - seg) / d;
      if (i - 1 === 0) {
        s.x[i] = s.x[i]! - dx * k;
        s.y[i] = s.y[i]! - dy * k;
      } else {
        s.x[i - 1] = s.x[i - 1]! + dx * k * 0.5;
        s.y[i - 1] = s.y[i - 1]! + dy * k * 0.5;
        s.x[i] = s.x[i]! - dx * k * 0.5;
        s.y[i] = s.y[i]! - dy * k * 0.5;
      }
    }
  }
}

function drawScarf(g: G, s: Scarf, color: number, scale: number): void {
  const n = s.x.length;
  for (let pass = 0; pass < 2; pass++) {
    const w0 = (pass === 0 ? 16 + OUT * 2 : 16) * scale;
    for (let i = 1; i < n; i++) {
      const w = w0 * (1 - (i / n) * 0.45);
      const col = pass === 0 ? PALETTE.ink : i % 2 === 0 ? color : shadeOf(color);
      g.lineStyle(w, col, 1).lineBetween(s.x[i - 1]!, s.y[i - 1]!, s.x[i]!, s.y[i]!);
      g.fillStyle(col, 1).fillCircle(s.x[i]!, s.y[i]!, w / 2);
    }
  }
}

function shadeOf(c: number): number {
  const r = ((c >> 16) & 0xff) * 0.78;
  const gg = ((c >> 8) & 0xff) * 0.78;
  const b = (c & 0xff) * 0.78;
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
}

/** White-ish flash colour for a body part right after a hit. */
function flash(color: number, k: number): number {
  if (k <= 0) return color;
  const r = (color >> 16) & 0xff;
  const gg = (color >> 8) & 0xff;
  const b = color & 0xff;
  const m = (v: number) => Math.round(v + (255 - v) * k);
  return (m(r) << 16) | (m(gg) << 8) | m(b);
}

export interface DrawOpts {
  time: number;
  scarf: Scarf | null;
  /** 0..1 white flash */
  flash: number;
  /** show the hp pill above the head */
  hpBar: boolean;
  /** red "!" telegraph while an enemy draws */
  telegraph: boolean;
  /** pulsing ring on the boss's weak spot */
  weakHint: boolean;
  /** animated point positions to draw instead of the sim's (the sim's are never changed) */
  view?: { x: Float64Array; y: Float64Array };
  /** expressions and extras from the animation layer */
  face?: AnimOut;
}

export function drawArcher(g: G, a: Archer, look: Look, o: DrawOpts): void {
  const b = o.view ?? a.body;
  const s = a.scale;
  const X = b.x;
  const Y = b.y;
  const body = flash(look.body, o.flash);
  const shade = flash(look.shade, o.flash);
  const skin = flash(PALETTE.skin, o.flash);
  const limb = 13 * s;
  // back arm (string hand) and back leg
  noodle(g, X[PT.neck]!, Y[PT.neck]! + 4 * s, X[PT.elbowB]!, Y[PT.elbowB]!, X[PT.handB]!, Y[PT.handB]!, limb, shade);
  noodle(g, X[PT.pelvis]!, Y[PT.pelvis]!, X[PT.kneeB]!, Y[PT.kneeB]!, X[PT.footB]!, Y[PT.footB]!, limb * 1.1, shade);
  boot(g, X[PT.footB]!, Y[PT.footB]!, a.facing, s, PALETTE.inkSoft);
  if (o.scarf) drawScarf(g, o.scarf, look.scarf, s);
  // quiver on the back
  const nx = X[PT.neck]!;
  const ny = Y[PT.neck]!;
  const px = X[PT.pelvis]!;
  const py = Y[PT.pelvis]!;
  const ax = (px - nx) / (Math.hypot(px - nx, py - ny) || 1);
  const ay = (py - ny) / (Math.hypot(px - nx, py - ny) || 1);
  if (a.type !== 'boss' && a.type !== 'bomber') {
    const qx = nx - a.facing * 12 * s * ay * -1 - a.facing * 10 * s;
    const qy = ny + 10 * s;
    g.lineStyle(14 * s + OUT * 2, PALETTE.ink, 1).lineBetween(qx, qy - 6 * s, qx - ax * 34 * s, qy + ay * 30 * s);
    g.lineStyle(14 * s, PALETTE.bow, 1).lineBetween(qx, qy - 6 * s, qx - ax * 34 * s, qy + ay * 30 * s);
    g.fillStyle(PALETTE.fletch, 1).fillTriangle(qx - 6 * s, qy - 8 * s, qx + 2 * s, qy - 20 * s, qx + 4 * s, qy - 6 * s);
  }
  // torso: a chunky bean
  capsule(g, nx, ny, px, py, 17 * s, body);
  g.lineStyle(5 * s, shade, 1).lineBetween(px - 13 * s * ay, py - 4 * s, px + 13 * s * ay, py - 4 * s);
  if (a.type === 'boss') {
    // golden breastplate
    const cx = (nx + px) / 2;
    const cy = (ny + py) / 2;
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(cx - 21 * s, cy - 19 * s, 42 * s, 38 * s, 12 * s);
    g.fillStyle(flash(PALETTE.bossPlate, o.flash), 1).fillRoundedRect(cx - 16 * s, cy - 14 * s, 32 * s, 28 * s, 9 * s);
    g.fillStyle(PALETTE.bossPlateShade, 1).fillRect(cx - 2 * s, cy - 12 * s, 4 * s, 24 * s);
  }
  if (a.type === 'bomber') {
    // bandolier of bombs
    for (let i = 0; i < 3; i++) {
      const t = 0.25 + i * 0.25;
      const bx = nx + (px - nx) * t + a.facing * (6 - i * 6) * s;
      const by = ny + (py - ny) * t;
      g.fillStyle(PALETTE.ink, 1).fillCircle(bx, by, 7 * s);
      g.fillStyle(PALETTE.bomb, 1).fillCircle(bx, by, 4.5 * s);
    }
  }
  if (o.scarf) {
    g.fillStyle(PALETTE.ink, 1).fillEllipse(nx, ny + 2 * s, 40 * s, 20 * s);
    g.fillStyle(look.scarf, 1).fillEllipse(nx, ny + 2 * s, 32 * s, 13 * s);
  }
  // front leg
  noodle(g, X[PT.pelvis]!, Y[PT.pelvis]!, X[PT.kneeF]!, Y[PT.kneeF]!, X[PT.footF]!, Y[PT.footF]!, limb * 1.1, body);
  boot(g, X[PT.footF]!, Y[PT.footF]!, a.facing, s, PALETTE.ink);
  // head
  drawHead(g, a, look, skin, o);
  // bow + string + nocked arrow
  drawBow(g, a, o, look.bow);
  // front (bow) arm on top
  noodle(g, nx, ny + 4 * s, X[PT.elbowF]!, Y[PT.elbowF]!, X[PT.handF]!, Y[PT.handF]!, limb, body);
  g.fillStyle(PALETTE.ink, 1).fillCircle(X[PT.handF]!, Y[PT.handF]!, 8 * s + 2);
  g.fillStyle(skin, 1).fillCircle(X[PT.handF]!, Y[PT.handF]!, 7 * s);
  g.fillStyle(PALETTE.ink, 1).fillCircle(X[PT.handB]!, Y[PT.handB]!, 8 * s + 2);
  g.fillStyle(skin, 1).fillCircle(X[PT.handB]!, Y[PT.handB]!, 7 * s);
  // hp pill and telegraph
  const hx = X[PT.head]!;
  const hy = Y[PT.head]!;
  if (o.face && a.alive) drawExtras(g, a, o.face, X, Y, o.time);
  if (o.hpBar && a.alive) {
    const w = 64 * s;
    const k = Math.max(0, Math.min(1, a.hp / a.maxHp));
    const top = hy - 56 * s;
    g.fillStyle(PALETTE.ink, 1).fillRoundedRect(hx - w / 2 - 4, top - 4, w + 8, 18, 9);
    g.fillStyle(PALETTE.hpBack, 1).fillRoundedRect(hx - w / 2, top, w, 10, 5);
    if (k > 0) g.fillStyle(k > 0.35 ? PALETTE.heal : PALETTE.danger, 1).fillRoundedRect(hx - w / 2, top, Math.max(10, w * k), 10, 5);
  }
  if (o.telegraph) {
    const pulse = 1 + Math.sin(o.time * 20) * 0.12;
    const ty = hy - (o.hpBar ? 80 : 62) * s;
    g.fillStyle(PALETTE.ink, 1).fillCircle(hx, ty, 17 * pulse);
    g.fillStyle(PALETTE.danger, 1).fillCircle(hx, ty, 13 * pulse);
    g.fillStyle(PALETTE.white, 1).fillRoundedRect(hx - 2.5, ty - 8, 5, 10, 2).fillCircle(hx, ty + 6, 2.6);
  }
  if (o.weakHint && a.alive) {
    const r = (30 + ((o.time * 60) % 26)) * s;
    g.lineStyle(4, PALETTE.bossEye, 1 - ((o.time * 60) % 26) / 26).strokeCircle(hx, hy, r);
  }
}

/** Dizzy stars, sweat, laugh marks and the bomber's juggled bomb. */
function drawExtras(g: G, a: Archer, f: AnimOut, X: ArrayLike<number>, Y: ArrayLike<number>, t: number): void {
  const s = a.scale;
  const hx = X[PT.head]!;
  const hy = Y[PT.head]!;
  if (f.dizzy > 0.05) {
    for (let i = 0; i < 3; i++) {
      const ang = t * 5 + (i * Math.PI * 2) / 3;
      const x = hx + Math.cos(ang) * 32 * s;
      const y = hy - 36 * s + Math.sin(ang) * 7 * s;
      const k = 8.5 * s * f.dizzy;
      g.fillStyle(PALETTE.ink, 1).fillTriangle(x - k - 2, y, x + k + 2, y, x, y - k - 3).fillTriangle(x - k - 2, y, x + k + 2, y, x, y + k + 3);
      g.fillStyle(PALETTE.coin, 1).fillTriangle(x - k, y, x + k, y, x, y - k).fillTriangle(x - k, y, x + k, y, x, y + k);
    }
  }
  if (f.sweat) {
    const x = hx - a.facing * 24 * s;
    const y = hy - 8 * s + ((t * 30) % 14);
    g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, 6 * s).fillTriangle(x - 6 * s, y, x + 6 * s, y, x, y - 12 * s);
    g.fillStyle(PALETTE.bubble, 1).fillCircle(x, y, 4 * s).fillTriangle(x - 4 * s, y, x + 4 * s, y, x, y - 9 * s);
  }
  if (f.laugh) {
    g.lineStyle(4, PALETTE.ink, 1);
    for (let i = 0; i < 3; i++) {
      const ang = -1.2 + i * 0.5;
      const r0 = 34 * s + Math.sin(t * 20 + i) * 3;
      const x0 = hx + a.facing * Math.cos(ang) * r0;
      const y0 = hy + Math.sin(ang) * r0;
      g.lineBetween(x0, y0, x0 + a.facing * Math.cos(ang) * 10 * s, y0 + Math.sin(ang) * 10 * s);
    }
  }
  if (f.juggle >= 0) {
    const x = X[PT.handB]! - a.facing * 4 * s;
    const y = Y[PT.handB]! - 14 * s - f.juggle;
    g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, 11 * s);
    g.fillStyle(PALETTE.bomb, 1).fillCircle(x, y, 7.5 * s);
    g.fillStyle(PALETTE.white, 0.5).fillCircle(x - 2.5 * s, y - 3 * s, 2.2 * s);
    const fl = 3 * s + Math.sin(t * 40) * 1.5;
    g.fillStyle(PALETTE.fire, 1).fillCircle(x + 6 * s, y - 9 * s, fl);
  }
}

function boot(g: G, x: number, y: number, f: number, s: number, color: number): void {
  g.fillStyle(PALETTE.ink, 1).fillEllipse(x + f * 4 * s, y + 1, 26 * s, 14 * s);
  g.fillStyle(color, 1).fillEllipse(x + f * 4 * s, y, 18 * s, 8 * s);
}

function drawHead(g: G, a: Archer, look: Look, skin: number, o: DrawOpts): void {
  const b = o.view ?? a.body;
  const s = a.scale;
  const hx = b.x[PT.head]!;
  const hy = b.y[PT.head]!;
  const r = 26 * s;
  // head tilt from the neck direction
  const tx = hx - b.x[PT.neck]!;
  const ty = hy - b.y[PT.neck]!;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl; // "up" of the face
  const uy = ty / tl;
  const rx = -uy * a.facing; // "forward" of the face
  const ry = ux * a.facing;
  g.fillStyle(PALETTE.ink, 1).fillCircle(hx, hy, r + OUT);
  g.fillStyle(a.type === 'boss' ? flash(PALETTE.bossShade, o.flash) : skin, 1).fillCircle(hx, hy, r);
  if (a.type === 'player') {
    const ang = Math.atan2(uy, ux);
    g.fillStyle(PALETTE.hair, 1).slice(hx, hy, r + 1, ang - 1.35, ang + 1.25, false).fillPath();
    const tx2 = hx + ux * (r + 2) - rx * 4;
    const ty2 = hy + uy * (r + 2) - ry * 4;
    g.fillStyle(PALETTE.ink, 1).fillCircle(tx2 + rx * 8 + ux * 4, ty2 + ry * 8 + uy * 4, 10 * s);
    g.fillStyle(PALETTE.hair, 1).fillCircle(tx2 + rx * 8 + ux * 4, ty2 + ry * 8 + uy * 4, 7 * s);
  }
  // hats behind/around the head
  switch (look.hat) {
    case 'hood':
      g.fillStyle(look.body, 1).slice(hx, hy, r + 2, Math.atan2(uy, ux) - 1.9, Math.atan2(uy, ux) + 1.9, false).fillPath();
      g.fillStyle(look.shade, 1).fillTriangle(hx - rx * r * 0.9, hy - ry * r * 0.9, hx - rx * r * 1.6 + ux * 10, hy - ry * r * 1.6 + uy * 10, hx + ux * r, hy + uy * r);
      break;
    case 'helmet':
      g.fillStyle(PALETTE.shieldRim, 1).slice(hx, hy, r + 3, Math.atan2(uy, ux) - 1.55, Math.atan2(uy, ux) + 1.55, false).fillPath();
      g.fillStyle(PALETTE.ink, 1).fillCircle(hx + ux * (r + 4), hy + uy * (r + 4), 5);
      break;
    case 'band': {
      const bx = hx + ux * r * 0.45;
      const by = hy + uy * r * 0.45;
      g.lineStyle(9, PALETTE.ink, 1).lineBetween(bx - rx * r, by - ry * r, bx + rx * r, by + ry * r);
      g.lineStyle(5, look.scarf, 1).lineBetween(bx - rx * r, by - ry * r, bx + rx * r, by + ry * r);
      const wob = Math.sin(o.time * 12 + a.id) * 6;
      g.lineStyle(5, look.scarf, 1).lineBetween(bx - rx * r, by - ry * r, bx - rx * (r + 22) + wob, by - ry * (r + 16) + 8);
      break;
    }
    case 'goggles': {
      g.fillStyle(PALETTE.bomberShade, 1).slice(hx, hy, r + 2, Math.atan2(uy, ux) - 1.4, Math.atan2(uy, ux) + 1.4, false).fillPath();
      const gx = hx + ux * r * 0.5 + rx * r * 0.35;
      const gy = hy + uy * r * 0.5 + ry * r * 0.35;
      g.fillStyle(PALETTE.ink, 1).fillCircle(gx, gy, 9).fillCircle(gx + rx * 15, gy + ry * 15, 8);
      g.fillStyle(PALETTE.bomberGoggle, 1).fillCircle(gx, gy, 6).fillCircle(gx + rx * 15, gy + ry * 15, 5);
      break;
    }
    case 'horns-boss': {
      g.fillStyle(PALETTE.bossPlate, 1).slice(hx, hy, r + 3, Math.atan2(uy, ux) - 1.5, Math.atan2(uy, ux) + 1.5, false).fillPath();
      for (const side of [-1, 1]) {
        const bx = hx + ux * r * 0.6 + rx * side * r * 0.75;
        const by = hy + uy * r * 0.6 + ry * side * r * 0.75;
        g.fillStyle(PALETTE.ink, 1).fillTriangle(bx - rx * 9, by - ry * 9, bx + rx * 9, by + ry * 9, bx + ux * 34 + rx * side * 18, by + uy * 34 + ry * side * 18);
        g.fillStyle(PALETTE.cream, 1).fillTriangle(bx - rx * 5, by - ry * 5, bx + rx * 5, by + ry * 5, bx + ux * 27 + rx * side * 15, by + uy * 27 + ry * side * 15);
      }
      break;
    }
    default:
      break;
  }
  if (a.helmet) {
    // veteran's steel cap
    g.fillStyle(PALETTE.ink, 1).slice(hx, hy, r + 7, Math.atan2(uy, ux) - 1.6, Math.atan2(uy, ux) + 1.6, false).fillPath();
    g.fillStyle(flash(PALETTE.shieldRim, o.flash), 1).slice(hx, hy, r + 3, Math.atan2(uy, ux) - 1.5, Math.atan2(uy, ux) + 1.5, false).fillPath();
    g.fillStyle(PALETTE.white, 0.6).fillCircle(hx + ux * r * 0.6 - rx * r * 0.3, hy + uy * r * 0.6 - ry * r * 0.3, 4 * s);
  }
  // face
  const ex = hx + rx * r * 0.32 - ux * r * 0.02;
  const ey = hy + ry * r * 0.32 - uy * r * 0.02;
  const gap = r * 0.5;
  const e1x = ex - rx * gap * 0.5;
  const e1y = ey - ry * gap * 0.5;
  const e2x = ex + rx * gap * 0.5;
  const e2y = ey + ry * gap * 0.5;
  if (!a.alive) {
    const k = 5 * s;
    g.lineStyle(4, PALETTE.ink, 1);
    for (const [x, y] of [
      [e1x, e1y],
      [e2x, e2y],
    ] as const) {
      g.lineBetween(x - k, y - k, x + k, y + k).lineBetween(x - k, y + k, x + k, y - k);
    }
    // tongue out
    const mx = ex - ux * r * 0.45;
    const my = ey - uy * r * 0.45;
    g.fillStyle(PALETTE.ink, 1).fillCircle(mx, my, 6 * s);
    g.fillStyle(PALETTE.blush, 1).fillCircle(mx - ux * 3 * s, my - uy * 3 * s, 4 * s);
    return;
  }
  const f = o.face;
  if (a.type === 'boss') {
    const wide = f?.eyes === 'wide' || f?.eyes === 'dizzy';
    const glow = 0.75 + Math.sin(o.time * 8) * 0.25;
    const er = (wide ? 8 : 6) * s;
    g.fillStyle(PALETTE.bossEye, glow).fillCircle(e1x, e1y, er).fillCircle(e2x, e2y, er);
    g.fillStyle(PALETTE.white, 1).fillCircle(e1x, e1y, 2.5 * s).fillCircle(e2x, e2y, 2.5 * s);
    g.lineStyle(5, PALETTE.ink, 1).lineBetween(e1x - rx * 8 + ux * 9, e1y - ry * 8 + uy * 9, e2x + rx * 8 + ux * 4, e2y + ry * 8 + uy * 4);
    if (f?.mouth === 'roar' || f?.mouth === 'laugh' || f?.mouth === 'grin') {
      const mx = ex - ux * r * 0.5;
      const my = ey - uy * r * 0.5;
      const big = f.mouth === 'roar' ? 1.4 : 1;
      g.fillStyle(PALETTE.ink, 1).fillEllipse(mx, my, 18 * s * big, 12 * s * big);
      g.fillStyle(PALETTE.white, 1).fillTriangle(mx - 6 * s, my - 5 * s * big, mx - 2 * s, my - 5 * s * big, mx - 4 * s, my - s);
      g.fillTriangle(mx + 2 * s, my - 5 * s * big, mx + 6 * s, my - 5 * s * big, mx + 4 * s, my - s);
    }
    return;
  }
  // expression: from the animation layer, else from the sim's state
  let eyes: string = f ? f.eyes : a.hurt < 0.35 ? 'closed' : a.draw > 0.1 ? 'squint' : 'open';
  const mouth: string = f ? f.mouth : a.hurt < 0.35 ? 'o' : a.draw > 0.1 ? 'flat' : 'smile';
  if (!f && a.hurt < 0.35) eyes = 'pain';
  if (eyes === 'closed' && f && a.hurt < 0.35) eyes = 'pain';
  const lookX = f ? f.lookX : Math.cos(a.aim);
  const lookY = f ? f.lookY : Math.sin(a.aim);
  const ll = Math.hypot(lookX, lookY);
  const lx = ll > 0.01 ? (lookX / Math.max(1, ll)) * 2.6 * s : 0;
  const ly = ll > 0.01 ? (lookY / Math.max(1, ll)) * 2.6 * s : 0;
  g.lineStyle(4, PALETTE.ink, 1);
  for (const [x, y, side] of [
    [e1x, e1y, -1],
    [e2x, e2y, 1],
  ] as const) {
    switch (eyes) {
      case 'blink':
      case 'closed':
        g.beginPath().arc(x, y, 5 * s, Math.atan2(-uy, -ux) - 1.2, Math.atan2(-uy, -ux) + 1.2, false).strokePath();
        break;
      case 'happy':
        g.beginPath().arc(x - ux * 3 * s, y - uy * 3 * s, 5 * s, Math.atan2(uy, ux) - 1.3, Math.atan2(uy, ux) + 1.3, false).strokePath();
        break;
      case 'pain':
        g.lineBetween(x - rx * 4 * side - ux * 4, y - ry * 4 * side - uy * 4, x + rx * 4 * side, y + ry * 4 * side);
        g.lineBetween(x + rx * 4 * side, y + ry * 4 * side, x - rx * 4 * side + ux * 4, y - ry * 4 * side + uy * 4);
        break;
      case 'dizzy': {
        const rot = o.time * 9 * side;
        g.lineStyle(3, PALETTE.ink, 1).beginPath().arc(x, y, 5.5 * s, rot, rot + 4.6, false).strokePath();
        g.beginPath().arc(x, y, 2.5 * s, rot + 2, rot + 6, false).strokePath();
        g.lineStyle(4, PALETTE.ink, 1);
        break;
      }
      default: {
        const wide = eyes === 'wide';
        const sq = eyes === 'squint';
        const ew = (wide ? 16 : 14) * s;
        const eh = (wide ? 21 : sq ? 9 : 17) * s;
        g.fillStyle(PALETTE.ink, 1).fillEllipse(x, y, ew, eh);
        g.fillStyle(PALETTE.white, 1).fillEllipse(x, y, ew - 4.5 * s, eh - 4.5 * s);
        const pr = (wide ? 2.6 : sq ? 2.8 : 3.6) * s;
        g.fillStyle(PALETTE.ink, 1).fillCircle(x + lx, y + ly * (sq ? 0.3 : 1), pr);
        if (!sq) g.fillStyle(PALETTE.white, 1).fillCircle(x + lx - 1.2 * s, y + ly - 1.4 * s, 1.2 * s);
        if (sq) {
          // determined brows
          g.lineStyle(4, PALETTE.ink, 1).lineBetween(x - rx * 6 * side * -1 + ux * 8, y - ry * 6 * side * -1 + uy * 8, x + rx * 6 * side * -1 + ux * 5, y + ry * 6 * side * -1 + uy * 5);
        }
        g.lineStyle(4, PALETTE.ink, 1);
      }
    }
  }
  // blush + mouth
  g.fillStyle(PALETTE.blush, eyes === 'happy' ? 1 : 0.7).fillCircle(e2x + rx * 6 - ux * 9, e2y + ry * 6 - uy * 9, (eyes === 'happy' ? 5 : 4) * s);
  const mx = ex - ux * r * 0.48 + rx * 2;
  const my = ey - uy * r * 0.48 + ry * 2;
  const down = Math.atan2(-uy, -ux);
  g.lineStyle(3.5, PALETTE.ink, 1);
  switch (mouth) {
    case 'flat':
      g.lineBetween(mx - rx * 5, my - ry * 5, mx + rx * 5, my + ry * 5);
      break;
    case 'o':
      g.fillStyle(PALETTE.ink, 1).fillEllipse(mx, my, 9 * s, 11 * s);
      break;
    case 'frown':
      g.beginPath().arc(mx - ux * 5 * s, my - uy * 5 * s, 5 * s, down + Math.PI - 1.0, down + Math.PI + 1.0, false).strokePath();
      break;
    case 'grin':
    case 'laugh':
    case 'roar': {
      const k = mouth === 'grin' ? 1 : 1.35;
      g.fillStyle(PALETTE.ink, 1).slice(mx, my, 7 * s * k, down - 1.5, down + 1.5, false).fillPath();
      g.fillStyle(PALETTE.blush, 1).fillCircle(mx - ux * 3 * s * k, my - uy * 3 * s * k, 3 * s);
      break;
    }
    default:
      g.beginPath().arc(mx, my, 5 * s, down - 1.1, down + 1.1, false).strokePath();
  }
  // player cosmetics on top
  drawHat(g, look.hat, hx, hy, r, ux, uy, rx, ry, look.scarf);
}

/** A head with this cosmetic's hat and scarf, for menu tiles. */
export function drawHeadIcon(g: G, x: number, y: number, r: number, cos: Cosmetic, unlocked: boolean): void {
  const skin = unlocked ? PALETTE.skin : PALETTE.locked;
  g.lineStyle(r * 0.5 + 6, PALETTE.ink, 1).lineBetween(x - r, y + r * 1.15, x + r, y + r * 0.95);
  g.lineStyle(r * 0.5, unlocked ? cos.scarf : PALETTE.locked, 1).lineBetween(x - r, y + r * 1.15, x + r, y + r * 0.95);
  g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, r + 5);
  g.fillStyle(skin, 1).fillCircle(x, y, r);
  g.fillStyle(PALETTE.ink, 1).fillCircle(x - r * 0.3, y + r * 0.05, r * 0.12).fillCircle(x + r * 0.3, y + r * 0.05, r * 0.12);
  if (unlocked) drawHat(g, cos.hat, x, y, r, 0, -1, 1, 0, cos.scarf);
}

function drawHat(g: G, hat: Look['hat'], hx: number, hy: number, r: number, ux: number, uy: number, rx: number, ry: number, accent: number): void {
  const top = (k: number) => ({ x: hx + ux * r * k, y: hy + uy * r * k });
  switch (hat) {
    case 'beanie': {
      const c = top(0.35);
      g.fillStyle(PALETTE.ink, 1).slice(hx, hy, r + 6, Math.atan2(uy, ux) - 1.45, Math.atan2(uy, ux) + 1.45, false).fillPath();
      g.fillStyle(accent, 1).slice(hx, hy, r + 2, Math.atan2(uy, ux) - 1.35, Math.atan2(uy, ux) + 1.35, false).fillPath();
      const p = top(1.25);
      g.fillStyle(PALETTE.ink, 1).fillCircle(p.x, p.y, 9);
      g.fillStyle(PALETTE.cream, 1).fillCircle(p.x, p.y, 6);
      g.lineStyle(6, PALETTE.cream, 1).lineBetween(c.x - rx * r * 0.95, c.y - ry * r * 0.95, c.x + rx * r * 0.95, c.y + ry * r * 0.95);
      break;
    }
    case 'feather': {
      const c = top(0.8);
      g.fillStyle(PALETTE.ink, 1).fillEllipse(c.x, c.y, r * 2.3, r * 0.9);
      g.fillStyle(PALETTE.capGreen, 1).fillEllipse(c.x, c.y, r * 2.0, r * 0.65);
      const f0 = { x: c.x - rx * 6, y: c.y - ry * 6 };
      g.lineStyle(9, PALETTE.ink, 1).lineBetween(f0.x, f0.y, f0.x - rx * 26 + ux * 30, f0.y - ry * 26 + uy * 30);
      g.lineStyle(5, accent, 1).lineBetween(f0.x, f0.y, f0.x - rx * 26 + ux * 30, f0.y - ry * 26 + uy * 30);
      break;
    }
    case 'tophat': {
      const c = top(0.85);
      const t = top(2.0);
      g.lineStyle(r * 1.3 + 8, PALETTE.ink, 1).lineBetween(c.x, c.y, t.x, t.y);
      g.lineStyle(r * 1.3, PALETTE.topHat, 1).lineBetween(c.x, c.y, t.x, t.y);
      g.lineStyle(10, PALETTE.ink, 1).lineBetween(c.x - rx * r * 1.15, c.y - ry * r * 1.15, c.x + rx * r * 1.15, c.y + ry * r * 1.15);
      g.lineStyle(6, accent, 1).lineBetween(c.x - rx * r * 0.62 + ux * 6, c.y - ry * r * 0.62 + uy * 6, c.x + rx * r * 0.62 + ux * 6, c.y + ry * r * 0.62 + uy * 6);
      break;
    }
    case 'horns': {
      g.fillStyle(PALETTE.ink, 1).slice(hx, hy, r + 6, Math.atan2(uy, ux) - 1.5, Math.atan2(uy, ux) + 1.5, false).fillPath();
      g.fillStyle(PALETTE.helm, 1).slice(hx, hy, r + 2, Math.atan2(uy, ux) - 1.4, Math.atan2(uy, ux) + 1.4, false).fillPath();
      for (const side of [-1, 1]) {
        const bx = hx + ux * r * 0.5 + rx * side * r * 0.8;
        const by = hy + uy * r * 0.5 + ry * side * r * 0.8;
        g.fillStyle(PALETTE.ink, 1).fillTriangle(bx - ux * 6, by - uy * 6, bx + ux * 8, by + uy * 8, bx + ux * 22 + rx * side * 22, by + uy * 22 + ry * side * 22);
        g.fillStyle(PALETTE.cream, 1).fillTriangle(bx - ux * 2, by - uy * 2, bx + ux * 5, by + uy * 5, bx + ux * 17 + rx * side * 17, by + uy * 17 + ry * side * 17);
      }
      break;
    }
    case 'flower': {
      // a daisy chain around the crown
      for (let i = 0; i < 5; i++) {
        const k = -1 + i * 0.5;
        const x = hx + ux * r * 0.78 + rx * k * r * 0.95;
        const y = hy + uy * r * 0.78 + ry * k * r * 0.95;
        g.fillStyle(PALETTE.ink, 1).fillCircle(x, y, 8);
        g.fillStyle(i % 2 ? PALETTE.pink : PALETTE.white, 1).fillCircle(x, y, 6);
        g.fillStyle(PALETTE.coin, 1).fillCircle(x, y, 2.5);
      }
      break;
    }
    case 'party': {
      const b0 = { x: hx + ux * r * 0.7, y: hy + uy * r * 0.7 };
      const tip = { x: hx + ux * r * 2.1 + rx * 6, y: hy + uy * r * 2.1 + ry * 6 };
      g.fillStyle(PALETTE.ink, 1).fillTriangle(b0.x - rx * r * 0.75, b0.y - ry * r * 0.75, b0.x + rx * r * 0.75, b0.y + ry * r * 0.75, tip.x + ux * 6, tip.y + uy * 6);
      g.fillStyle(accent, 1).fillTriangle(b0.x - rx * r * 0.6, b0.y - ry * r * 0.6, b0.x + rx * r * 0.6, b0.y + ry * r * 0.6, tip.x, tip.y);
      g.fillStyle(PALETTE.white, 0.85).fillCircle((b0.x + tip.x) / 2, (b0.y + tip.y) / 2, 3.5).fillCircle(b0.x + ux * 10 + rx * 8, b0.y + uy * 10 + ry * 8, 3);
      g.fillStyle(PALETTE.coin, 1).fillCircle(tip.x, tip.y, 6);
      break;
    }
    case 'bandana': {
      g.fillStyle(PALETTE.ink, 1).slice(hx, hy, r + 5, Math.atan2(uy, ux) - 1.45, Math.atan2(uy, ux) + 1.45, false).fillPath();
      g.fillStyle(accent, 1).slice(hx, hy, r + 1, Math.atan2(uy, ux) - 1.35, Math.atan2(uy, ux) + 1.35, false).fillPath();
      g.fillStyle(PALETTE.white, 0.9).fillCircle(hx + ux * r * 0.6 - rx * 8, hy + uy * r * 0.6 - ry * 8, 2.5).fillCircle(hx + ux * r * 0.6 + rx * 6, hy + uy * r * 0.6 + ry * 6, 2.5);
      const kx = hx - rx * r * 1.0 + ux * r * 0.3;
      const ky = hy - ry * r * 1.0 + uy * r * 0.3;
      g.fillStyle(PALETTE.ink, 1).fillTriangle(kx, ky, kx - rx * 20 - ux * 6, ky - ry * 20 - uy * 6, kx - rx * 16 + ux * 12, ky - ry * 16 + uy * 12);
      g.fillStyle(accent, 1).fillTriangle(kx, ky, kx - rx * 16 - ux * 4, ky - ry * 16 - uy * 4, kx - rx * 13 + ux * 9, ky - ry * 13 + uy * 9);
      break;
    }
    case 'wizard': {
      const b0 = { x: hx + ux * r * 0.75, y: hy + uy * r * 0.75 };
      const tip = { x: hx + ux * r * 2.5 - rx * 18, y: hy + uy * r * 2.5 - ry * 18 };
      g.fillStyle(PALETTE.ink, 1).fillEllipse(b0.x, b0.y, r * 2.6, r * 0.8);
      g.fillStyle(accent, 1).fillEllipse(b0.x, b0.y, r * 2.3, r * 0.55);
      g.fillStyle(PALETTE.ink, 1).fillTriangle(b0.x - rx * r * 0.8, b0.y - ry * r * 0.8, b0.x + rx * r * 0.8, b0.y + ry * r * 0.8, tip.x + ux * 5, tip.y + uy * 5);
      g.fillStyle(accent, 1).fillTriangle(b0.x - rx * r * 0.65, b0.y - ry * r * 0.65, b0.x + rx * r * 0.65, b0.y + ry * r * 0.65, tip.x, tip.y);
      g.fillStyle(PALETTE.coin, 1).fillCircle((b0.x * 2 + tip.x) / 3, (b0.y * 2 + tip.y) / 3, 3.5).fillCircle((b0.x + tip.x * 2) / 3, (b0.y + tip.y * 2) / 3, 2.5);
      break;
    }
    case 'beret': {
      const c = top(0.75);
      g.fillStyle(PALETTE.ink, 1).fillEllipse(c.x - rx * 6, c.y - ry * 6, r * 2.3, r * 1.0);
      g.fillStyle(accent, 1).fillEllipse(c.x - rx * 6, c.y - ry * 6, r * 2.0, r * 0.75);
      g.fillStyle(PALETTE.ink, 1).fillCircle(c.x + ux * 12, c.y + uy * 12, 4);
      break;
    }
    case 'laurel': {
      for (let i = 0; i < 7; i++) {
        const k = -1.1 + i * (2.2 / 6);
        const x = hx + ux * r * 0.72 + rx * k * r * 0.95;
        const y = hy + uy * r * 0.72 + ry * k * r * 0.95;
        g.fillStyle(PALETTE.ink, 1).fillEllipse(x, y, 13, 9);
        g.fillStyle(PALETTE.gold, 1).fillEllipse(x, y, 9, 5.5);
      }
      break;
    }
    case 'crown': {
      const c = top(0.85);
      const pts = [-1, -0.5, 0, 0.5, 1];
      g.fillStyle(PALETTE.ink, 1).fillRect(c.x - r - 4, c.y - 10, 2 * r + 8, 16);
      for (const p of pts) {
        const x = c.x + rx * p * r * 0.9;
        const y = c.y + ry * p * r * 0.9;
        g.fillStyle(PALETTE.ink, 1).fillTriangle(x - 9, y + 4, x + 9, y + 4, x + ux * 22, y + uy * 22);
        g.fillStyle(PALETTE.gold, 1).fillTriangle(x - 5, y + 2, x + 5, y + 2, x + ux * 17, y + uy * 17);
      }
      g.fillStyle(PALETTE.gold, 1).fillRect(c.x - r, c.y - 6, 2 * r, 9);
      g.fillStyle(PALETTE.danger, 1).fillCircle(c.x, c.y - 2, 4);
      break;
    }
    default:
      break;
  }
}

const BOW_SKIN: Record<BowSkin, [number, number]> = {
  wood: [PALETTE.bow, PALETTE.string],
  leaf: [PALETTE.leaf, PALETTE.string],
  candy: [PALETTE.pink, PALETTE.white],
  dark: [PALETTE.inkSoft, PALETTE.locked],
  ice: [PALETTE.bubble, PALETTE.white],
  gold: [PALETTE.gold, PALETTE.cream],
};

function drawBow(g: G, a: Archer, o: DrawOpts, skin: BowSkin): void {
  const b = o.view ?? a.body;
  const draw = o.face && o.face.drawOverride >= 0 ? o.face.drawOverride : a.draw;
  const [bowColor, stringColor] = BOW_SKIN[skin];
  const s = a.scale;
  const hx = b.x[PT.handF]!;
  const hy = b.y[PT.handF]!;
  // bow orientation follows the forearm (so it flops when knocked out)
  let dx = hx - b.x[PT.elbowF]!;
  let dy = hy - b.y[PT.elbowF]!;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const px = -dy;
  const py = dx;
  const bend = (10 + 10 * draw) * s;
  const L = 40 * s;
  const t1x = hx + px * L - dx * bend;
  const t1y = hy + py * L - dy * bend;
  const t2x = hx - px * L - dx * bend;
  const t2y = hy - py * L - dy * bend;
  noodle(g, t1x, t1y, hx + dx * 5 * s, hy + dy * 5 * s, t2x, t2y, 7 * s, bowColor);
  if (skin === 'candy') g.lineStyle(3, PALETTE.white, 0.9).lineBetween(t1x, t1y, (t1x + hx) / 2, (t1y + hy) / 2);
  if (skin === 'gold') g.fillStyle(PALETTE.white, 0.8).fillCircle(hx + dx * 5 * s, hy + dy * 5 * s, 3 * s);
  // string: to the drawing hand while alive and drawing, else straight
  const sx = a.alive && draw > 0.02 ? b.x[PT.handB]! : (t1x + t2x) / 2;
  const sy = a.alive && draw > 0.02 ? b.y[PT.handB]! : (t1y + t2y) / 2;
  g.lineStyle(3, stringColor, 1).lineBetween(t1x, t1y, sx, sy).lineBetween(t2x, t2y, sx, sy);
  if (a.alive && draw > 0.02) {
    // nocked arrow
    const tipx = hx + dx * 16 * s;
    const tipy = hy + dy * 16 * s;
    g.lineStyle(7, PALETTE.ink, 1).lineBetween(sx, sy, tipx, tipy);
    g.lineStyle(3.5, PALETTE.shaftLight, 1).lineBetween(sx, sy, tipx, tipy);
    g.fillStyle(PALETTE.arrowHead, 1).fillTriangle(tipx + dx * 10, tipy + dy * 10, tipx + px * 6, tipy + py * 6, tipx - px * 6, tipy - py * 6);
  }
}

export function drawArrow(g: G, a: Arrow, time: number, multi = false, halo = false): void {
  const alpha = a.state === 1 ? Math.min(1, a.life / 1.2) : 1;
  if (a.kind === 'bomb') {
    const r = 15;
    g.fillStyle(PALETTE.ink, 1).fillCircle(a.x, a.y, r + 5);
    g.fillStyle(PALETTE.bomb, 1).fillCircle(a.x, a.y, r);
    g.fillStyle(PALETTE.white, 0.45).fillCircle(a.x - 5, a.y - 6, 5);
    const fx = a.x + 9;
    const fy = a.y - 15;
    g.lineStyle(4, PALETTE.ink, 1).lineBetween(a.x + 4, a.y - 12, fx, fy);
    const fl = 5 + Math.sin(time * 40) * 3;
    g.fillStyle(PALETTE.fire, 1).fillCircle(fx, fy, fl);
    g.fillStyle(PALETTE.fireCore, 1).fillCircle(fx, fy, fl * 0.5);
    return;
  }
  const dx = Math.cos(a.angle);
  const dy = Math.sin(a.angle);
  const heavy = a.owner === 'player' && a.impulseMul > 1.01;
  const len = heavy ? 56 : 50;
  const tx = a.x - dx * len;
  const ty = a.y - dy * len;
  const px = -dy;
  const py = dx;
  if (halo && a.state === 0) {
    // dark arenas: a soft light halo keeps every arrow readable
    g.lineStyle(14, PALETTE.white, 0.22).lineBetween(tx, ty, a.x, a.y);
  }
  if (a.fire && a.state === 0) {
    const fl = 9 + Math.sin(time * 50 + a.seq) * 3;
    g.fillStyle(PALETTE.fire, 0.8).fillCircle(a.x - dx * 6, a.y - dy * 6, fl);
    g.fillStyle(PALETTE.fireCore, 0.9).fillCircle(a.x - dx * 4, a.y - dy * 4, fl * 0.5);
  }
  g.lineStyle(heavy ? 11 : 8, PALETTE.ink, alpha).lineBetween(tx, ty, a.x, a.y);
  g.lineStyle(heavy ? 6 : 4, a.owner === 'player' ? (heavy ? PALETTE.weight : PALETTE.shaftLight) : PALETTE.shaft, alpha).lineBetween(tx, ty, a.x, a.y);
  const hx = a.x + dx * 4;
  const hy = a.y + dy * 4;
  if (a.owner === 'player' && a.bounces > 0) {
    // bouncy: a rubber ball tip
    g.fillStyle(PALETTE.ink, alpha).fillCircle(hx + dx * 4, hy + dy * 4, 10);
    g.fillStyle(PALETTE.leaf, alpha).fillCircle(hx + dx * 4, hy + dy * 4, 7);
    g.fillStyle(PALETTE.white, alpha * 0.7).fillCircle(hx + dx * 2 - px * 2, hy + dy * 2 - py * 2, 2.5);
  } else if (a.owner === 'player' && a.pierce > 0) {
    // piercing: a long glowing needle
    if (a.state === 0) g.fillStyle(PALETTE.bubble, 0.35).fillCircle(hx + dx * 10, hy + dy * 10, 12);
    g.fillStyle(PALETTE.ink, alpha).fillTriangle(hx + dx * 26, hy + dy * 26, hx - dx * 6 + px * 8, hy - dy * 6 + py * 8, hx - dx * 6 - px * 8, hy - dy * 6 - py * 8);
    g.fillStyle(PALETTE.bubble, alpha).fillTriangle(hx + dx * 21, hy + dy * 21, hx - dx * 3 + px * 4.5, hy - dy * 3 + py * 4.5, hx - dx * 3 - px * 4.5, hy - dy * 3 - py * 4.5);
  } else {
    const k = heavy ? 1.35 : 1;
    g.fillStyle(PALETTE.ink, alpha).fillTriangle(hx + dx * 15 * k, hy + dy * 15 * k, hx - dx * 6 + px * 10 * k, hy - dy * 6 + py * 10 * k, hx - dx * 6 - px * 10 * k, hy - dy * 6 - py * 10 * k);
    g.fillStyle(heavy ? PALETTE.metalLight : PALETTE.arrowHead, alpha).fillTriangle(hx + dx * 10 * k, hy + dy * 10 * k, hx - dx * 3 + px * 6 * k, hy - dy * 3 + py * 6 * k, hx - dx * 3 - px * 6 * k, hy - dy * 3 - py * 6 * k);
    if (heavy) g.fillStyle(PALETTE.ink, alpha).fillCircle(hx - dx * 8, hy - dy * 8, 5);
  }
  // fletching: blue on multi-shot arrows
  const fc = a.owner === 'player' ? (multi ? PALETTE.sky2 : PALETTE.fletch) : PALETTE.enemyFletch;
  g.fillStyle(PALETTE.ink, alpha).fillTriangle(tx + dx * 16, ty + dy * 16, tx - dx * 2 + px * 11, ty - dy * 2 + py * 11, tx - dx * 2, ty - dy * 2);
  g.fillStyle(PALETTE.ink, alpha).fillTriangle(tx + dx * 16, ty + dy * 16, tx - dx * 2 - px * 11, ty - dy * 2 - py * 11, tx - dx * 2, ty - dy * 2);
  g.fillStyle(fc, alpha).fillTriangle(tx + dx * 13, ty + dy * 13, tx + px * 8, ty + py * 8, tx + dx * 2, ty + dy * 2);
  g.fillStyle(fc, alpha).fillTriangle(tx + dx * 13, ty + dy * 13, tx - px * 8, ty - py * 8, tx + dx * 2, ty + dy * 2);
}

export function drawShield(g: G, x0: number, y0: number, x1: number, y1: number, hits: number, flashK: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  const w = 26;
  const corner = (a: number, b: number) => ({ x: x0 + ux * a + px * b, y: y0 + uy * a + py * b });
  const pts = [corner(-6, -w), corner(len + 6, -w), corner(len + 6, w), corner(-6, w)];
  g.fillStyle(PALETTE.ink, 1);
  poly(g, [corner(-12, -w - 6), corner(len + 12, -w - 6), corner(len + 12, w + 6), corner(-12, w + 6)]);
  g.fillStyle(flash(PALETTE.shieldRim, flashK), 1);
  poly(g, pts);
  const inner = [corner(2, -w + 7), corner(len - 2, -w + 7), corner(len - 2, w - 7), corner(2, w - 7)];
  g.fillStyle(flash(PALETTE.shieldWood, flashK), 1);
  poly(g, inner);
  const m = corner(len / 2, 0);
  g.fillStyle(PALETTE.ink, 1).fillCircle(m.x, m.y, 10);
  g.fillStyle(PALETTE.shieldRim, 1).fillCircle(m.x, m.y, 6);
  // cracks
  g.lineStyle(3, PALETTE.ink, 1);
  if (hits >= 1) g.lineBetween(m.x, m.y, m.x + ux * 30 + px * 10, m.y + uy * 30 + py * 10);
  if (hits >= 2) g.lineBetween(m.x, m.y, m.x - ux * 26 - px * 12, m.y - uy * 26 - py * 12);
}



