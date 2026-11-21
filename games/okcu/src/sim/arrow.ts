/** Arrow flight and swept hit tests (pure). */
import type { Body } from './body';
import { pointSegDist2 } from './geom';
import type { Part } from './ragdoll';

export interface Ballistic {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Exact constant-gravity step: matches the closed-form arc for any dt. */
export function flyArrow(a: Ballistic, dt: number, g: number): void {
  a.x += a.vx * dt;
  a.y += a.vy * dt + 0.5 * g * dt * dt;
  a.vy += g * dt;
}

export interface PartHit {
  part: number;
  /** fraction along the swept segment where the arrow tip entered */
  t: number;
  x: number;
  y: number;
}

const result: PartHit = { part: -1, t: 0, x: 0, y: 0 };

/** Squared distance from the point at fraction t of P0→P1 to capsule a-b. */
function d2At(t: number, x0: number, y0: number, dx: number, dy: number, ax: number, ay: number, bx: number, by: number): number {
  return pointSegDist2(x0 + dx * t, y0 + dy * t, ax, ay, bx, by);
}

/**
 * Entry fraction of the swept segment P0→P1 into the capsule (a, b, r), or -1. The distance
 * from a point moving on a line to a segment is convex in t, so a ternary search finds the
 * closest approach exactly (no sampling, so no tunnelling at any speed) and a bisection finds
 * the entry.
 */
export function sweepCapsule(x0: number, y0: number, x1: number, y1: number, ax: number, ay: number, bx: number, by: number, r: number): number {
  const r2 = r * r;
  // cheap reject on bounding boxes
  if (Math.max(x0, x1) < Math.min(ax, bx) - r || Math.min(x0, x1) > Math.max(ax, bx) + r) return -1;
  if (Math.max(y0, y1) < Math.min(ay, by) - r || Math.min(y0, y1) > Math.max(ay, by) + r) return -1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (d2At(0, x0, y0, dx, dy, ax, ay, bx, by) <= r2) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    if (d2At(m1, x0, y0, dx, dy, ax, ay, bx, by) <= d2At(m2, x0, y0, dx, dy, ax, ay, bx, by)) hi = m2;
    else lo = m1;
  }
  const tmin = (lo + hi) / 2;
  if (d2At(tmin, x0, y0, dx, dy, ax, ay, bx, by) > r2) return -1;
  lo = 0;
  hi = tmin;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (d2At(m, x0, y0, dx, dy, ax, ay, bx, by) <= r2) hi = m;
    else lo = m;
  }
  return hi;
}

/**
 * Earliest part of `body` (capsules scaled by `scale`) hit by the swept tip P0→P1.
 * Returns a shared result object (copy what you need) or null.
 */
export function hitParts(body: Body, scale: number, parts: readonly Part[], x0: number, y0: number, x1: number, y1: number): PartHit | null {
  let best = -1;
  let bestT = 2;
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]!;
    let ax = body.x[part.a]!;
    let ay = body.y[part.a]!;
    let bx = body.x[part.b]!;
    let by = body.y[part.b]!;
    if (part.u !== undefined) {
      ax = bx = ax + (bx - ax) * part.u;
      ay = by = ay + (by - ay) * part.u;
    }
    const t = sweepCapsule(x0, y0, x1, y1, ax, ay, bx, by, part.r * scale);
    // strict < keeps the earlier entry in the list (head beats torso on a tie)
    if (t >= 0 && t < bestT - 1e-9) {
      bestT = t;
      best = p;
    }
  }
  if (best < 0) return null;
  result.part = best;
  result.t = bestT;
  result.x = x0 + (x1 - x0) * bestT;
  result.y = y0 + (y1 - y0) * bestT;
  return result;
}
