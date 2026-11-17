/**
 * The noodle archer: an 11-point Verlet humanoid with a part map for hit tests, plus the pose
 * function its muscles chase (stand, aim, draw the string). Pure.
 */
import { createBody, type Body, type BodySpec } from './body';

/** Point indices. F = front (bow) side, B = back (string) side. */
export const PT = {
  head: 0,
  neck: 1,
  pelvis: 2,
  elbowF: 3,
  handF: 4,
  elbowB: 5,
  handB: 6,
  kneeF: 7,
  footF: 8,
  kneeB: 9,
  footB: 10,
} as const;

export type PartKind = 'head' | 'body' | 'arm' | 'leg' | 'weak';

export interface Part {
  a: number;
  b: number;
  /** radius at scale 1 */
  r: number;
  kind: PartKind;
  /** spot parts: a point at fraction u along a→b instead of a capsule */
  u?: number;
}

/** Hit-test capsules, checked in this order (head first so it wins ties with the torso). */
export const PARTS: readonly Part[] = [
  { a: PT.head, b: PT.head, r: 26, kind: 'head' },
  { a: PT.neck, b: PT.pelvis, r: 17, kind: 'body' },
  { a: PT.neck, b: PT.elbowF, r: 7, kind: 'arm' },
  { a: PT.elbowF, b: PT.handF, r: 7, kind: 'arm' },
  { a: PT.neck, b: PT.elbowB, r: 7, kind: 'arm' },
  { a: PT.elbowB, b: PT.handB, r: 7, kind: 'arm' },
  { a: PT.pelvis, b: PT.kneeF, r: 8, kind: 'leg' },
  { a: PT.kneeF, b: PT.footF, r: 8, kind: 'leg' },
  { a: PT.pelvis, b: PT.kneeB, r: 8, kind: 'leg' },
  { a: PT.kneeB, b: PT.footB, r: 8, kind: 'leg' },
];

/** The boss is plated everywhere; its bare, glowing-eyed head is the weak spot. */
export const BOSS_PARTS: readonly Part[] = PARTS.map((p) => (p.kind === 'head' ? { ...p, kind: 'weak' as const } : p));

/** Segment lengths at scale 1. */
export const BONES = {
  neckHead: 29,
  spine: 46,
  upperArm: 24,
  foreArm: 23,
  thigh: 27,
  shin: 27,
} as const;

/** Vertical distance from pelvis to the soles at rest (scale 1). */
export const LEG_HEIGHT = 52;

function restPoints(x: number, y: number, f: number, s: number): BodySpec['points'] {
  const p = (dx: number, dy: number, r: number, kp: number) => ({ x: x + dx * f * s, y: y + dy * s, r: r * s, kp });
  return [
    p(0, -75, 25, 0.22), // head
    p(0, -46, 6, 0.3), // neck
    p(0, 0, 7, 0.32), // pelvis
    p(10, -24, 5, 0.26), // elbowF
    p(14, -2, 5, 0.26), // handF
    p(-8, -24, 5, 0.26), // elbowB
    p(-10, -2, 5, 0.26), // handB
    p(7, 26, 5, 0.3), // kneeF
    p(11, 52, 5, 0.4), // footF
    p(-5, 26, 5, 0.3), // kneeB
    p(-9, 52, 5, 0.4), // footB
  ];
}

export function ragdollSpec(x: number, y: number, facing: number, scale: number): BodySpec {
  const s = scale;
  return {
    points: restPoints(x, y, facing, s),
    sticks: [
      [PT.head, PT.neck],
      [PT.neck, PT.pelvis],
      [PT.neck, PT.elbowF],
      [PT.elbowF, PT.handF],
      [PT.neck, PT.elbowB],
      [PT.elbowB, PT.handB],
      [PT.pelvis, PT.kneeF],
      [PT.kneeF, PT.footF],
      [PT.pelvis, PT.kneeB],
      [PT.kneeB, PT.footB],
    ],
    limits: [
      // [a, c, min, max]: distance across a joint = an angle limit for fixed segment lengths
      [PT.head, PT.pelvis, 63 * s, 76 * s], // neck bends ~±55°, never folds into the chest
      [PT.neck, PT.handF, 12 * s, 99 * s], // elbow
      [PT.neck, PT.handB, 8 * s, 99 * s],
      [PT.pelvis, PT.footF, 24 * s, 99 * s], // knee
      [PT.pelvis, PT.footB, 24 * s, 99 * s],
      [PT.elbowF, PT.pelvis, 14 * s, 99 * s], // arm can't pass through the belly
      [PT.elbowB, PT.pelvis, 14 * s, 99 * s],
      [PT.kneeF, PT.neck, 40 * s, 99 * s], // hip can't fold flat
      [PT.kneeB, PT.neck, 40 * s, 99 * s],
      [PT.head, PT.kneeF, 30 * s, 999], // keeps the head out of the knees in a heap
      [PT.head, PT.kneeB, 30 * s, 999],
    ],
  };
}

/** Rest lengths are set from explicit bone lengths so every archer has identical proportions. */
function fixRestLengths(b: Body, s: number): void {
  const L = [BONES.neckHead, BONES.spine, BONES.upperArm, BONES.foreArm, BONES.upperArm, BONES.foreArm, BONES.thigh, BONES.shin, BONES.thigh, BONES.shin];
  L.forEach((len, i) => (b.rest[i] = len * s));
}

export function createRagdoll(x: number, pelvisY: number, facing: number, scale: number): Body {
  const b = createBody(ragdollSpec(x, pelvisY, facing, scale));
  fixRestLengths(b, scale);
  b.pin[PT.footF] = 1;
  b.pin[PT.footB] = 1;
  return b;
}

/**
 * Pose targets for a standing archer whose pelvis rests at (ax, ay), facing ±1, aiming along
 * world angle `aim`, string drawn 0..1. `crouch` 0..1 bends the knees (landing, hops). `bob` is
 * a small idle sway offset in px.
 */
export function setPose(b: Body, ax: number, ay: number, facing: number, aim: number, draw: number, scale: number, crouch: number, bob = 0): void {
  const s = scale;
  const f = facing;
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);
  const c = crouch * 14 * s;
  const py = ay + c + bob;
  // pelvis and spine lean a little into the shot
  b.tx[PT.pelvis] = ax;
  b.ty[PT.pelvis] = py;
  const nx = ax + dx * 4 * s - f * draw * 3 * s;
  const ny = py - 45 * s + Math.abs(dy) * 2 * s;
  b.tx[PT.neck] = nx;
  b.ty[PT.neck] = ny;
  b.tx[PT.head] = nx + dx * 4 * s - f * draw * 3 * s;
  b.ty[PT.head] = ny - 29 * s;
  // bow arm straight along the aim
  const sx = nx;
  const sy = ny + 3 * s;
  b.tx[PT.elbowF] = sx + dx * 23 * s;
  b.ty[PT.elbowF] = sy + dy * 23 * s;
  b.tx[PT.handF] = sx + dx * 45 * s;
  b.ty[PT.handF] = sy + dy * 45 * s;
  // string arm: hand pulled back from the bow hand by the draw, elbow out and up
  const back = (14 + 32 * draw) * s;
  const hx = sx + dx * 45 * s - dx * back;
  const hy = sy + dy * 45 * s - dy * back;
  b.tx[PT.handB] = hx;
  b.ty[PT.handB] = hy;
  let ux = dy;
  let uy = -dx;
  if (uy > 0) {
    ux = -ux;
    uy = -uy;
  }
  b.tx[PT.elbowB] = (sx + hx) / 2 - dx * 12 * draw * s + ux * 12 * s;
  b.ty[PT.elbowB] = (sy + hy) / 2 - dy * 12 * draw * s + uy * 12 * s;
  // legs: soles stay at the ledge; knees push forward when crouching
  const feetY = ay + LEG_HEIGHT * s;
  b.tx[PT.footF] = ax + f * 11 * s;
  b.ty[PT.footF] = feetY;
  b.tx[PT.footB] = ax - f * 9 * s;
  b.ty[PT.footB] = feetY;
  b.tx[PT.kneeF] = ax + f * (7 + crouch * 10) * s;
  b.ty[PT.kneeF] = py + 26 * s - c * 0.5;
  b.tx[PT.kneeB] = ax - f * (5 - crouch * 6) * s;
  b.ty[PT.kneeB] = py + 26 * s - c * 0.5;
}

/** Where the bow hand (and so the arrow) is for an archer posed at (ax, ay) aiming along `aim`. */
export function bowOrigin(ax: number, ay: number, aim: number, scale: number): { x: number; y: number } {
  const dx = Math.cos(aim);
  const dy = Math.sin(aim);
  const s = scale;
  const nx = ax + dx * 4 * s;
  const ny = ay - 45 * s + Math.abs(dy) * 2 * s;
  return { x: nx + dx * 52 * s, y: ny + 3 * s + dy * 52 * s };
}
