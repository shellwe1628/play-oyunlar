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

export type PatternKind = 'open' | 'wide' | 'wave' | 'zig' | 'needle' | 'slalom' | 'bars' | 'steps' | 'rhythm';

export interface Seg {
  k: PatternKind | 'gate';
  q?: number;
  gem?: boolean;
  gate?: GateKind;
  /** Override for the first sideways direction. */
  first?: 1 | -1;
  /** rhythm: vertical length of each leg (px); the turn interval is leg / speed. */
  leg?: number;
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
  }
}
