/**
 * Drawing only: keeps a standing archer's drawn body readable. The noodle ragdoll may arch far
 * back (a shove, a steep shot, the draw lean all adding up) and the skinned model then folds its
 * head behind its back. The simulation keeps its points; only the view points are eased back
 * toward an upright torso and a head that stays over the shoulders.
 */
import { PT } from '@sim/ragdoll';

/** most the torso (pelvis → neck) may tilt from vertical while standing (≈ 26°) */
export const MAX_TILT = 0.45;
/** most the head may bend off the torso's line (≈ 29°) */
export const MAX_NOD = 0.5;

const ARMS = [PT.elbowF, PT.handF, PT.elbowB, PT.handB] as const;

const clampAngle = (a: number, max: number): number => Math.max(-max, Math.min(max, a));

/**
 * Ease the view points toward the limits by `k` (0 = untouched, 1 = fully clamped; the standing
 * blend, so a fall or a knockout stays limp). The arms move with the neck without turning, so
 * the bow keeps its aim.
 */
export function uprightView(vx: Float64Array, vy: Float64Array, k: number): void {
  if (k <= 0) return;
  const px = vx[PT.pelvis]!;
  const py = vy[PT.pelvis]!;
  // torso: angle from straight up (0 = upright)
  let tx = vx[PT.neck]! - px;
  let ty = vy[PT.neck]! - py;
  const len = Math.hypot(tx, ty);
  if (len > 1e-6) {
    const tilt = Math.atan2(tx, -ty);
    const fix = (clampAngle(tilt, MAX_TILT) - tilt) * k;
    if (fix !== 0) {
      const c = Math.cos(fix);
      const s = Math.sin(fix);
      const ox = vx[PT.neck]!;
      const oy = vy[PT.neck]!;
      const nx = px + tx * c - ty * s;
      const ny = py + tx * s + ty * c;
      const dx = nx - ox;
      const dy = ny - oy;
      // the head turns with the torso, the arms only follow the shoulder
      const hx = vx[PT.head]! - ox;
      const hy = vy[PT.head]! - oy;
      vx[PT.head] = nx + hx * c - hy * s;
      vy[PT.head] = ny + hx * s + hy * c;
      vx[PT.neck] = nx;
      vy[PT.neck] = ny;
      for (const i of ARMS) {
        vx[i] = vx[i]! + dx;
        vy[i] = vy[i]! + dy;
      }
      tx = nx - px;
      ty = ny - py;
    }
    // head: its bend off the torso's line
    const hx = vx[PT.head]! - vx[PT.neck]!;
    const hy = vy[PT.head]! - vy[PT.neck]!;
    const bend = Math.atan2(tx * hy - ty * hx, tx * hx + ty * hy);
    const nod = (clampAngle(bend, MAX_NOD) - bend) * k;
    if (nod !== 0) {
      const c = Math.cos(nod);
      const s = Math.sin(nod);
      vx[PT.head] = vx[PT.neck]! + hx * c - hy * s;
      vy[PT.head] = vy[PT.neck]! + hx * s + hy * c;
    }
  }
}
