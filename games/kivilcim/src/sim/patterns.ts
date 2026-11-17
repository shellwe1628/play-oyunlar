/**
 * Pattern segments (pure). Every segment starts and ends at the PORT: corridor centre 360,
 * half-width PORT_H, vertical. So any sequence joins cleanly (levels and endless alike).
 * Difficulty q runs 0 (gentle) → 1 (hardest the game asks for).
 */
import type { Rng } from '@oyun/core/pure';
import { type TrackBuilder } from './builder';
import { GEM_R, START_X } from './constants';
import type { GateKind } from './track';

export const PORT_H = 170;
/** Opening chamber: walls at the screen edges (EDGE_MIN), kept for OPEN_SAFE px of climb. */
export const OPEN_H = 334;
export const OPEN_SAFE = 340;

export type PatternKind = 'open' | 'wide' | 'wave' | 'zig' | 'needle' | 'slalom' | 'bars' | 'steps' | 'rhythm' | 'split' | 'laser' | 'spin' | 'piston' | 'wind' | 'portal' | 'mirror';

/** Mechanic kinds (introduced one at a time from world 2 on). */
export const MECHANICS = ['split', 'laser', 'spin', 'wind', 'piston', 'dark', 'portal', 'mirror'] as const;
export type Mechanic = (typeof MECHANICS)[number];

export interface Seg {
  k: PatternKind | 'gate';
  q?: number;
  gem?: boolean;
  gate?: GateKind;
  /** Override for the first sideways direction. */
  first?: 1 | -1;
  /** rhythm: vertical length of each leg (px); the turn interval is leg / speed. */
  leg?: number;
  /** The segment is a dark section (lit only around the spark). */
  dark?: boolean;
}

export interface PatternCtx {
  rng: Rng;
  /** Spark is mini (corridors tighten). */
  mini: boolean;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));
const side = (rng: Rng): 1 | -1 => (rng.chance(0.5) ? 1 : -1);

/** Width factor inside mini stretches. */
export const MINI_SCALE = 0.6;

function backToPort(b: TrackBuilder, tail = 150): void {
  if (Math.abs(b.c - START_X) > 1e-6) b.shift(START_X - b.c, 0.8);
  b.straight(Math.max(tail, Math.abs(b.h - PORT_H) / 0.6 + 40), PORT_H);
}

/** Append one segment. */
export function emit(b: TrackBuilder, seg: Seg, ctx: PatternCtx): void {
  const y0 = b.y;
  emitInner(b, seg, ctx);
  if (seg.dark) b.darks.push({ y0: y0 - 200, y1: b.y });
  if (seg.k !== 'gate') b.sections.push({ y: b.y, scored: seg.k !== 'open' && seg.k !== 'wide' && (seg.q ?? 0) >= 0.1 });
}

function emitInner(b: TrackBuilder, seg: Seg, ctx: PatternCtx): void {
  const q = seg.q ?? 0;
  const s = ctx.mini ? MINI_SCALE : 1;
  const rng = ctx.rng;
  const first = seg.first ?? side(rng);
  switch (seg.k) {
    case 'gate': {
      b.straight(120, PORT_H);
      b.gate(seg.gate ?? 'normal');
      b.straight(200, PORT_H);
      if (seg.gate === 'mini') ctx.mini = true;
      if (seg.gate === 'big') ctx.mini = false;
      return;
    }
    case 'open': {
      // The launch chamber: full screen width (walls at the screen edges) for the first
      // OPEN_SAFE px, which the launch ramp makes ~1.6 s, so no input can kill there; then a
      // gradual narrowing and a lazy S.
      b.straight(OPEN_SAFE, OPEN_H);
      b.to(320, b.c, 290);
      b.straight(360, 270);
      b.to(200, b.c, 220);
      b.shift(100 * first, 0.5);
      b.shift(-100 * first, 0.5);
      backToPort(b, 200);
      return;
    }
    case 'wide': {
      const h = lerp(250, 190, q) * (ctx.mini ? 0.8 : 1);
      const len = lerp(760, 520, q);
      b.straight(len, h);
      if (seg.gem) b.addGem(b.c + first * (h - GEM_R - 30), b.y - len * 0.45);
      backToPort(b);
      return;
    }
    case 'wave': {
      const h = lerp(165, 110, q) * (ctx.mini ? 0.8 : 1);
      const a = lerp(150, 200, q);
      const slope = lerp(0.55, 0.85, q);
      b.taper(h);
      b.shift(a * first, slope);
      if (seg.gem) b.addGem(b.c + first * (h * 0.55), b.y);
      b.shift(-2 * a * first, slope);
      b.shift(a * first, slope);
      backToPort(b);
      return;
    }
    case 'zig': {
      const legs = 4 + Math.round(q * 3);
      const leg = lerp(380, 165, q);
      const h = lerp(118, 50, q) * s;
      b.zig(legs, leg, h, first);
      if (seg.gem) {
        const c = b.corners[1]!;
        b.addGem(c.x + c.side * h * 0.5, c.y);
      }
      backToPort(b);
      return;
    }
    case 'rhythm': {
      // The reaction-window crux: a long zigzag whose legs are a set climb apart, so a turn is
      // due every leg/speed seconds. Wide enough that precision is not what it asks for.
      const leg = seg.leg ?? 256;
      const h = lerp(120, 72, q) * s;
      b.zig(7, leg, h, first);
      if (seg.gem) {
        const c = b.corners[3]!;
        b.addGem(c.x + c.side * h * 0.45, c.y);
      }
      backToPort(b);
      return;
    }
    case 'needle': {
      // One long, narrow 45° run and back: pure precision.
      const h = lerp(92, 33, q) * s;
      const leg = Math.min(lerp(300, 420, q), 2 * (334 - h));
      b.zig(1, leg, h, first, 1, true);
      if (seg.gem) {
        const c = b.corners[0]!;
        b.addGem(c.x + c.side * h * 0.45, c.y);
      }
      backToPort(b);
      return;
    }
    case 'slalom': {
      const n = 3 + Math.round(q * 2);
      const spacing = lerp(500, 340, q);
      const H = lerp(210, 170, q);
      const g = lerp(200, 130, q) * (ctx.mini ? 0.75 : 1);
      const y0 = b.y + Math.max(60, spacing * 0.5);
      b.slalom(n, spacing, H, g, first);
      if (seg.gem) {
        // In the gap beside the second block, hugging the wall.
        const sideOfGap = first === -1 ? -1 : 1; // second block is on the other side; its gap is on `first`'s side
        b.addGem(START_X + sideOfGap * (H - GEM_R - 18), y0 + spacing);
      }
      backToPort(b);
      return;
    }
    case 'bars': {
      const n = 3 + Math.round(q * 2);
      const spacing = lerp(560, 340, q);
      const H = lerp(220, 175, q);
      const half = lerp(55, 95, q);
      const period = lerp(2.8, 1.8, q);
      const y0 = b.y + Math.max(80, spacing * 0.6);
      b.bars(n, spacing, H, period, half, 12, first);
      // The first bar swings to `first`, so its free side is -first: the gem waits there.
      if (seg.gem) b.addGem(START_X - first * (H - GEM_R - 22), y0 - 70);
      backToPort(b);
      return;
    }
    case 'steps': {
      // Staircase: straight, 45° step, straight, step... two steps out, two back.
      const a = lerp(320, 200, q);
      const dx = lerp(100, 150, q);
      const h = lerp(150, 92, q) * (ctx.mini ? 0.75 : 1);
      b.taper(h);
      const offsets = [0.5, 1, 0.5, 0];
      for (let i = 0; i < offsets.length; i++) {
        b.straight(a, h);
        b.shift(START_X + first * dx * offsets[i]! - b.c, 1);
        if (seg.gem && i === 1) b.addGem(b.c - first * (h - GEM_R - 16), b.y + a * 0.5);
      }
      b.straight(a, h);
      backToPort(b);
      return;
    }
    case 'split': {
      // Islands split the corridor in two; the gem branch is the narrower one.
      const H = lerp(262, 215, q);
      const r = lerp(40, 60, q);
      const hl = lerp(150, 260, q);
      const n = 1 + Math.round(q * 2);
      b.straight(Math.max(60, Math.abs(b.h - H) / 0.6 + 40), H);
      let sd = first;
      for (let k = 0; k < n; k++) {
        const off = sd * lerp(8, 34, q);
        b.straight(k === 0 ? 140 : 320);
        const yc = b.y + hl + r;
        b.pills.push({ y: yc, x0: b.c + off, hl, r, amp: 0, period: 1, phase: 0 });
        if (seg.gem && k === n - 1) b.addGem(b.c + off + sd * (r + (H - Math.abs(off) - r) / 2), yc + hl * 0.3);
        b.straight(2 * (hl + r) + 40);
        sd = sd === 1 ? -1 : 1;
      }
      b.straight(120);
      backToPort(b);
      return;
    }
    case 'laser': {
      // Rows of half-beams blinking on the beat in a checkerboard: when the spark reaches a row,
      // one half is lit (the "live" side alternates row by row) and the other half is dark.
      const H = lerp(205, 160, q) * (ctx.mini ? 0.8 : 1);
      const n = 3 + Math.round(q * 3);
      const spacing = q < 0.34 ? 512 : q < 0.67 ? 384 : 256;
      b.straight(Math.max(120, Math.abs(b.h - H) / 0.6 + 60), H);
      const yr0 = Math.ceil((b.y + 120) / 128) * 128;
      const ys: number[] = [];
      for (let k = 0; k < n; k++) ys.push(yr0 + k * spacing);
      b.to(yr0 - b.y, b.c);
      const ta = ys.map((y) => b.arrivalTime(y));
      const period = 2 * (ta.length > 1 ? ta[1]! - ta[0]! : 1);
      let live = first;
      for (let k = 0; k < n; k++) {
        const y = ys[k]!;
        const phL = 0.25 - ta[k]! / period + (live === -1 ? 0 : 0.5);
        const fr = (v: number): number => v - Math.floor(v);
        b.lasers.push({ y, x0: b.c - H - 12, x1: b.c, thick: 6, period, phase: fr(phL), duty: 0.5 });
        b.lasers.push({ y, x0: b.c, x1: b.c + H + 12, thick: 6, period, phase: fr(phL + 0.5), duty: 0.5 });
        if (seg.gem && k === 1) b.addGem(b.c - live * (H - GEM_R - 22), y + 70);
        live = live === 1 ? -1 : 1;
      }
      b.straight(ys[n - 1]! - b.y + 220, H);
      backToPort(b);
      return;
    }
    case 'spin': {
      // Rotating bars: horizontal-ish as the spark arrives, so it passes beside a tip.
      const H = lerp(250, 212, q);
      const n = 2 + Math.round(q * 2);
      const spacing = lerp(540, 400, q);
      const len = lerp(78, 112, q);
      const omega = lerp(1.6, 2.5, q);
      b.straight(Math.max(120, Math.abs(b.h - H) / 0.6 + 60), H);
      const y0 = b.y + 200;
      let sd = first;
      for (let k = 0; k < n; k++) {
        const y = y0 + k * spacing;
        const tk = b.arrivalTime(y);
        const om = (k % 2 === 0 ? 1 : -1) * omega;
        const x = b.c + sd * lerp(0, 36, q);
        b.spinners.push({ y, x, len, thick: 11, omega: om, phase: rng.range(-0.25, 0.25) - om * tk });
        if (seg.gem && k === n - 1) b.addGem(x - sd * (len + 60), y + 40);
        sd = sd === 1 ? -1 : 1;
      }
      b.straight(y0 + (n - 1) * spacing - b.y + 240, H);
      backToPort(b);
      return;
    }
    case 'piston': {
      // Moving walls: slabs slide out of alternate walls and back; at higher q they come in
      // pairs from both walls (a door closing on the beat).
      const H = lerp(225, 195, q);
      const n = 3 + Math.round(q * 2);
      const spacing = lerp(500, 360, q);
      const hl = lerp(60, 90, q);
      const r = 24;
      const ext = lerp(95, 130, q);
      const period = lerp(2.2, 1.5, q);
      b.straight(Math.max(120, Math.abs(b.h - H) / 0.6 + 60), H);
      const y0 = b.y + 160 + hl;
      let sd = first;
      for (let k = 0; k < n; k++) {
        const y = y0 + k * spacing;
        const tk = b.arrivalTime(y);
        const pair = q >= 0.5 && k % 2 === 1;
        // Mid-stroke, sliding out, as the spark arrives.
        const phase = -(2 * Math.PI * tk) / period + (pair ? Math.PI / 2 - 0.5 : 0);
        for (const s2 of pair ? [1, -1] : [sd]) {
          const wall = b.c - s2 * H;
          const xr = wall - s2 * (r + 4);
          const xe = wall - s2 * (r - (pair ? ext * 0.62 : ext));
          b.pills.push({ y, x0: (xr + xe) / 2, hl, r, amp: (xe - xr) / 2, period, phase });
        }
        if (seg.gem && k === 1) b.addGem(b.c + sd * (H - GEM_R - 30), y);
        sd = sd === 1 ? -1 : 1;
      }
      b.straight(y0 + (n - 1) * spacing - b.y + hl + 200, H);
      backToPort(b);
      return;
    }
    case 'wind': {
      // A wind zone: the 45° line bends (one way faster, the other slower); the corridor's
      // zigzag follows the bent line.
      const w = first * lerp(0.22, 0.42, q);
      const legs = 4 + Math.round(q * 2);
      const leg = lerp(320, 190, q);
      const h = lerp(120, 64, q) * s;
      b.taper(h);
      b.straight(160, h);
      const wy0 = b.y - 120;
      const c0 = b.c;
      let dir: 1 | -1 = rng.chance(0.5) ? 1 : -1;
      const climb = (dx: number): number => Math.abs(dx) / Math.abs((dx > 0 ? 1 : -1) + w);
      const goTo = (x: number): void => {
        b.to(climb(x - b.c), x, h);
      };
      goTo(c0 + (dir * leg) / 2);
      let gemDone = !seg.gem;
      for (let i = 0; i < legs; i++) {
        dir = dir === 1 ? -1 : 1;
        goTo(c0 + (dir * leg) / 2);
        if (!gemDone && i === 1) {
          b.addGem(b.c + dir * h * 0.45, b.y);
          gemDone = true;
        }
      }
      goTo(c0);
      b.straight(40, h);
      b.winds.push({ y0: wy0, y1: b.y, w });
      backToPort(b, 200);
      return;
    }
    case 'portal': {
      // Portal pairs: a barrier with two rings; through one ring you come out of the other.
      const H = lerp(300, 280, q);
      const rt = lerp(74, 66, q);
      const n = 1 + Math.round(q * 1.4);
      b.straight(Math.max(140, Math.abs(b.h - H) / 0.6 + 60), H);
      let sd = first;
      for (let k = 0; k < n; k++) {
        b.straight(260);
        const y = Math.ceil(b.y / 128) * 128;
        b.to(y - b.y, b.c);
        const d = lerp(132, 150, q) + (k % 2) * 10;
        const xa = b.c - d + sd * lerp(0, 25, q);
        const xb = b.c + d + sd * lerp(0, 25, q);
        b.portals.push({ y, xa, xb, r: rt });
        const bar = (x0: number, x1: number): void => {
          b.lasers.push({ y, x0, x1, thick: 6, period: 1, phase: 0, duty: 1 });
        };
        bar(b.c - H - 12, xa - rt);
        bar(xa + rt, xb - rt);
        bar(xb + rt, b.c + H + 12);
        // A spike block right behind one exit makes the choice matter.
        const bx = sd === 1 ? xb : xa;
        b.addBlock(bx + sd * 20, y + 210, 34);
        if (seg.gem && k === n - 1) b.addGem(sd === 1 ? xa : xb, y + 150);
        b.straight(420);
        sd = sd === 1 ? -1 : 1;
      }
      backToPort(b);
      return;
    }
    case 'mirror': {
      // Mirror section: a twin spark flies mirrored (x → SHAFT_W - x) and must survive too.
      // Blocks off the centre line threaten one spark or the other.
      const H = lerp(240, 222, q);
      const n = 4 + Math.round(q * 2);
      const spacing = lerp(470, 340, q);
      const o = lerp(122, 104, q);
      const sz = lerp(36, 44, q);
      b.straight(Math.max(120, Math.abs(b.h - H) / 0.6 + 60), H);
      const zy0 = b.y;
      b.straight(220);
      const y0 = b.y + 60;
      let sd = first;
      for (let k = 0; k < n; k++) {
        const y = y0 + k * spacing;
        b.addBlock(b.c + sd * o, y, sz);
        if (seg.gem && k === 2) b.addGem(b.c + sd * (H - GEM_R - 16), y + spacing * 0.5);
        sd = sd === 1 ? -1 : 1;
      }
      b.straight(y0 + (n - 1) * spacing - b.y + 260, H);
      b.mirrors.push({ y0: zy0 + 100, y1: b.y - 60 });
      backToPort(b);
      return;
    }
  }
}
