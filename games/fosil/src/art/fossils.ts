/**
 * Code-drawn fossil art: 8 archetypes × 3 shape variants, coloured per fossil, with a pattern.
 * Drawn at FOSSIL_SIZE and baked into one texture per fossil (`fossil-<id>`) at boot.
 */
import Phaser from 'phaser';
import { at, type FossilArt } from '../sim/data';

export const FOSSIL_SIZE = 160;
const C = FOSSIL_SIZE / 2;

type G = Phaser.GameObjects.Graphics;
type Pt = [number, number];

export function shade(color: number, f: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const t = f < 0 ? 0 : 255;
  const k = Math.abs(f);
  const m = (c: number): number => Math.round(c + (t - c) * k);
  return (m(r) << 16) | (m(g) << 8) | m(b);
}

/** Colour indirection so the same drawing code paints the drop shadow and the fossil. */
class Pen {
  constructor(
    readonly g: G,
    private readonly shadow: boolean,
  ) {}
  fill(color: number, alpha = 1): G {
    return this.shadow ? this.g.fillStyle(0x000000, 0.28 * alpha) : this.g.fillStyle(color, alpha);
  }
  line(width: number, color: number, alpha = 1): G {
    return this.shadow ? this.g.lineStyle(width, 0x000000, 0.28 * alpha) : this.g.lineStyle(width, color, alpha);
  }
  get isShadow(): boolean {
    return this.shadow;
  }
}

const vec = (pts: Pt[]): Phaser.Math.Vector2[] => pts.map(([x, y]) => new Phaser.Math.Vector2(x, y));
function poly(g: G, pts: Pt[]): void {
  g.fillPoints(vec(pts), true);
}
function outline(g: G, pts: Pt[]): void {
  g.strokePoints(vec(pts), true);
}
function polyline(g: G, pts: Pt[]): void {
  g.strokePoints(vec(pts), false);
}
function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 32, wobble?: (t: number) => number): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const k = wobble ? wobble(t) : 1;
    const x = Math.cos(t) * rx * k;
    const y = Math.sin(t) * ry * k;
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 16): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
const deg = (d: number): number => (d * Math.PI) / 180;

interface Drawn {
  /** Interior points for dot / speckle patterns. */
  spots: Pt[];
}

function shell(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  const cy = v === 1 ? C + 14 : C;
  const R = v === 1 ? 50 : 62;
  if (v === 1) {
    // gastropod spire
    p.fill(shade(a.body, -0.12));
    poly(g, [[C - 34, cy - 18], [C + 30, cy - 22], [C + 6, cy - 78]]);
    p.line(4, shade(a.body, -0.35));
    g.lineBetween(C - 22, cy - 40, C + 22, cy - 42).lineBetween(C - 12, cy - 60, C + 14, cy - 60);
  }
  p.fill(a.body).fillCircle(C, cy, R);
  if (a.pattern === 'rim') p.line(6, a.accent).strokeCircle(C, cy, R - 2);
  if (v === 2 || a.pattern === 'bands') {
    p.line(v === 2 ? 4 : 3, v === 2 ? shade(a.body, -0.3) : a.accent);
    for (let i = 0; i < 20; i++) {
      const t = deg(i * 18);
      g.lineBetween(C + Math.cos(t) * R * 0.5, cy + Math.sin(t) * R * 0.5, C + Math.cos(t) * R * 0.95, cy + Math.sin(t) * R * 0.95);
    }
  }
  // spiral
  const turns = at([2.4, 3.2, 3.6], v);
  const T = turns * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i <= 90; i++) {
    const th = (i / 90) * T;
    const r = R * 0.92 * (1 - th / (T + 1.2));
    pts.push([C + Math.cos(th + 1) * r, cy + Math.sin(th + 1) * r]);
  }
  p.line(v === 2 ? 6 : 5, a.pattern === 'bands' ? shade(a.body, -0.4) : a.accent);
  polyline(g, pts);
  p.fill(shade(a.body, -0.4)).fillCircle(C + Math.cos(1) * 4, cy + Math.sin(1) * 4, 5);
  const spots: Pt[] = [];
  for (let i = 0; i < 9; i++) spots.push([C + Math.cos(deg(i * 40 + 10)) * R * 0.72, cy + Math.sin(deg(i * 40 + 10)) * R * 0.72]);
  for (let i = 0; i < 5; i++) spots.push([C + Math.cos(deg(i * 72 + 40)) * R * 0.38, cy + Math.sin(deg(i * 72 + 40)) * R * 0.38]);
  return { spots };
}

function trilobite(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  const segs = at([7, 9, 11], v);
  const w = v === 1 ? 84 : 96;
  if (v === 2) {
    // long genal spines
    p.fill(shade(a.body, -0.2));
    poly(g, [[C - 40, C - 40], [C - 28, C - 30], [C - 58, C + 56]]);
    poly(g, [[C + 40, C - 40], [C + 28, C - 30], [C + 58, C + 56]]);
  }
  p.fill(a.body).fillEllipse(C, C + 8, w, 124);
  p.fill(shade(a.body, -0.12)).fillEllipse(C, C - 38, w + 18, 52);
  p.fill(shade(a.body, -0.25)).fillEllipse(C, C + 6, 28, 112);
  const spots: Pt[] = [];
  for (let i = 0; i < segs; i++) {
    const y = C - 14 + (i * 76) / segs;
    const half = (w / 2) * Math.sqrt(Math.max(0.05, 1 - ((y - C - 8) / 62) ** 2));
    if (a.pattern === 'bands' && i % 2 === 0) {
      p.fill(a.accent, 0.85).fillRect(C - half + 4, y - 2, half * 2 - 8, 6);
    }
    p.line(3, shade(a.body, -0.4));
    g.lineBetween(C - half + 2, y, C + half - 2, y);
    if (a.pattern === 'stripes') p.line(3, a.accent).lineBetween(C - 6, y + 3, C + 6, y + 3);
    spots.push([C - half * 0.55, y + 4], [C + half * 0.55, y + 4]);
  }
  p.fill(shade(a.body, -0.55)).fillCircle(C - 22, C - 40, 6).fillCircle(C + 22, C - 40, 6);
  if (a.pattern === 'rim') p.line(5, a.accent).strokeEllipse(C, C + 8, w, 124);
  return { spots };
}

function bone(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  const spots: Pt[] = [];
  if (v === 0) {
    const [x1, y1, x2, y2] = [C - 42, C + 42, C + 42, C - 42];
    p.line(30, a.body).lineBetween(x1, y1, x2, y2);
    p.fill(a.body);
    for (const [x, y] of [[x1, y1], [x2, y2]] as Pt[]) {
      g.fillCircle(x - 13, y - 13, 19).fillCircle(x + 13, y + 13, 19);
    }
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      spots.push([x, y]);
      if (a.pattern === 'stripes') p.line(5, a.accent).lineBetween(x - 9, y - 9, x + 9, y + 9);
    }
    if (a.pattern === 'rim') p.line(4, a.accent).lineBetween(x1 + 8, y1 - 14, x2 - 14, y2 + 8);
  } else if (v === 1) {
    // curved rib / antler tine
    const pts = arcPts(C + 52, C + 52, 92, deg(185), deg(262), 20);
    p.line(24, a.body);
    polyline(g, pts);
    p.fill(a.body).fillCircle(at(pts, 0)[0], at(pts, 0)[1], 20);
    p.fill(shade(a.body, -0.15)).fillCircle(at(pts, 20)[0], at(pts, 20)[1], 13);
    // side tine
    p.line(14, a.body).lineBetween(at(pts, 10)[0], at(pts, 10)[1], at(pts, 10)[0] + 30, at(pts, 10)[1] - 44);
    for (let i = 2; i < 20; i += 3) spots.push(at(pts, i));
    if (a.pattern === 'stripes') {
      p.line(4, a.accent);
      for (let i = 3; i < 20; i += 3) g.lineBetween(at(pts, i)[0] - 10, at(pts, i)[1] - 6, at(pts, i)[0] + 10, at(pts, i)[1] + 6);
    }
  } else {
    // vertebrae chain
    p.line(10, shade(a.body, -0.2)).lineBetween(C - 60, C + 40, C + 60, C - 40);
    for (let i = 0; i < 4; i++) {
      const x = C - 48 + i * 32;
      const y = C + 32 - i * 21;
      p.fill(a.body);
      poly(g, [[x - 6, y - 10], [x + 6, y - 10], [x + 2, y - 40]]);
      poly(g, [[x - 6, y + 10], [x + 6, y + 10], [x - 2, y + 40]]);
      g.fillCircle(x, y, 17);
      p.fill(shade(a.body, -0.35)).fillCircle(x, y, 6);
      if (a.pattern === 'stripes') p.line(3, a.accent).strokeCircle(x, y, 13);
      spots.push([x + 9, y - 5]);
    }
  }
  return { spots };
}

function tooth(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  let body: Pt[];
  if (v === 0) {
    p.fill(shade(a.body, -0.25)).fillRoundedRect(C - 28, C - 70, 56, 34, 12);
    body = [[C - 30, C - 44], [C + 30, C - 44], [C + 30, C - 8], [C + 22, C + 30], [C + 6, C + 70], [C - 4, C + 34], [C - 22, C - 2]];
  } else if (v === 1) {
    p.fill(shade(a.body, -0.25));
    poly(g, [[C - 46, C + 10], [C - 24, C + 10], [C - 34, C + 66]]);
    poly(g, [[C + 24, C + 10], [C + 46, C + 10], [C + 36, C + 66]]);
    body = [[C - 54, C - 26], [C - 36, C - 50], [C - 14, C - 38], [C, C - 52], [C + 16, C - 38], [C + 38, C - 52], [C + 54, C - 26], [C + 50, C + 18], [C - 50, C + 18]];
  } else {
    body = [[C - 34, C - 62], [C + 34, C - 62], [C + 18, C + 10], [C, C + 70], [C - 18, C + 10]];
  }
  p.fill(a.body);
  poly(g, body);
  if (v === 2) {
    p.fill(a.pattern === 'glow' ? a.accent : shade(a.body, -0.3));
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const x = C + 34 - 34 * t;
      const y = C - 62 + 132 * t;
      poly(g, [[x, y], [x + 8, y + 6], [x - 2, y + 14]]);
    }
  }
  if (a.pattern === 'rim') {
    p.line(5, a.accent);
    outline(g, body);
  }
  if (a.pattern === 'bands' || a.pattern === 'stripes') {
    p.line(4, a.accent);
    for (let i = 0; i < 4; i++) {
      const y = C - 30 + i * 16;
      const hw = v === 1 ? 44 : 22 - i * 4;
      g.lineBetween(C - hw, y, C + hw, y);
    }
  }
  p.fill(0xffffff, 0.35).fillEllipse(C - 10, C - 22, 10, 34);
  return { spots: [[C - 8, C - 30], [C + 10, C - 20], [C, C], [C - 12, C + 10], [C + 8, C + 24], [C + 2, C - 40]] };
}

function leaf(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  const spots: Pt[] = [];
  const rot = deg(-40);
  if (v === 2) {
    // fern frond: stem with alternating leaflets
    p.line(6, shade(a.body, -0.3)).lineBetween(C - 54, C + 62, C + 44, C - 62);
    for (let i = 0; i < 9; i++) {
      const t = 0.1 + i * 0.1;
      const x = C - 54 + 98 * t;
      const y = C + 62 - 124 * t;
      const s = 1 - t * 0.6;
      for (const side of [-1, 1]) {
        const pts = ellipsePts(x + side * 18 * s, y + side * 12 * s, 22 * s, 8 * s, rot + side * 0.9, 14);
        p.fill(a.body);
        poly(g, pts);
        if (a.pattern === 'veins') p.line(2, a.accent).lineBetween(x, y, x + side * 30 * s, y + side * 18 * s);
      }
      spots.push([x, y]);
    }
    return { spots };
  }
  const wob = v === 1 ? (t: number): number => 1 + 0.07 * Math.sin(t * 14) : undefined;
  const body = ellipsePts(C, C, v === 1 ? 60 : 66, v === 1 ? 46 : 38, rot, 48, wob);
  p.fill(a.body);
  poly(g, body);
  if (a.pattern === 'rim') {
    p.line(4, a.accent);
    outline(g, body);
  }
  // midrib + veins
  const ux = Math.cos(rot);
  const uy = Math.sin(rot);
  p.line(5, a.pattern === 'veins' ? a.accent : shade(a.body, -0.35));
  g.lineBetween(C - ux * 64, C - uy * 64, C + ux * 64, C + uy * 64);
  p.line(3, a.pattern === 'veins' ? a.accent : shade(a.body, -0.3));
  for (let i = -3; i <= 3; i++) {
    const bx = C + ux * i * 15;
    const by = C + uy * i * 15;
    for (const side of [-1, 1]) {
      const vx = ux * 0.6 - uy * side;
      const vy = uy * 0.6 + ux * side;
      const len = 30 - Math.abs(i) * 5;
      g.lineBetween(bx, by, bx + vx * len, by + vy * len);
      spots.push([bx + vx * len * 0.6, by + vy * len * 0.6]);
    }
  }
  if (a.pattern === 'bands') {
    p.fill(a.accent, 0.55);
    for (let i = -2; i <= 2; i++) g.fillCircle(C + ux * i * 22, C + uy * i * 22, 8);
  }
  p.line(7, shade(a.body, -0.3)).lineBetween(C - ux * 62, C - uy * 62, C - ux * 80, C - uy * 80 + 6);
  return { spots };
}

function footprint(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  // the impression sits in a slab
  p.fill(shade(a.body, 0.45), 0.6).fillEllipse(C, C + 4, 140, 148);
  const spots: Pt[] = [];
  if (v === 0) {
    const heel: Pt = [C, C + 44];
    const toes: Pt[] = [[C - 44, C - 36], [C, C - 60], [C + 44, C - 36]];
    p.line(15, a.body);
    for (const [x, y] of toes) {
      g.lineBetween(heel[0], heel[1], x, y);
      spots.push([(heel[0] + x) / 2, (heel[1] + y) / 2]);
    }
    p.fill(a.body);
    for (const [x, y] of toes) g.fillCircle(x, y, 7.5);
    g.fillCircle(heel[0], heel[1], 11);
    p.line(10, a.body).lineBetween(heel[0], heel[1], C + 4, C + 70);
  } else if (v === 1) {
    p.fill(a.body).fillEllipse(C, C + 26, 76, 60);
    const toes: Pt[] = [[C - 38, C - 14], [C - 14, C - 38], [C + 14, C - 38], [C + 38, C - 14]];
    for (const [x, y] of toes) {
      p.fill(a.body).fillCircle(x, y, 15);
      spots.push([x, y]);
    }
    spots.push([C - 14, C + 26], [C + 14, C + 26], [C, C + 40]);
  } else {
    const toes: Pt[][] = [
      [[C - 12, C + 20], [C - 54, C - 34], [C - 42, C - 46], [C + 2, C + 4]],
      [[C - 10, C + 10], [C - 6, C - 66], [C + 10, C - 66], [C + 12, C + 10]],
      [[C + 12, C + 20], [C + 54, C - 34], [C + 42, C - 46], [C - 2, C + 4]],
    ];
    p.fill(a.body).fillEllipse(C, C + 34, 56, 48);
    for (const t of toes) {
      p.fill(a.body);
      poly(g, t);
      spots.push([(at(t, 0)[0] + at(t, 1)[0]) / 2, (at(t, 0)[1] + at(t, 1)[1]) / 2]);
    }
    p.fill(a.accent);
    poly(g, [[C - 54, C - 34], [C - 42, C - 46], [C - 60, C - 52]]);
    poly(g, [[C - 6, C - 66], [C + 10, C - 66], [C + 2, C - 80]]);
    poly(g, [[C + 54, C - 34], [C + 42, C - 46], [C + 60, C - 52]]);
  }
  return { spots };
}

function skull(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  if (v === 1) {
    p.fill(shade(a.body, -0.15));
    poly(g, [[C - 40, C - 36], [C - 26, C - 50], [C - 70, C - 74]]);
    poly(g, [[C + 40, C - 36], [C + 26, C - 50], [C + 70, C - 74]]);
  }
  if (v === 2) {
    p.fill(a.pattern === 'glow' ? a.accent : shade(a.body, -0.1));
    for (let i = 0; i < 5; i++) {
      const x = C - 40 + i * 20;
      const h = i === 2 ? 34 : i % 2 ? 24 : 16;
      poly(g, [[x - 9, C - 46], [x + 9, C - 46], [x, C - 46 - h]]);
    }
  }
  p.fill(a.body).fillEllipse(C, C - 10, 112, 96);
  p.fill(a.body).fillRoundedRect(C - 32, C + 18, 64, 42, 14);
  if (a.pattern === 'rim') p.line(5, a.accent).strokeEllipse(C, C - 10, 112, 96);
  if (a.pattern === 'bands') {
    p.line(4, a.accent);
    g.lineBetween(C - 46, C - 34, C + 46, C - 34).lineBetween(C - 52, C - 22, C + 52, C - 22);
  }
  const eye = v === 2 ? 18 : 14;
  p.fill(shade(a.body, -0.6)).fillCircle(C - 25, C - 6, eye).fillCircle(C + 25, C - 6, eye);
  if (a.pattern === 'glow') p.fill(a.accent).fillCircle(C - 25, C - 6, eye * 0.45).fillCircle(C + 25, C - 6, eye * 0.45);
  p.fill(shade(a.body, -0.5));
  poly(g, [[C - 7, C + 22], [C + 7, C + 22], [C, C + 10]]);
  // teeth
  p.fill(shade(a.body, 0.5));
  for (let i = 0; i < 5; i++) {
    const x = C - 24 + i * 12;
    poly(g, [[x - 5, C + 56], [x + 5, C + 56], [x, C + 68]]);
  }
  if (v === 0) {
    // two long fangs
    p.fill(shade(a.body, 0.55));
    poly(g, [[C - 30, C + 54], [C - 20, C + 54], [C - 26, C + 80]]);
    poly(g, [[C + 20, C + 54], [C + 30, C + 54], [C + 26, C + 80]]);
  }
  return { spots: [[C - 40, C - 34], [C + 40, C - 34], [C, C - 44], [C - 46, C + 8], [C + 46, C + 8], [C, C - 26], [C - 18, C + 38], [C + 18, C + 38]] };
}

function clawShape(cx: number, cy: number, r: number, a0: number, a1: number, thick: number): Pt[] {
  const outer = arcPts(cx, cy, r, a0, a1, 18);
  const inner = arcPts(cx + thick * 0.35, cy + thick * 0.2, r - thick, a1 - 0.08, a0, 18);
  return [...outer, ...inner];
}

function claw(p: Pen, a: FossilArt): Drawn {
  const g = p.g;
  const v = a.variant;
  const spots: Pt[] = [];
  const shapes: Pt[][] = [];
  if (v === 1) {
    for (let i = 0; i < 3; i++) shapes.push(clawShape(C + 4 + (i - 1) * 34, C + 40, 46, deg(185), deg(282), 20));
    p.fill(shade(a.body, 0.25)).fillEllipse(C, C + 50, 120, 40);
  } else {
    shapes.push(clawShape(C + 40, C + 30, v === 2 ? 92 : 76, deg(170), deg(282), v === 2 ? 40 : 32));
    p.fill(shade(a.body, 0.2)).fillCircle(C - 40, C + 40, v === 2 ? 26 : 22);
  }
  for (const s of shapes) {
    p.fill(a.body);
    poly(g, s);
    if (a.pattern === 'rim') {
      p.line(4, a.accent);
      outline(g, s);
    }
    for (let i = 3; i < 16; i += 4) spots.push([(at(s, i)[0] * 2 + at(s, 36 - i)[0]) / 3, (at(s, i)[1] * 2 + at(s, 36 - i)[1]) / 3]);
    if (a.pattern === 'stripes' || a.pattern === 'bands') {
      p.line(4, a.accent);
      for (let i = 2; i < 17; i += 3) g.lineBetween(at(s, i)[0], at(s, i)[1], at(s, 36 - i)[0], at(s, 36 - i)[1]);
    }
  }
  if (v === 2) {
    p.fill(a.pattern === 'glow' ? 0xffffff : shade(a.body, -0.35));
    const s = at(shapes, 0);
    for (let i = 20; i < 34; i += 3) poly(g, [[at(s, i)[0], at(s, i)[1]], [at(s, i + 1)[0] + 6, at(s, i + 1)[1] + 6], [at(s, i + 2)[0], at(s, i + 2)[1]]]);
  }
  return { spots };
}

const ARCH = { shell, trilobite, bone, tooth, leaf, footprint, skull, claw } as const;

/** Draw one fossil into `g` (0..FOSSIL_SIZE). */
export function drawFossil(g: G, art: FossilArt): void {
  if (art.pattern === 'glow') {
    for (const [r, al] of [[78, 0.1], [68, 0.14], [56, 0.18]] as const) g.fillStyle(art.accent, al).fillCircle(C, C, r);
  }
  g.save();
  g.translateCanvas(4, 6);
  ARCH[art.arch](new Pen(g, true), art);
  g.restore();
  const drawn = ARCH[art.arch](new Pen(g, false), art);
  if (art.pattern === 'dots') {
    g.fillStyle(art.accent, 1);
    for (const [x, y] of drawn.spots) g.fillCircle(x, y, 5);
  } else if (art.pattern === 'speckle') {
    g.fillStyle(art.accent, 0.9);
    drawn.spots.forEach(([x, y], i) => {
      g.fillCircle(x + ((i * 7) % 5) - 2, y + ((i * 11) % 5) - 2, 2.6);
      g.fillCircle(x + ((i * 13) % 9) - 4, y - ((i * 5) % 7) + 3, 1.8);
    });
  }
  if (art.pattern === 'glow') {
    g.fillStyle(0xffffff, 0.55).fillCircle(C - 22, C - 26, 6);
    g.fillStyle(0xffffff, 0.35).fillCircle(C - 12, C - 34, 3);
  }
}
