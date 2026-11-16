import { describe, expect, it } from 'vitest';
import { SHIFT } from '../../src/sim/night';
import { dailySeed } from '../../src/sim/progress';
import { ShiftSim, type Anomaly } from '../../src/sim/shift';

type Style = (sim: ShiftSim, t: number) => void;

/** Play a whole daily shift with a given player style; returns every anomaly that appeared. */
function play(day: string, style: Style): { list: string[]; spawns: Anomaly[] } {
  const sim = new ShiftSim(dailySeed(day), SHIFT.dailyNight, undefined, { daily: true });
  const spawns: Anomaly[] = [];
  let t = 0;
  while (!sim.over) {
    for (const e of sim.tick(0.1)) if (e.kind === 'spawn') spawns.push(e.anomaly);
    t += 0.1;
    if (sim.phase === 'brink') if (!sim.useSecondWind()) sim.declineSecondWind();
    style(sim, t);
  }
  const list = spawns.map((a) => `${a.id}:${a.camera}:${a.objectId}:${a.type}`).sort();
  return { list, spawns };
}

const diligent: Style = (sim) => {
  for (const a of [...sim.active]) {
    sim.switchCamera(a.camera);
    sim.report(a.camera, a.objectId, a.type);
  }
};
const lazyFlipper: Style = (sim, t) => {
  if (Math.floor(t * 10) % 50 === 0) sim.switchCamera((sim.camera + 1) % 4);
  if (Math.floor(t * 10) % 200 === 0) {
    const a = sim.active[0];
    if (a) {
      sim.switchCamera(a.camera);
      sim.report(a.camera, a.objectId, a.type);
    }
  }
};
const camper: Style = (sim) => {
  // sits on camera 2 forever, clearing what it can see there
  sim.switchCamera(2);
  for (const a of sim.active.filter((x) => x.camera === 2)) sim.report(2, a.objectId, a.type);
};

describe('daily shift', () => {
  it('two different players on the same date get the same anomalies (time-ordered schedule)', () => {
    for (const day of ['2026-11-16', '2026-11-17', '2027-02-29'.replace('29', '28')]) {
      const a = play(day, diligent);
      const b = play(day, lazyFlipper);
      const n = Math.min(a.list.length, b.list.length);
      expect(n).toBeGreaterThan(5);
      // the lazy player may lose earlier; everything both saw must be identical
      const ids = new Set(b.spawns.map((x) => x.id));
      expect(a.list.filter((k) => ids.has(Number(k.split(':')[0])))).toEqual(b.list);
    }
  });

  it('the full schedule is fixed by the date', () => {
    const s1 = new ShiftSim(dailySeed('2026-11-16'), SHIFT.dailyNight, undefined, { daily: true }).scheduleView();
    const s2 = new ShiftSim(dailySeed('2026-11-16'), SHIFT.dailyNight, undefined, { daily: true }).scheduleView();
    const s3 = new ShiftSim(dailySeed('2026-11-17'), SHIFT.dailyNight, undefined, { daily: true }).scheduleView();
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect(s1.length).toBeGreaterThan(10);
  });

  it('a scheduled spawn on the camera on screen waits until the player looks away', () => {
    const r = play('2026-11-16', camper);
    const sim = new ShiftSim(dailySeed('2026-11-16'), SHIFT.dailyNight, undefined, { daily: true });
    const sched = sim.scheduleView();
    for (const a of r.spawns) {
      const s = sched.find((x) => x.id === a.id)!;
      expect(a.at).toBeGreaterThanOrEqual(s.time - 1e-9);
      expect(a.camera).toBe(s.camera);
      expect(a.camera === 2 ? 'never' : 'ok').toBe('ok'); // camper never leaves camera 2
    }
  });
});
