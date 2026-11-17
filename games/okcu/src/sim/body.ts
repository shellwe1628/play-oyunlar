/**
 * Verlet point-mass bodies: positions + previous positions, distance constraints ("sticks"),
 * min/max distance limits across a joint (angle limits for fixed segment lengths), soft "muscles"
 * that pull each point toward a pose target, hard pins, and circle-vs-box ledge collision.
 * Pure and allocation-free in the step.
 */

export interface Ledge {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Body {
  n: number;
  x: Float64Array;
  y: Float64Array;
  px: Float64Array;
  py: Float64Array;
  /** collision radius per point */
  r: Float64Array;
  /** pose targets */
  tx: Float64Array;
  ty: Float64Array;
  /** muscle stiffness per point (fraction of the error removed per tick at muscle = 1) */
  kp: Float64Array;
  /** 1 = hard pinned to its target */
  pin: Uint8Array;
  sa: Int32Array;
  sb: Int32Array;
  rest: Float64Array;
  la: Int32Array;
  lc: Int32Array;
  lmin: Float64Array;
  lmax: Float64Array;
  /** global muscle multiplier 0..1 (0 = limp ragdoll) */
  muscle: number;
  /** velocity damping for muscles (0..1) */
  kd: number;
  /** velocity kept per tick (air drag) */
  damping: number;
  gravity: number;
  friction: number;
  bounce: number;
  iterations: number;
}

export interface BodySpec {
  points: readonly { x: number; y: number; r: number; kp: number }[];
  sticks: readonly (readonly [number, number])[];
  limits: readonly (readonly [number, number, number, number])[];
}

export const BODY_DEFAULTS = {
  kd: 0.35,
  damping: 0.996,
  gravity: 1900,
  friction: 0.35,
  bounce: 0.25,
  iterations: 6,
} as const;

export function createBody(spec: BodySpec): Body {
  const n = spec.points.length;
  const b: Body = {
    n,
    x: new Float64Array(n),
    y: new Float64Array(n),
    px: new Float64Array(n),
    py: new Float64Array(n),
    r: new Float64Array(n),
    tx: new Float64Array(n),
    ty: new Float64Array(n),
    kp: new Float64Array(n),
    pin: new Uint8Array(n),
    sa: new Int32Array(spec.sticks.length),
    sb: new Int32Array(spec.sticks.length),
    rest: new Float64Array(spec.sticks.length),
    la: new Int32Array(spec.limits.length),
    lc: new Int32Array(spec.limits.length),
    lmin: new Float64Array(spec.limits.length),
    lmax: new Float64Array(spec.limits.length),
    muscle: 1,
    ...BODY_DEFAULTS,
  };
  spec.points.forEach((p, i) => {
    b.x[i] = b.px[i] = b.tx[i] = p.x;
    b.y[i] = b.py[i] = b.ty[i] = p.y;
    b.r[i] = p.r;
    b.kp[i] = p.kp;
  });
  spec.sticks.forEach(([a, c], i) => {
    b.sa[i] = a;
    b.sb[i] = c;
    b.rest[i] = Math.hypot(spec.points[a]!.x - spec.points[c]!.x, spec.points[a]!.y - spec.points[c]!.y);
  });
  spec.limits.forEach(([a, c, lo, hi], i) => {
    b.la[i] = a;
    b.lc[i] = c;
    b.lmin[i] = lo;
    b.lmax[i] = hi;
  });
  return b;
}

/** Move the whole body by (dx, dy) without adding velocity. */
export function translateBody(b: Body, dx: number, dy: number): void {
  for (let i = 0; i < b.n; i++) {
    b.x[i] = b.x[i]! + dx;
    b.y[i] = b.y[i]! + dy;
    b.px[i] = b.px[i]! + dx;
    b.py[i] = b.py[i]! + dy;
  }
}

/** Add a velocity change (px/s) to one point. */
export function addVelocity(b: Body, i: number, vx: number, vy: number, dt: number): void {
  b.px[i] = b.px[i]! - vx * dt;
  b.py[i] = b.py[i]! - vy * dt;
}

/** Velocity (px/s) of one point. */
export function velX(b: Body, i: number, dt: number): number {
  return (b.x[i]! - b.px[i]!) / dt;
}
export function velY(b: Body, i: number, dt: number): number {
  return (b.y[i]! - b.py[i]!) / dt;
}

/** Hard cap on per-tick displacement: a safety net, far above anything the game produces. */
const MAX_STEP = 60;

function solveDistance(b: Body, a: number, c: number, lo: number, hi: number): void {
  const dx = b.x[c]! - b.x[a]!;
  const dy = b.y[c]! - b.y[a]!;
  const d = Math.sqrt(dx * dx + dy * dy);
  let target: number;
  if (d < lo) target = lo;
  else if (d > hi) target = hi;
  else return;
  const wa = b.pin[a] ? 0 : 1;
  const wc = b.pin[c] ? 0 : 1;
  const w = wa + wc;
  if (w === 0) return;
  let nx: number;
  let ny: number;
  if (d < 1e-9) {
    nx = 0;
    ny = 1;
  } else {
    nx = dx / d;
    ny = dy / d;
  }
  const corr = (d - target) / w;
  b.x[a] = b.x[a]! + nx * corr * wa;
  b.y[a] = b.y[a]! + ny * corr * wa;
  b.x[c] = b.x[c]! - nx * corr * wc;
  b.y[c] = b.y[c]! - ny * corr * wc;
}

/** Push point i out of a box; returns the contact normal y (-1 = standing on top) or 0. */
function collidePoint(b: Body, i: number, L: Ledge, friction: boolean): void {
  if (b.pin[i]) return;
  const r = b.r[i]!;
  const x = b.x[i]!;
  const y = b.y[i]!;
  if (x < L.x - r || x > L.x + L.w + r || y < L.y - r || y > L.y + L.h + r) return;
  const cx = x < L.x ? L.x : x > L.x + L.w ? L.x + L.w : x;
  const cy = y < L.y ? L.y : y > L.y + L.h ? L.y + L.h : y;
  let nx = x - cx;
  let ny = y - cy;
  const d2 = nx * nx + ny * ny;
  let pen: number;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return;
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    pen = r - d;
  } else {
    // centre inside the box: leave by the nearest face
    const left = x - L.x;
    const right = L.x + L.w - x;
    const top = y - L.y;
    const bottom = L.y + L.h - y;
    const m = Math.min(left, right, top, bottom);
    nx = 0;
    ny = 0;
    if (m === top) ny = -1;
    else if (m === bottom) ny = 1;
    else if (m === left) nx = -1;
    else nx = 1;
    pen = m + r;
  }
  b.x[i] = x + nx * pen;
  b.y[i] = y + ny * pen;
  if (friction) {
    // velocity split into normal and tangential parts: bounce the normal, rub the tangent
    const vx = b.x[i] - b.px[i]!;
    const vy = b.y[i] - b.py[i]!;
    const vn = vx * nx + vy * ny;
    if (vn < 0) {
      const tvx = vx - vn * nx;
      const tvy = vy - vn * ny;
      const k = 1 - b.friction;
      const nvx = tvx * k - vn * nx * b.bounce;
      const nvy = tvy * k - vn * ny * b.bounce;
      b.px[i] = b.x[i] - nvx;
      b.py[i] = b.y[i] - nvy;
    }
  }
}

/** One fixed tick. */
export function stepBody(b: Body, dt: number, ledges: readonly Ledge[]): void {
  const g = b.gravity * dt * dt;
  const m = b.muscle;
  for (let i = 0; i < b.n; i++) {
    if (b.pin[i]) {
      b.px[i] = b.x[i]!;
      b.py[i] = b.y[i]!;
      b.x[i] = b.tx[i]!;
      b.y[i] = b.ty[i]!;
      continue;
    }
    let vx = (b.x[i]! - b.px[i]!) * b.damping;
    let vy = (b.y[i]! - b.py[i]!) * b.damping;
    const k = b.kp[i]! * m;
    if (k > 0) {
      const kd = b.kd * m;
      vx += ((b.tx[i]! - b.x[i]!) * k - vx) * kd;
      vy += ((b.ty[i]! - b.y[i]!) * k - vy) * kd;
    }
    if (vx > MAX_STEP) vx = MAX_STEP;
    else if (vx < -MAX_STEP) vx = -MAX_STEP;
    if (vy > MAX_STEP) vy = MAX_STEP;
    else if (vy < -MAX_STEP) vy = -MAX_STEP;
    b.px[i] = b.x[i]!;
    b.py[i] = b.y[i]!;
    b.x[i] = b.x[i]! + vx;
    b.y[i] = b.y[i]! + vy + g * (1 - Math.min(1, k * 4));
  }
  const nl = ledges.length;
  for (let it = 0; it < b.iterations; it++) {
    for (let s = 0; s < b.sa.length; s++) {
      const rest = b.rest[s]!;
      solveDistance(b, b.sa[s]!, b.sb[s]!, rest, rest);
    }
    for (let s = 0; s < b.la.length; s++) solveDistance(b, b.la[s]!, b.lc[s]!, b.lmin[s]!, b.lmax[s]!);
    for (let l = 0; l < nl; l++) {
      const L = ledges[l]!;
      for (let i = 0; i < b.n; i++) collidePoint(b, i, L, it === b.iterations - 1);
    }
  }
}

/** Kinetic energy (unit masses), px²/s². */
export function kineticEnergy(b: Body, dt: number): number {
  let e = 0;
  for (let i = 0; i < b.n; i++) {
    const vx = (b.x[i]! - b.px[i]!) / dt;
    const vy = (b.y[i]! - b.py[i]!) / dt;
    e += 0.5 * (vx * vx + vy * vy);
  }
  return e;
}

/** Largest relative stick length error (0.05 = 5 %). */
export function maxStickError(b: Body): number {
  let worst = 0;
  for (let s = 0; s < b.sa.length; s++) {
    const a = b.sa[s]!;
    const c = b.sb[s]!;
    const d = Math.hypot(b.x[c]! - b.x[a]!, b.y[c]! - b.y[a]!);
    worst = Math.max(worst, Math.abs(d - b.rest[s]!) / b.rest[s]!);
  }
  return worst;
}
