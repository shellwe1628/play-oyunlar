import { describe, expect, it } from 'vitest';
import { MAX_NOD, MAX_TILT, uprightView } from '../../../../apps/okcu-3d/src/view/archers/upright';
import { PT } from '../../src/sim/ragdoll';

/** a standing archer's 11 view points, then the torso bent back by `tilt` and the head by `nod` */
function arched(tilt: number, nod: number): { x: Float64Array; y: Float64Array } {
  const x = new Float64Array(11);
  const y = new Float64Array(11);
  const set = (i: number, px: number, py: number) => ((x[i] = px), (y[i] = py));
  set(PT.pelvis, 0, 0);
  set(PT.neck, -Math.sin(tilt) * 46, -Math.cos(tilt) * 46);
  const a = tilt + nod;
  set(PT.head, x[PT.neck]! - Math.sin(a) * 29, y[PT.neck]! - Math.cos(a) * 29);
  set(PT.elbowF, x[PT.neck]! + 23, y[PT.neck]!);
  set(PT.handF, x[PT.neck]! + 45, y[PT.neck]!);
  set(PT.elbowB, x[PT.neck]! + 10, y[PT.neck]! - 8);
  set(PT.handB, x[PT.neck]! + 20, y[PT.neck]!);
  set(PT.kneeF, 7, 26);
  set(PT.footF, 11, 52);
  set(PT.kneeB, -5, 26);
  set(PT.footB, -9, 52);
  return { x, y };
}

const tiltOf = (x: Float64Array, y: Float64Array) => Math.atan2(-(x[PT.neck]! - x[PT.pelvis]!), -(y[PT.neck]! - y[PT.pelvis]!));
const nodOf = (x: Float64Array, y: Float64Array) => {
  const tx = x[PT.neck]! - x[PT.pelvis]!;
  const ty = y[PT.neck]! - y[PT.pelvis]!;
  const hx = x[PT.head]! - x[PT.neck]!;
  const hy = y[PT.head]! - y[PT.neck]!;
  return Math.abs(Math.atan2(tx * hy - ty * hx, tx * hx + ty * hy));
};

describe('3D upright view clamp', () => {
  it('pulls a far-arched standing archer back to the tilt and nod limits, arms keep their aim', () => {
    const { x, y } = arched(1.1, 0.9);
    const arm = Math.atan2(y[PT.handF]! - y[PT.elbowF]!, x[PT.handF]! - x[PT.elbowF]!);
    uprightView(x, y, 1);
    expect(Math.abs(tiltOf(x, y))).toBeLessThanOrEqual(MAX_TILT + 1e-9);
    expect(nodOf(x, y)).toBeLessThanOrEqual(MAX_NOD + 1e-9);
    expect(Math.atan2(y[PT.handF]! - y[PT.elbowF]!, x[PT.handF]! - x[PT.elbowF]!)).toBeCloseTo(arm, 9);
    expect(Math.hypot(x[PT.neck]!, y[PT.neck]!)).toBeCloseTo(46, 9);
  });

  it('leaves a pose inside the limits, and any pose when not standing (k = 0), untouched', () => {
    const ok = arched(0.2, 0.1);
    const before = [...ok.x, ...ok.y];
    uprightView(ok.x, ok.y, 1);
    expect([...ok.x, ...ok.y]).toEqual(before);
    const limp = arched(1.3, 1);
    const limpBefore = [...limp.x, ...limp.y];
    uprightView(limp.x, limp.y, 0);
    expect([...limp.x, ...limp.y]).toEqual(limpBefore);
  });
});
