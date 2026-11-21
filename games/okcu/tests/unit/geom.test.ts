import { describe, expect, it } from 'vitest';
import { ballisticAt, pointSegDist2, segSegDist2, solveLaunchAngle, sweepAabb } from '../../src/sim/geom';

describe('ballistics', () => {
  it('closed-form position matches the arc', () => {
    const p = ballisticAt(10, 20, 300, -400, 1500, 0.5);
    expect(p.x).toBeCloseTo(160, 6);
    expect(p.y).toBeCloseTo(20 - 200 + 0.5 * 1500 * 0.25, 6);
  });

  it('solves a launch angle that hits the target (both directions)', () => {
    for (const [dx, dy] of [
      [400, 0],
      [500, -300],
      [300, 200],
      [-450, 150],
      [-300, -250],
    ] as const) {
      const v = 1300;
      const g = 1500;
      const a = solveLaunchAngle(dx, dy, v, g, false);
      expect(a).not.toBeNull();
      const ang = a as number;
      const vx = Math.cos(ang) * v;
      const vy = Math.sin(ang) * v;
      const t = dx / vx;
      expect(t).toBeGreaterThan(0);
      const y = vy * t + 0.5 * g * t * t;
      expect(y).toBeCloseTo(dy, 3);
    }
  });

  it('returns null when the target is out of range', () => {
    expect(solveLaunchAngle(5000, 0, 300, 1500, false)).toBeNull();
  });
});

describe('distances', () => {
  it('point to segment', () => {
    expect(pointSegDist2(0, 5, -10, 0, 10, 0)).toBeCloseTo(25);
    expect(pointSegDist2(13, 4, -10, 0, 10, 0)).toBeCloseTo(9 + 16);
  });
  it('segment to segment (crossing = 0, parallel, apart)', () => {
    expect(segSegDist2(-5, 0, 5, 0, 0, -5, 0, 5)).toBeCloseTo(0);
    expect(segSegDist2(0, 0, 10, 0, 0, 3, 10, 3)).toBeCloseTo(9);
    expect(segSegDist2(0, 0, 1, 0, 4, 4, 4, 8)).toBeCloseTo(9 + 16);
  });
  it('sweep against a box gives the entry fraction and normal', () => {
    const hit = sweepAabb(0, 50, 200, 50, 100, 0, 50, 100);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(0.5);
    expect(hit?.nx).toBe(-1);
    const top = sweepAabb(120, 0, 120, 200, 100, 40, 50, 100);
    expect(top?.ny).toBe(-1);
    expect(sweepAabb(0, 0, 50, 0, 100, 0, 50, 100)).toBeNull();
  });
});
