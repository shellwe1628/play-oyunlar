import { describe, expect, it } from 'vitest';
import { kineticEnergy, maxStickError, stepBody } from '../../src/sim/body';
import { createRagdoll, PT, setPose } from '../../src/sim/ragdoll';
import type { Ledge } from '../../src/sim/body';

const DT = 1 / 120;
const floor: Ledge = { x: 0, y: 600, w: 400, h: 80 };

function finite(b: ReturnType<typeof createRagdoll>): boolean {
  for (let i = 0; i < b.n; i++) {
    if (!Number.isFinite(b.x[i]) || !Number.isFinite(b.y[i])) return false;
  }
  return true;
}

describe('ragdoll stability', () => {
  it('a limp ragdoll dropped on a ledge comes to rest without blowing up (30k steps)', () => {
    const b = createRagdoll(200, 400, 1, 1);
    b.muscle = 0;
    for (let i = 0; i < b.n; i++) b.pin[i] = 0;
    let maxE = 0;
    for (let s = 0; s < 30_000; s++) {
      stepBody(b, DT, [floor]);
      if (s > 2000) maxE = Math.max(maxE, kineticEnergy(b, DT));
    }
    expect(finite(b)).toBe(true);
    expect(maxStickError(b)).toBeLessThan(0.08);
    expect(maxE).toBeLessThan(50); // at rest: tiny residual motion only
    for (let i = 0; i < b.n; i++) expect(b.y[i] as number).toBeLessThanOrEqual(600 + 0.5);
  });

  it('resting half over a ledge edge stays bounded (draped body, 30k steps)', () => {
    const b = createRagdoll(395, 560, 1, 1);
    b.muscle = 0;
    for (let i = 0; i < b.n; i++) b.pin[i] = 0;
    // lay it across the corner
    for (let i = 0; i < b.n; i++) {
      const dx = (b.y[i] as number) - 560;
      b.x[i] = 395 + dx * 0.9;
      b.px[i] = b.x[i] as number;
      b.y[i] = 590;
      b.py[i] = 590;
    }
    for (let s = 0; s < 30_000; s++) stepBody(b, DT, [floor]);
    expect(finite(b)).toBe(true);
    expect(maxStickError(b)).toBeLessThan(0.08);
  });

  it('survives repeated huge impulses with bounded energy and no constraint blow-up', () => {
    const b = createRagdoll(200, 548, 1, 1);
    let maxE = 0;
    for (let s = 0; s < 40_000; s++) {
      setPose(b, 200, 548, 1, -0.3, (s % 240) / 240, 1, 0);
      if (s % 600 === 0) {
        const p = s % 1200 === 0 ? PT.head : PT.handF;
        const vx = ((s / 600) % 2 === 0 ? 1 : -1) * 6000;
        b.px[p] = (b.x[p] as number) - vx * DT;
        b.muscle = 0.05;
      }
      b.muscle = Math.min(1, b.muscle + DT * 1.5);
      stepBody(b, DT, [floor]);
      maxE = Math.max(maxE, kineticEnergy(b, DT));
      expect(Number.isFinite(maxE)).toBe(true);
    }
    expect(finite(b)).toBe(true);
    expect(maxE).toBeLessThan(5e7);
    expect(maxStickError(b)).toBeLessThan(0.1);
    // the pinned feet held the body on its ledge and it recovered its pose
    expect(Math.abs((b.x[PT.pelvis] as number) - 200)).toBeLessThan(12);
  });

  it('a standing posed archer keeps its feet on the ledge and head above the pelvis', () => {
    const b = createRagdoll(200, 548, -1, 1);
    for (let s = 0; s < 1200; s++) {
      setPose(b, 200, 548, -1, Math.PI + 0.3, 0.5, 1, 0);
      stepBody(b, DT, [floor]);
    }
    expect(b.y[PT.head] as number).toBeLessThan(b.y[PT.pelvis] as number);
    expect(Math.abs((b.y[PT.footF] as number) - 600)).toBeLessThan(3);
  });

  it('angle limits keep a knee from folding back through the thigh', () => {
    const b = createRagdoll(200, 548, 1, 1);
    b.muscle = 0;
    for (let i = 0; i < b.n; i++) b.pin[i] = 0;
    // fold the shin onto the thigh
    b.x[PT.footF] = b.x[PT.pelvis] as number;
    b.y[PT.footF] = b.y[PT.pelvis] as number;
    for (let s = 0; s < 240; s++) stepBody(b, DT, []);
    const dx = (b.x[PT.footF] as number) - (b.x[PT.pelvis] as number);
    const dy = (b.y[PT.footF] as number) - (b.y[PT.pelvis] as number);
    expect(Math.hypot(dx, dy)).toBeGreaterThan(14);
  });
});
