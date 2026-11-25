import { describe, expect, it } from 'vitest';
import { ShiftSim } from '../../src/sim/shift';

/**
 * A simulated watcher: stays `dwell` seconds on each camera in turn and reports every anomaly
 * on the camera it is looking at after `notice` seconds of looking. Measures win rates.
 */
function watcher(seed: number, night: number, dwell: number, notice: number): { won: boolean; score: number } {
  const sim = new ShiftSim(seed, night);
  const dt = 0.1;
  let onCam = 0;
  const seenSince = new Map<number, number>();
  while (!sim.over) {
    sim.tick(dt);
    if (sim.phase === 'brink') sim.declineSecondWind();
    onCam += dt;
    if (onCam >= dwell) {
      sim.switchCamera((sim.camera + 1) % 4);
      onCam = 0;
      seenSince.clear();
    }
    for (const a of [...sim.active]) {
      if (a.camera !== sim.camera) continue;
      const t = (seenSince.get(a.id) ?? 0) + dt;
      seenSince.set(a.id, t);
      if (t >= notice) sim.report(a.camera, a.objectId, a.type);
    }
  }
  return { won: sim.phase === 'won', score: sim.score };
}

const rate = (night: number, dwell: number, notice: number, seeds = 60): number => {
  let w = 0;
  for (let s = 1; s <= seeds; s++) if (watcher(s, night, dwell, notice).won) w++;
  return w / seeds;
};

describe('balance (difficulty curve, measured with a simulated watcher)', () => {
  it('night 1 forgives a slow watcher (10 s per camera, 5 s to notice)', () => {
    expect(rate(1, 10, 5)).toBeGreaterThanOrEqual(0.9);
  });
  it('night 7 needs a brisk watcher: slow ones mostly lose, brisk ones mostly win', () => {
    expect(rate(7, 10, 5)).toBeLessThanOrEqual(0.3);
    expect(rate(7, 4, 2)).toBeGreaterThanOrEqual(0.9);
  });
  it('doing nothing always loses, even on night 1', () => {
    for (let s = 1; s <= 30; s++) {
      const sim = new ShiftSim(s, 1);
      while (!sim.over) {
        sim.tick(0.1);
        if (sim.phase === 'brink' && sim.brinkLeft <= 0.1) break;
      }
      for (let i = 0; i < 200 && !sim.over; i++) sim.tick(0.1);
      expect(sim.phase).toBe('lost');
    }
  });
});
