/** Small geometry helpers for the sim (pure, allocation-free where it matters). y points down. */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Closed-form ballistic position after t seconds (gravity g along +y). */
export function ballisticAt(x0: number, y0: number, vx: number, vy: number, g: number, t: number): { x: number; y: number } {
  return { x: x0 + vx * t, y: y0 + vy * t + 0.5 * g * t * t };
}

/**
 * Launch angle (radians, screen space: 0 = right, negative = up) that sends a projectile at
 * speed v from the origin to (dx, dy) under gravity g. `high` picks the lob. Null = out of range.
 */
export function solveLaunchAngle(dx: number, dy: number, v: number, g: number, high: boolean): number | null {
  const x = Math.abs(dx);
  const h = -dy; // height above the origin (up positive)
  const v2 = v * v;
  const disc = v2 * v2 - g * (g * x * x + 2 * h * v2);
  if (disc < 0 || x < 1e-6) return null;
  const root = Math.sqrt(disc);
  const up = Math.atan2(v2 + (high ? root : -root), g * x); // elevation above horizontal
  return dx >= 0 ? -up : Math.PI + up;
}

/** Smallest speed that reaches (dx, dy) at all (the 45°-ish optimum), for aim helpers. */
export function minLaunchSpeed(dx: number, dy: number, g: number): number {
  const x = Math.abs(dx);
  const h = -dy;
  return Math.sqrt(g * (h + Math.sqrt(h * h + x * x)));
}

/** Squared distance from point P to segment AB. */
export function pointSegDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 1e-12 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t - px;
  const cy = ay + aby * t - py;
  return cx * cx + cy * cy;
}

/** Parameter (0..1) of the closest point on AB to P. */
export function closestT(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  return len2 > 1e-12 ? clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1) : 0;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Squared distance between segments PQ and AB (0 when they cross). */
export function segSegDist2(
  px: number,
  py: number,
  qx: number,
  qy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const rx = qx - px;
  const ry = qy - py;
  const sx = bx - ax;
  const sy = by - ay;
  const denom = cross(rx, ry, sx, sy);
  if (Math.abs(denom) > 1e-12) {
    const t = cross(ax - px, ay - py, sx, sy) / denom;
    const u = cross(ax - px, ay - py, rx, ry) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(
    pointSegDist2(px, py, ax, ay, bx, by),
    pointSegDist2(qx, qy, ax, ay, bx, by),
    pointSegDist2(ax, ay, px, py, qx, qy),
    pointSegDist2(bx, by, px, py, qx, qy),
  );
}

export interface SweepHit {
  t: number;
  nx: number;
  ny: number;
}

/** Segment (x0,y0)→(x1,y1) against an axis-aligned box: entry fraction and face normal. */
export function sweepAabb(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): SweepHit | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let ny = 0;
  // X slab
  if (Math.abs(dx) < 1e-12) {
    if (x0 < rx || x0 > rx + rw) return null;
  } else {
    let t1 = (rx - x0) / dx;
    let t2 = (rx + rw - x0) / dx;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      ny = 0;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  // Y slab
  if (Math.abs(dy) < 1e-12) {
    if (y0 < ry || y0 > ry + rh) return null;
  } else {
    let t1 = (ry - y0) / dy;
    let t2 = (ry + rh - y0) / dy;
    let n = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      ny = n;
    }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (nx === 0 && ny === 0) return null; // started inside
  return { t: tmin, nx, ny };
}
