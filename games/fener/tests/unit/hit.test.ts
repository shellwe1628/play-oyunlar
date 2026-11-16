import { describe, expect, it } from 'vitest';
import { evidencePoint, ShiftSim, type Anomaly } from '../../src/sim/shift';
import { STATION, type CameraDef } from '../../src/sim/station';

/** Report everything the moment it appears, so cameras keep cycling (bot). */
function clearAll(sim: ShiftSim): void {
  for (const a of [...sim.active]) {
    sim.switchCamera(a.camera);
    sim.report(a.camera, a.objectId, a.type);
  }
}

describe('hit test: intruders and anomaly evidence win over what is behind them', () => {
  it('every intruder spot in every camera is hit at the ghost centre while visible', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 600 && seen.size < 12; seed++) {
      const sim = new ShiftSim(seed, 7);
      while (!sim.over) {
        for (const e of sim.tick(0.1)) {
          if (e.kind !== 'spawn' || e.anomaly.type !== 'intruder') continue;
          const a = e.anomaly;
          const g = sim.intruders(a.camera).find((s) => s.id === a.objectId)!;
          expect(sim.hitTest(a.camera, g.x, g.y), `${STATION[a.camera]!.id}/${a.objectId}`).toBe(a.objectId);
          seen.add(`${a.camera}:${a.objectId}`);
        }
        if (sim.phase === 'brink') if (!sim.useSecondWind()) sim.declineSecondWind();
        clearAll(sim);
      }
    }
    expect(seen.size).toBe(STATION.reduce((n, c) => n + c.intruders.length, 0));
  });

  it('every active anomaly stays reportable at its visible centre (all seeds × nights 1–7)', () => {
    const bad: string[] = [];
    let checked = 0;
    const check = (sim: ShiftSim, a: Anomaly, when: string): void => {
      const p = evidencePoint(sim, a);
      checked++;
      if (sim.hitTest(a.camera, p.x, p.y) !== a.objectId) bad.push(`${when} ${STATION[a.camera]!.id}:${a.objectId}:${a.type} → ${sim.hitTest(a.camera, p.x, p.y)}`);
    };
    for (let night = 1; night <= 7; night++) {
      for (let seed = 1; seed <= 80; seed++) {
        const sim = new ShiftSim(seed * 31 + night, night);
        let t = 0;
        while (!sim.over) {
          const ev = sim.tick(0.1);
          t += 0.1;
          // every spawn: the new anomaly and everything else still on screen must be reportable
          if (ev.some((e) => e.kind === 'spawn')) for (const a of sim.active) check(sim, a, `n${night}s${seed}`);
          if (sim.phase === 'brink') {
            if (!sim.useSecondWind()) sim.declineSecondWind();
          }
          // a lazy player: clears only every 12 s, so anomalies overlap in time
          if (Math.floor(t * 10) % 120 === 0) clearAll(sim);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(checked).toBeGreaterThan(3000);
  });

  it('a tap up to 40 px outside a small object still reaches it (88 px touch minimum)', () => {
    const sim = new ShiftSim(1, 1);
    const mug = STATION[3]!.objects.find((o) => o.id === 'mug')!; // 44×44
    expect(sim.hitTest(3, mug.x - mug.w / 2 - 20, mug.y)).toBe('mug');
    expect(sim.hitTest(3, mug.x, mug.y - mug.h / 2 - 20)).toBe('mug');
    expect(sim.hitTest(3, mug.x - 60, mug.y - 60)).not.toBe('mug');
  });

  it('on an exact tie the object drawn on top (declared later) wins', () => {
    const base = STATION[0]!.objects[0]!;
    const station: CameraDef[] = [0, 1, 2, 3].map((i) => ({
      id: `c${i}`,
      style: 'lamp',
      objects: [
        { ...base, id: 'under', x: 300, y: 300, w: 100, h: 100, types: ['moved'] },
        { ...base, id: 'over', x: 300, y: 300, w: 100, h: 100, types: ['moved'] },
      ],
      intruders: [],
    }));
    const sim = new ShiftSim(1, 1, station);
    expect(sim.hitTest(0, 310, 300)).toBe('over');
    expect(sim.hitTest(0, 300, 300)).toBe('over');
  });
});
