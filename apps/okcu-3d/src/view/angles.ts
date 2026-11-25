/**
 * Camera angles: the numbers behind the stage's selectable and cinematic views (stage.ts).
 *
 * The stage camera is a lens-shift camera: whatever the eye position, the gameplay plane z = 0
 * fills the frame exactly (`lensShift` below is that frustum). An angle is therefore only an eye
 * offset: the plane's mapping, the pointer and the DOM overlay do not notice it; everything with
 * depth (islands, archers, props) is seen from another side.
 *
 * Pure numbers, no three.js and no DOM, so the unit tests can load it
 * (games/okcu/tests/unit/camera-3d.test.ts).
 */

export type CameraAngle = 'side' | 'angled' | 'low';

/** the order the camera button cycles in */
export const ANGLE_IDS: readonly CameraAngle[] = ['side', 'angled', 'low'];

/** an eye offset from the Side eye, metres at the resting distance (it scales with the distance, so the direction holds through every zoom) */
export interface Eye {
  x: number;
  y: number;
}

/**
 * The angles (x: + right, y: + up; the player stands on the left).
 *   side    today's view: the eye over the frame centre, EYE_LIFT above it
 *   angled  a three-quarter look from the player's side and from higher up: the islands show
 *           their near flank and more of their top
 *   low     from below the frame centre and a little from the player's side: the islands show
 *           their undersides, the archers stand over the eye
 * Chosen by eye on every chapter theme (tools/acilar-shots.mjs); the limits are the islands'
 * depth (their flank must not read as ground to land on) and the far archers staying whole.
 */
export const ANGLES: Readonly<Record<CameraAngle, Eye>> = {
  side: { x: 0, y: 0 },
  angled: { x: -15, y: 3.5 },
  low: { x: -4, y: -10.5 },
};

/** seconds a switch between two angles glides for (reduced motion: a cut) */
export const ANGLE_GLIDE = 0.4;

/**
 * the cinematic swings, real seconds: as long as the stage's zoom on a boss's entrance (it eases
 * in, holds 1.35 s and glides back) and on a boss's knockout (it holds through the slow motion)
 */
export const CINE_ENTRANCE = 2.4;
export const CINE_KNOCKOUT = 1.6;

export function parseAngle(v: string | null | undefined): CameraAngle | null {
  return ANGLE_IDS.find((id) => id === v) ?? null;
}

export function nextAngle(a: CameraAngle): CameraAngle {
  return ANGLE_IDS[(ANGLE_IDS.indexOf(a) + 1) % ANGLE_IDS.length]!;
}

/** smoothstep, clamped */
export function smooth(k: number): number {
  const t = k < 0 ? 0 : k > 1 ? 1 : k;
  return t * t * (3 - 2 * t);
}

/** `a` to `b`, eased: k = 0 is `a`, k = 1 is `b` */
export function mixEye(a: Eye, b: Eye, k: number, out: Eye): Eye {
  const e = smooth(k);
  const x = a.x + (b.x - a.x) * e;
  const y = a.y + (b.y - a.y) * e;
  out.x = x;
  out.y = y;
  return out;
}

/**
 * A cinematic swing `t` seconds in (of `total`): from the player's angle `base` down to Low, a
 * slow rise from Low to Side while the zoom holds, then home to `base`. It starts and ends on
 * `base` exactly, so it never leaves the player on another angle than the chosen one.
 */
export function cineEye(t: number, total: number, base: Eye, out: Eye): Eye {
  if (!(total > 0) || t <= 0 || t >= total) return mixEye(base, base, 0, out);
  // down to Low and home again are eased moves of about half a second: a swing, never a jolt
  const tin = Math.min(0.5, total * 0.25);
  const tout = Math.min(0.6, total * 0.3);
  if (t < tin) return mixEye(base, ANGLES.low, t / tin, out);
  if (t < total - tout) return mixEye(ANGLES.low, ANGLES.side, (t - tin) / (total - tin - tout), out);
  return mixEye(ANGLES.side, base, (t - (total - tout)) / tout, out);
}

/** the frustum's window on the near plane (camera space) */
export interface Lens {
  l: number;
  r: number;
  t: number;
  b: number;
}

/**
 * The lens shift: the near-plane window of an eye at (ex, ey, d) that looks straight down −z and
 * is rolled by `roll` about its axis, such that the rectangle of the plane z = 0 centred on
 * (wx, wy), `hw` × `hh` half-sizes, fills the view exactly. The roll turns the view about the
 * window's centre, not about the eye.
 */
export function lensShift(wx: number, wy: number, hw: number, hh: number, ex: number, ey: number, d: number, roll: number, near: number, out: Lens): Lens {
  const k = near / d;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const lx = (wx - ex) * c + (wy - ey) * s;
  const ly = -(wx - ex) * s + (wy - ey) * c;
  out.l = (lx - hw) * k;
  out.r = (lx + hw) * k;
  out.t = (ly + hh) * k;
  out.b = (ly - hh) * k;
  return out;
}

/**
 * Where that eye and lens put a scene point, in normalised device coordinates (−1 … 1, y up).
 * The stage does this through three.js matrices; this is the same projection by hand, for tests.
 */
export function lensProject(px: number, py: number, pz: number, ex: number, ey: number, d: number, roll: number, near: number, lens: Lens): { x: number; y: number } {
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  const vx = px - ex;
  const vy = py - ey;
  const k = near / (d - pz);
  const xn = (vx * c + vy * s) * k;
  const yn = (-vx * s + vy * c) * k;
  return { x: ((xn - lens.l) / (lens.r - lens.l)) * 2 - 1, y: ((yn - lens.b) / (lens.t - lens.b)) * 2 - 1 };
}

/**
 * The slope that keeps something behind the plane looking as it does from the Side eye: shift it
 * by this much (x and y) per metre of z. The backdrop is authored for the Side eye with narrow
 * margins, so the stage shears it by this and it never shows an edge on any angle.
 */
export function backdropShear(eye: Eye, restDist: number, out: Eye): Eye {
  out.x = eye.x / restDist;
  out.y = eye.y / restDist;
  return out;
}
