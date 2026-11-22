/**
 * View twists (pure): how the camera shows a stretch of a track. A pose is a function of the
 * spark's height only (and of the reduced-motion flag), so it is deterministic, stands still
 * while the game is paused and can be tested without a renderer. Nothing here feeds the sim:
 * RunSim, the solver and the human model never import this file.
 *
 * Coordinates: a sim point (x, y) seen from a spark at height ry has the normal-view offset
 * (dx, dy) = (x - SHAFT_W/2, -(y - ry)) from the pivot (the shaft's centre line at the spark's
 * height). A pose maps it to the screen as  A + M · (dx, dy)  with
 *   M = zoom · R(tilt) · F,  F = diag(1, flip)            (dive: flip goes 1 → -1)
 *                            F = I - (1 - fold) · n nT     (side: fold goes 1 → -1, n = (1,1)/√2)
 * The fold mirrors the view across the screen's anti-diagonal: flight "up" becomes "right" and
 * hold ("sim right") becomes "up", with no rotation on the way (a turn would be a fast spin).
 */
import { SHAFT_W } from './constants';
import { segmentAt, wallXAt, type Track, type Twist, type TwistKind } from './track';

/** Logical screen (portrait) and the spark's screen height in the normal view. */
export const VIEW_W = 720;
export const VIEW_H = 1280;
export const SPARK_Y = 930;
/** Bottom of the HUD band: world labels fade under it, hazards are still drawn (dimmed). */
export const HUD_BAND = 230;

/**
 * What the normal view shows ahead of the spark, in sim px along the flight: to the screen
 * edge, and to the HUD band. The tightest existing view in time is this at the fastest speed
 * the game reaches (endless at its cap under a FAST gate: 650 × 1.38 px/s).
 */
export const BASE_AHEAD = SPARK_Y;
export const BASE_CLEAR = SPARK_Y - HUD_BAND;
export const FASTEST_PX_S = 650 * 1.38;
export const MIN_AHEAD_S = BASE_AHEAD / FASTEST_PX_S;
export const MIN_CLEAR_S = BASE_CLEAR / FASTEST_PX_S;

/** Dive: the spark sits under the HUD and its banners and flies down the screen. */
export const DIVE_Y = 420;
export const DIVE_ZOOM = 0.92;
/** Side: the spark flies right from near the left edge; the shaft is a band across the screen. */
export const SIDE_X = 92;
export const SIDE_Y = 720;
export const SIDE_ZOOM = 0.67;
/** Roll never runs faster than about this (degrees per second). */
export const MAX_ROLL_DPS = 12;
/** Largest lean a twist may ask for (degrees). */
export const MAX_TILT = 12;
/** Reduced motion: a rocking twist becomes this share of its amplitude, held still. */
export const CALM_ROCK = 0.6;
/** Screen px kept between a leaning shaft and the screen edges. */
const LEAN_MARGIN = 8;
/** Width of the shaft that must stay on screen (walls never come closer than 26 px to x = 0). */
const SHAFT_SPAN = SHAFT_W - 2 * 26;

export interface Pose {
  /** 1 normal … -1 dive (the view is flipped top to bottom). */
  flip: number;
  /** 1 normal … -1 side (the view is mirrored across the anti-diagonal). */
  fold: number;
  /** Lean in degrees (+ = the far end leans right). */
  tilt: number;
  zoom: number;
  /** Screen position of the pivot (shaft centre line at the spark's height). */
  ax: number;
  ay: number;
}

export const NORMAL_POSE: Readonly<Pose> = { flip: 1, fold: 1, tilt: 0, zoom: 1, ax: SHAFT_W / 2, ay: SPARK_Y };

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const RAD = Math.PI / 180;

/** Zoom that keeps a shaft leaning by `deg` on screen for the whole base lookahead. */
export function tiltZoom(deg: number): number {
  const a = Math.abs(deg) * RAD;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Across: the leaning shaft fits the screen width. Along: its raised corner still shows the
  // base lookahead under the HUD band.
  const across = (VIEW_W - 2 * LEAN_MARGIN) / (SHAFT_SPAN * c + BASE_AHEAD * s);
  const along = BASE_CLEAR / (BASE_CLEAR * c + (SHAFT_SPAN / 2) * s);
  return Math.min(1, across, along);
}

/**
 * How much of twist t is on at height y (0..1). Eases are smoothsteps over `ease` px at each
 * end; under reduced motion the twist switches at the middle of each ease instead.
 */
export function twistWeight(t: Twist, y: number, calm = false): number {
  if (y < t.y0 || y > t.y1) return 0;
  if (t.ease <= 0) return 1;
  if (calm) return y >= t.y0 + t.ease / 2 && y <= t.y1 - t.ease / 2 ? 1 : 0;
  return Math.min(smooth((y - t.y0) / t.ease), smooth((t.y1 - y) / t.ease));
}

/** Linear part of a pose: screen offset = (a·dx + c·dy, b·dx + d·dy). */
export interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function poseMatrix(p: Pose, out: Mat = { a: 1, b: 0, c: 0, d: 1 }): Mat {
  let fa: number;
  let fb: number;
  let fc: number;
  let fd: number;
  if (p.fold < 1) {
    const h = (1 - p.fold) / 2;
    fa = 1 - h;
    fb = -h;
    fc = -h;
    fd = 1 - h;
  } else {
    fa = 1;
    fb = 0;
    fc = 0;
    fd = p.flip;
  }
  const cs = Math.cos(p.tilt * RAD) * p.zoom;
  const sn = Math.sin(p.tilt * RAD) * p.zoom;
  // R(tilt) = [[cos, -sin], [sin, cos]] (screen y points down: + is clockwise).
  out.a = cs * fa - sn * fb;
  out.b = sn * fa + cs * fb;
  out.c = cs * fc - sn * fd;
  out.d = sn * fc + cs * fd;
  return out;
}

const scratch: Mat = { a: 1, b: 0, c: 0, d: 1 };

/** The view at height y under a list of twists. `out` is reused when given (no allocation). */
export function poseAt(twists: readonly Twist[], y: number, calm = false, out: Pose = { ...NORMAL_POSE }): Pose {
  let dive = 0;
  let side = 0;
  let tilt = 0;
  let lean = 0;
  let zoom = 1;
  for (let i = 0; i < twists.length; i++) {
    const t = twists[i]!;
    if (y < t.y0 || y > t.y1) continue;
    const w = twistWeight(t, y, calm);
    if (w <= 0) continue;
    switch (t.kind) {
      case 'dive':
        if (w > dive) dive = w;
        break;
      case 'side':
        if (w > side) side = w;
        break;
      case 'tilt':
        tilt += w * t.amount;
        lean += w * Math.abs(t.amount);
        break;
      case 'rock':
        tilt += w * t.amount * (calm ? CALM_ROCK : Math.sin((2 * Math.PI * (y - t.y0)) / Math.max(1, t.period)));
        lean += w * Math.abs(t.amount);
        break;
      case 'far':
      case 'near':
        zoom *= lerp(1, t.amount, w);
        break;
    }
  }
  if (side > 0) dive = 0; // never both (levels are validated; this keeps the matrix defined)
  out.flip = 1 - 2 * dive;
  out.fold = 1 - 2 * side;
  out.tilt = tilt;
  // The fold zooms out ahead of itself: half way through, the far end of the shaft swings past
  // the screen's right edge unless the view is already small enough.
  out.zoom = zoom * lerp(1, DIVE_ZOOM, dive) * lerp(1, SIDE_ZOOM, Math.pow(side, 0.6)) * tiltZoom(lean);
  out.ax = lerp(SHAFT_W / 2, SIDE_X, side);
  out.ay = lerp(lerp(SPARK_Y, DIVE_Y, dive), SIDE_Y, side);
  if (tilt !== 0 && side === 0) {
    // Centre the leaning shaft: half of where the far end of the lookahead lands sideways.
    const m = poseMatrix(out, scratch);
    out.ax -= (m.c * -BASE_AHEAD) / 2;
  }
  return out;
}

export interface Pt {
  x: number;
  y: number;
}

/** Screen position of sim point (x, y) for a spark at height ry. */
export function project(p: Pose, m: Mat, x: number, y: number, ry: number, out: Pt): Pt {
  const dx = x - SHAFT_W / 2;
  const dy = ry - y;
  out.x = p.ax + m.a * dx + m.c * dy;
  out.y = p.ay + m.b * dx + m.d * dy;
  return out;
}

export interface Ahead {
  /** Sim px ahead of the spark for which both walls are on screen. */
  edge: number;
  /** ... and below the HUD band. */
  clear: number;
}

const pa: Pt = { x: 0, y: 0 };
const pb: Pt = { x: 0, y: 0 };
export const AHEAD_STEP = 8;
const AHEAD_CAP = 2400;

/**
 * Lookahead of a pose on a track: how far ahead of the spark (sim px along the flight) both
 * walls of the corridor are on screen, and how far they are also clear of the HUD band. The
 * normal view gives 928 and 696 on any track (BASE_AHEAD and BASE_CLEAR to the 8 px step).
 */
export function lookahead(track: Track, p: Pose, ry: number, out: Ahead = { edge: 0, clear: 0 }): Ahead {
  const m = poseMatrix(p, scratch);
  let edge = -1;
  let clear = -1;
  let clearOpen = true;
  const e = 1e-6;
  for (let d = 0; d <= AHEAD_CAP; d += AHEAD_STEP) {
    const y = ry + d;
    const i = segmentAt(track.wy, y);
    project(p, m, wallXAt(track.wy, track.lx, i, y), y, ry, pa);
    project(p, m, wallXAt(track.wy, track.rx, i, y), y, ry, pb);
    const on = pa.x >= -e && pa.x <= VIEW_W + e && pb.x >= -e && pb.x <= VIEW_W + e && pa.y >= -e && pa.y <= VIEW_H + e && pb.y >= -e && pb.y <= VIEW_H + e;
    if (!on) break;
    edge = d;
    if (clearOpen && pa.y >= HUD_BAND - e && pb.y >= HUD_BAND - e) clear = d;
    else clearOpen = false;
  }
  out.edge = Math.max(0, edge);
  out.clear = Math.max(0, clear);
  return out;
}

export interface ViewRange {
  /** Sim px behind and ahead of the spark that can be on screen. */
  below: number;
  above: number;
}

/** The stretch of the track a pose can show (for culling), clamped to what the pools hold. */
export function viewRange(p: Pose, out: ViewRange = { below: 380, above: 1000 }): ViewRange {
  const m = poseMatrix(p, scratch);
  const det = m.a * m.d - m.b * m.c;
  let lo = 0;
  let hi = 0;
  if (Math.abs(det) > 0.05) {
    for (let k = 0; k < 4; k++) {
      const sx = (k & 1 ? VIEW_W : 0) - p.ax;
      const sy = (k & 2 ? VIEW_H : 0) - p.ay;
      // Inverse of M: the normal-view offset whose image is this corner; ahead = -dy.
      const dy = (-m.b * sx + m.a * sy) / det;
      if (-dy > hi) hi = -dy;
      if (-dy < lo) lo = -dy;
    }
  } else {
    lo = -900;
    hi = 2300;
  }
  out.below = Math.min(900, Math.max(380, -lo + 30));
  out.above = Math.min(2300, Math.max(1000, hi + 70));
  return out;
}

/**
 * Px of climb a twist needs to ease in or out at scroll speed v (px/s). Flips and zooms take a
 * set distance; leans take as long as the roll limit asks for.
 */
export function easeFor(kind: TwistKind, amount: number, v: number): number {
  switch (kind) {
    case 'dive':
      return 520;
    case 'side':
      return 620;
    case 'far':
    case 'near':
      return 440;
    case 'tilt':
      // A smoothstep peaks at 1.5 times its mean rate.
      return Math.max(480, Math.ceil((1.5 * Math.abs(amount) * v) / (MAX_ROLL_DPS * 0.96)));
    case 'rock':
      // The envelope may add about 7°/s on top of the swing's own 5°/s (see rockPeriod).
      return Math.max(480, Math.ceil((1.5 * Math.abs(amount) * v) / 6.8));
  }
}

/** Px of climb per full swing of a rock twist: its own roll stays near 5°/s at speed v. */
export function rockPeriod(amount: number, v: number): number {
  return Math.ceil((2 * Math.PI * Math.abs(amount) * v) / 4.8);
}

/** Which way "hold" points on screen under a pose, as a unit vector (screen y down). */
export function holdVector(p: Pose, out: Pt = { x: 1, y: -1 }): Pt {
  const m = poseMatrix(p, scratch);
  // Held, the spark moves (+1, +1) in the sim: normal-view offset (1, -1).
  const x = m.a - m.c;
  const y = m.b - m.d;
  const len = Math.hypot(x, y) || 1;
  out.x = x / len;
  out.y = y / len;
  return out;
}

/** True while a pose shows text mirrored (the scene flips its world labels back). */
export function mirrored(p: Pose): boolean {
  return p.fold < 1 ? p.fold < 0 : p.flip < 0;
}

/** Roll of the view in degrees per second at height y, climbing at v px/s. */
export function rollRate(twists: readonly Twist[], y: number, v: number): number {
  const h = 1;
  return ((poseAt(twists, y + h).tilt - poseAt(twists, y - h).tilt) / (2 * h)) * v;
}

/**
 * A cue: the banner and the hold arrow for one change of view. One cue per chamber, whatever
 * happens in it (twists easing in, twists easing out, or one set easing out and the next easing
 * in straight after): it comes up CUE_LEAD px before the pose starts to move, so the player is
 * always told first, and it names what the view is going to (the incoming twists, or the normal
 * view). The scene shows these; the tests check them against the poses.
 */
export interface TwistCue {
  /** Height at which the banner and the arrow come up. */
  y: number;
  /** The twists being announced, flips first (out: the twists that are ending). */
  kinds: TwistKind[];
  /** The view is going back to normal: nothing eases in. */
  out: boolean;
  /** A dive or a side starts or ends here: the screen direction of hold changes. */
  turns: boolean;
  /** Where the pose starts to change, and where it has settled again. */
  from: number;
  end: number;
  /** Which way hold points on screen once the view has settled (unit vector, y down). */
  holdX: number;
  holdY: number;
}

/** Px of climb between a cue and the first change of the pose it announces. */
export const CUE_LEAD = 350;
/** Changes of view closer together than this belong to one chamber (one cue). */
const CUE_GAP = 400;

const flipFirst = (a: TwistKind, b: TwistKind): number => (a === 'dive' || a === 'side' ? 0 : 1) - (b === 'dive' || b === 'side' ? 0 : 1);

/** The cues of a track's twists, in order of height. */
export function twistCues(twists: readonly Twist[], calm = false): TwistCue[] {
  const moves: { a: number; b: number; kind: TwistKind; out: boolean }[] = [];
  for (const t of twists) {
    if (t.ease <= 0) continue;
    moves.push({ a: t.y0, b: t.y0 + t.ease, kind: t.kind, out: false });
    moves.push({ a: t.y1 - t.ease, b: t.y1, kind: t.kind, out: true });
  }
  moves.sort((p, q) => p.a - q.a);
  const cues: TwistCue[] = [];
  let i = 0;
  while (i < moves.length) {
    const from = moves[i]!.a;
    let end = moves[i]!.b;
    const ins: TwistKind[] = [];
    const outs: TwistKind[] = [];
    while (i < moves.length && moves[i]!.a <= end + CUE_GAP) {
      const m = moves[i++]!;
      end = Math.max(end, m.b);
      (m.out ? outs : ins).push(m.kind);
    }
    const out = ins.length === 0;
    const hold = holdVector(poseAt(twists, end + 2, calm));
    cues.push({
      y: from - CUE_LEAD,
      kinds: (out ? outs : ins).sort(flipFirst),
      out,
      turns: [...ins, ...outs].some((k) => k === 'dive' || k === 'side'),
      from,
      end,
      holdX: hold.x,
      holdY: hold.y,
    });
  }
  return cues;
}
