/**
 * The 3D build's camera angles (apps/okcu-3d/src/view/angles.ts): the numbers the stage's
 * lens-shift camera is built from. The hard requirement is that an angle is view only: a point
 * of the gameplay plane z = 0 lands on the same spot of the screen whatever the eye does.
 */
import { describe, expect, it } from 'vitest';
import {
  ANGLE_IDS,
  ANGLES,
  backdropShear,
  CINE_ENTRANCE,
  CINE_KNOCKOUT,
  cineEye,
  lensProject,
  lensShift,
  mixEye,
  nextAngle,
  parseAngle,
  type Eye,
  type Lens,
} from '../../../../apps/okcu-3d/src/view/angles';

const NEAR = 2;
/** the stage's resting distance for its 22° view of a 16 m tall frame, and the Side eye's lift */
const REST = 8 / Math.tan((11 * Math.PI) / 180);
const LIFT = 4.2;
const HW = 4.5;
const HH = 8;

/** the stage's frameCamera in numbers: window centre (wx, wy), zoom z, eye offset `eye`, sway and roll */
function view(wx: number, wy: number, z: number, eye: Eye, roll = 0, swayX = 0, swayY = 0) {
  const d = REST / z;
  const ex = wx + swayX + eye.x / z;
  const ey = wy + LIFT + swayY + eye.y / z;
  const lens = lensShift(wx, wy, HW / z, HH / z, ex, ey, d, roll, NEAR, { l: 0, r: 0, t: 0, b: 0 });
  return { ex, ey, d, roll, lens };
}
const project = (v: { ex: number; ey: number; d: number; roll: number; lens: Lens }, x: number, y: number, z: number) => lensProject(x, y, z, v.ex, v.ey, v.d, v.roll, NEAR, v.lens);

describe('camera angles', () => {
  it('side is the eye the game always had; angled looks from the player\'s side and above, low from below', () => {
    expect(ANGLES.side).toEqual({ x: 0, y: 0 });
    expect(ANGLES.angled.x).toBeLessThan(-8);
    expect(ANGLES.angled.y).toBeGreaterThan(0);
    // below the frame centre: under the Side eye by more than its lift
    expect(ANGLES.low.y).toBeLessThan(-LIFT);
  });

  it('the button cycles through all three and back', () => {
    expect(ANGLE_IDS).toEqual(['side', 'angled', 'low']);
    expect(nextAngle('side')).toBe('angled');
    expect(nextAngle('angled')).toBe('low');
    expect(nextAngle('low')).toBe('side');
  });

  it('reads an angle from a URL or stored value, and nothing else', () => {
    expect(parseAngle('low')).toBe('low');
    expect(parseAngle('angled')).toBe('angled');
    expect(parseAngle('top')).toBeNull();
    expect(parseAngle('')).toBeNull();
    expect(parseAngle(null)).toBeNull();
  });

  it('a glide starts on one angle, ends on the other and never overshoots', () => {
    const out = { x: 0, y: 0 };
    expect(mixEye(ANGLES.side, ANGLES.angled, 0, out)).toEqual(ANGLES.side);
    expect(mixEye(ANGLES.side, ANGLES.angled, 1, out)).toEqual(ANGLES.angled);
    expect(mixEye(ANGLES.side, ANGLES.angled, 7, out)).toEqual(ANGLES.angled);
    let last = 0;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      const e = mixEye(ANGLES.side, ANGLES.angled, k, out);
      expect(e.x).toBeLessThanOrEqual(last + 1e-12);
      expect(e.x).toBeGreaterThanOrEqual(ANGLES.angled.x - 1e-12);
      last = e.x;
    }
    // the output may be one of the inputs
    const from = { x: 3, y: -2 };
    mixEye(from, ANGLES.low, 0.5, from);
    expect(from.x).toBeCloseTo((3 + ANGLES.low.x) / 2, 9);
    expect(from.y).toBeCloseTo((-2 + ANGLES.low.y) / 2, 9);
  });
});

describe('the lens shift', () => {
  const corners: [number, number][] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [0, 0],
    [0.37, -0.81],
  ];

  it('the plane z = 0 fills the frame exactly on every angle, at every zoom and window', () => {
    for (const id of ANGLE_IDS) {
      for (const [wx, wy, z] of [
        [0, 0, 1],
        [1.35, 2.4, 1 / 1.3],
        [-2, 3, 1.74],
      ] as const) {
        const v = view(wx, wy, z, ANGLES[id], 0, 0.6, -0.16);
        for (const [cx, cy] of corners) {
          const p = project(v, wx + (cx * HW) / z, wy + (cy * HH) / z, 0);
          expect(p.x).toBeCloseTo(cx, 9);
          expect(p.y).toBeCloseTo(cy, 9);
        }
      }
    }
  });

  it('a plane point does not move on screen while the eye glides or swings, shake roll included', () => {
    const eye = { x: 0, y: 0 };
    const at = (e: Eye) => project(view(0.4, -1.1, 1.26, e, 0.02), 2.2, 3.3, 0);
    const home = at(ANGLES.side);
    for (let k = 0; k <= 1; k += 0.125) {
      const g = at(mixEye(ANGLES.angled, ANGLES.low, k, eye));
      expect(g.x).toBeCloseTo(home.x, 9);
      expect(g.y).toBeCloseTo(home.y, 9);
    }
    for (let t = 0; t <= CINE_ENTRANCE; t += 0.1) {
      const c = at(cineEye(t, CINE_ENTRANCE, ANGLES.angled, eye));
      expect(c.x).toBeCloseTo(home.x, 9);
      expect(c.y).toBeCloseTo(home.y, 9);
    }
  });

  it('depth is what an angle shows: a point in front of the plane shifts away from the eye', () => {
    const side = project(view(0, 0, 1, ANGLES.side), 2, 1, 0.75);
    const angled = project(view(0, 0, 1, ANGLES.angled), 2, 1, 0.75);
    const low = project(view(0, 0, 1, ANGLES.low), 2, 1, 0.75);
    // eye to the left and higher: the near face moves right and down
    expect(angled.x).toBeGreaterThan(side.x);
    expect(angled.y).toBeLessThan(side.y);
    // eye below: the near face moves up
    expect(low.y).toBeGreaterThan(side.y);
  });

  it('the sheared backdrop looks exactly as it does from the Side eye, at every depth and zoom', () => {
    const k = { x: 0, y: 0 };
    for (const id of ANGLE_IDS) {
      backdropShear(ANGLES[id], REST, k);
      for (const z of [1, 1 / 1.3, 1.5]) {
        for (const depth of [30, 80, 190, 430]) {
          const q = { x: -37 + depth * 0.1, y: 12 - depth * 0.02 };
          const side = project(view(1, 2, z, ANGLES.side, 0, 0.3, 0.1), q.x, q.y, -depth);
          const now = project(view(1, 2, z, ANGLES[id], 0, 0.3, 0.1), q.x + k.x * -depth, q.y + k.y * -depth, -depth);
          expect(now.x).toBeCloseTo(side.x, 9);
          expect(now.y).toBeCloseTo(side.y, 9);
        }
      }
    }
  });
});

describe('the cinematic swing', () => {
  const out = { x: 0, y: 0 };

  it('starts and ends on the player\'s angle, whichever it is', () => {
    for (const id of ANGLE_IDS) {
      for (const total of [CINE_ENTRANCE, CINE_KNOCKOUT]) {
        expect(cineEye(0, total, ANGLES[id], out)).toEqual(ANGLES[id]);
        expect(cineEye(total, total, ANGLES[id], out)).toEqual(ANGLES[id]);
        expect(cineEye(total + 1, total, ANGLES[id], out)).toEqual(ANGLES[id]);
      }
    }
  });

  it('goes down to Low, rises to Side, then home', () => {
    const total = CINE_ENTRANCE;
    const tin = Math.min(0.5, total * 0.25);
    const tout = Math.min(0.6, total * 0.3);
    expect(cineEye(tin, total, ANGLES.angled, out)).toEqual(ANGLES.low);
    const side = cineEye(total - tout, total, ANGLES.angled, out);
    expect(side.x).toBeCloseTo(0, 9);
    expect(side.y).toBeCloseTo(0, 9);
    // the rise never dips back
    let last = ANGLES.low.y;
    for (let t = tin; t <= total - tout; t += 0.05) {
      const e = cineEye(t, total, ANGLES.angled, out);
      expect(e.y).toBeGreaterThanOrEqual(last - 1e-12);
      last = e.y;
    }
  });

  it('is continuous: no frame jumps the eye (60 fps steps stay small)', () => {
    for (const id of ANGLE_IDS) {
      for (const total of [CINE_ENTRANCE, CINE_KNOCKOUT]) {
        const prev = { ...ANGLES[id] };
        for (let t = 0; t <= total + 0.02; t += 1 / 60) {
          const e = cineEye(t, total, ANGLES[id], out);
          expect(Math.hypot(e.x - prev.x, e.y - prev.y)).toBeLessThan(1.4);
          prev.x = e.x;
          prev.y = e.y;
        }
      }
    }
  });
});
