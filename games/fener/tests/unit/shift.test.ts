import { describe, expect, it } from 'vitest';
import { nightParams, SHIFT } from '../../src/sim/night';
import { anomalyMagnitude, ShiftSim, type ShiftEvent } from '../../src/sim/shift';
import { STATION, VIEW } from '../../src/sim/station';

const STEP = 0.1;

/** Tick until the predicate holds (or the shift ends); returns all events seen. */
function runUntil(sim: ShiftSim, done: (e: ShiftEvent[]) => boolean, maxSeconds = 400): ShiftEvent[] {
  const all: ShiftEvent[] = [];
  for (let t = 0; t < maxSeconds; t += STEP) {
    const ev = sim.tick(STEP);
    all.push(...ev);
    if (done(ev) || sim.phase === 'won' || sim.phase === 'lost') break;
  }
  return all;
}

const firstSpawn = (sim: ShiftSim) => {
  const ev = runUntil(sim, (e) => e.some((x) => x.kind === 'spawn'));
  const s = ev.find((x) => x.kind === 'spawn');
  if (!s || s.kind !== 'spawn') throw new Error('no spawn');
  return s.anomaly;
};

describe('night params', () => {
  it('spawn rate and subtlety rise with the night; audio cue only on night 1; intruders from night 3', () => {
    const n1 = nightParams(1);
    const n7 = nightParams(7);
    expect(n7.spawnMin).toBeLessThan(n1.spawnMin);
    expect(n7.spawnMax).toBeLessThan(n1.spawnMax);
    expect(n7.moveMin).toBeLessThan(n1.moveMin);
    expect(n7.colorMin).toBeLessThan(n1.colorMin);
    expect(n7.scaleMin).toBeLessThan(n1.scaleMin);
    expect(n1.audioCue).toBe(true);
    expect(nightParams(2).audioCue).toBe(false);
    expect(nightParams(2).intruders).toBe(false);
    expect(nightParams(3).intruders).toBe(true);
  });
  it('clamps nights outside 1..7', () => {
    expect(nightParams(0)).toEqual(nightParams(1));
    expect(nightParams(99)).toEqual(nightParams(7));
  });
});

describe('ShiftSim basics', () => {
  it('starts at 00:00 in grace on camera 0 with nothing active', () => {
    const sim = new ShiftSim(1, 1);
    expect(sim.phase).toBe('grace');
    expect(sim.camera).toBe(0);
    expect(sim.active).toEqual([]);
    expect(sim.clock()).toEqual({ hour: 0, minute: 0 });
    expect(sim.objects(0)).toHaveLength(STATION[0]!.objects.length);
  });

  it('no spawn during the grace period', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new ShiftSim(seed, 7);
      const ev = runUntil(sim, () => false, SHIFT.grace - 0.05);
      expect(ev.filter((e) => e.kind === 'spawn')).toEqual([]);
      expect(sim.active).toEqual([]);
    }
    const sim = new ShiftSim(3, 7);
    runUntil(sim, () => false, SHIFT.grace + 0.2);
    expect(sim.phase).toBe('running');
  });

  it('never spawns on the camera currently on screen', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const sim = new ShiftSim(seed, 7);
      let t = 0;
      while (sim.phase !== 'won' && sim.phase !== 'lost' && t < 300) {
        // flip cameras in a seed-dependent pattern, and clear anything that appears
        if (Math.floor(t * 10) % 37 === 0) sim.switchCamera((sim.camera + 1 + (seed % 3)) % 4);
        const visible = sim.camera;
        for (const e of sim.tick(STEP)) if (e.kind === 'spawn') expect(e.anomaly.camera).not.toBe(visible);
        if (sim.phase === 'brink') sim.useSecondWind();
        for (const a of [...sim.active]) {
          sim.switchCamera(a.camera);
          sim.report(a.camera, a.objectId, a.type);
        }
        t += STEP;
      }
    }
  });

  it('same seed → same shift; different seed → different shift', () => {
    const trace = (seed: number) => {
      const sim = new ShiftSim(seed, 4);
      const out: string[] = [];
      runUntil(sim, (e) => {
        for (const x of e) if (x.kind === 'spawn') out.push(`${x.anomaly.camera}:${x.anomaly.objectId}:${x.anomaly.type}@${sim.elapsed.toFixed(1)}`);
        return false;
      });
      return { out, objects: JSON.stringify([0, 1, 2, 3].map((c) => sim.objects(c))) };
    };
    expect(trace(42)).toEqual(trace(42));
    expect(trace(42).out).not.toEqual(trace(43).out);
  });
});

describe('anomaly generation', () => {
  it('every spawned anomaly differs from baseline by at least the night minimum', () => {
    const seen = new Set<string>();
    for (const night of [1, 4, 7]) {
      const p = nightParams(night);
      for (let seed = 1; seed <= 40; seed++) {
        const sim = new ShiftSim(seed, night);
        runUntil(sim, (ev) => {
          for (const e of ev) {
            if (e.kind !== 'spawn') continue;
            const a = e.anomaly;
            seen.add(a.type);
            const m = anomalyMagnitude(sim, a);
            const min = { moved: p.moveMin, recolor: p.colorMin, resized: p.scaleMin, extra: p.moveMin, missing: 1, state: 1, intruder: 1 }[a.type];
            expect(m, `${a.type} on ${a.objectId} night ${night}`).toBeGreaterThanOrEqual(min - 1e-9);
          }
          return false;
        });
      }
    }
    expect([...seen].sort()).toEqual(['extra', 'intruder', 'missing', 'moved', 'recolor', 'resized', 'state']);
  });

  it('moved and extra objects stay inside the view', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new ShiftSim(seed, 7);
      runUntil(sim, () => false);
      for (let c = 0; c < 4; c++) {
        for (const o of sim.objects(c)) {
          expect(o.x).toBeGreaterThanOrEqual(0);
          expect(o.x).toBeLessThanOrEqual(VIEW);
          expect(o.y).toBeGreaterThanOrEqual(0);
          expect(o.y).toBeLessThanOrEqual(VIEW);
          if (o.copy) {
            expect(o.copy.x).toBeGreaterThanOrEqual(0);
            expect(o.copy.x).toBeLessThanOrEqual(VIEW);
          }
        }
      }
    }
  });

  it('no intruders before night 3', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new ShiftSim(seed, 2);
      const ev = runUntil(sim, () => false);
      expect(ev.some((e) => e.kind === 'spawn' && e.anomaly.type === 'intruder')).toBe(false);
    }
  });

  it('at most one anomaly per object at a time', () => {
    const sim = new ShiftSim(5, 7);
    runUntil(sim, () => sim.active.length >= 3);
    const keys = sim.active.map((a) => `${a.camera}:${a.objectId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('reporting', () => {
  it('right object + right type clears the anomaly, restores the object and scores the bonus', () => {
    const sim = new ShiftSim(7, 1);
    const a = firstSpawn(sim);
    sim.switchCamera(a.camera);
    const r = sim.report(a.camera, a.objectId, a.type);
    expect(r.kind).toBe('correct');
    if (r.kind !== 'correct') return;
    expect(r.typeCorrect).toBe(true);
    // reported on the tick it appeared: full speed bonus
    expect(r.points).toBe(SHIFT.points.object + SHIFT.points.type + SHIFT.points.speed);
    expect(sim.active).toEqual([]);
    expect(sim.score).toBe(r.points);
    expect(anomalyMagnitude(sim, a)).toBe(0);
  });

  it('right object + wrong type still clears, without the type bonus', () => {
    const sim = new ShiftSim(7, 1);
    const a = firstSpawn(sim);
    sim.switchCamera(a.camera);
    const wrong = a.type === 'moved' ? 'recolor' : 'moved';
    const r = sim.report(a.camera, a.objectId, wrong);
    expect(r.kind).toBe('correct');
    if (r.kind !== 'correct') return;
    expect(r.typeCorrect).toBe(false);
    expect(r.points).toBe(SHIFT.points.object + SHIFT.points.speed);
    expect(sim.active).toEqual([]);
    expect(sim.logged).toEqual([]);
    expect(sim.stats).toMatchObject({ correct: 1, typed: 0 });
  });

  it('wrong object is a false report: 8 s of static, reports ignored while blind', () => {
    const sim = new ShiftSim(7, 1);
    const a = firstSpawn(sim);
    sim.switchCamera(a.camera);
    const other = sim.objects(a.camera).find((o) => o.id !== a.objectId)!;
    const r = sim.report(a.camera, other.id, 'moved');
    expect(r.kind).toBe('false');
    expect(sim.staticLeft).toBeCloseTo(SHIFT.staticSeconds, 6);
    expect(sim.report(a.camera, a.objectId, a.type).kind).toBe('blind');
    expect(sim.active).toHaveLength(1);
    runUntil(sim, () => sim.staticLeft === 0);
    expect(sim.report(a.camera, a.objectId, a.type).kind).toBe('correct');
  });

  it('a report about a camera that is not on screen is ignored', () => {
    const sim = new ShiftSim(7, 1);
    const a = firstSpawn(sim);
    expect(sim.camera).not.toBe(a.camera);
    expect(sim.report(a.camera, a.objectId, a.type).kind).toBe('ignored');
    expect(sim.active).toHaveLength(1);
  });

  it('records correctly typed reports for the logbook', () => {
    const sim = new ShiftSim(7, 1);
    const a = firstSpawn(sim);
    sim.switchCamera(a.camera);
    sim.report(a.camera, a.objectId, a.type);
    expect(sim.logged).toEqual([`${STATION[a.camera]!.id}:${a.objectId}:${a.type}`]);
  });
});

describe('scoring details', () => {
  it('the speed bonus falls off linearly and is gone after the speed window', () => {
    for (const wait of [5, 10, SHIFT.points.speedWindow + 1]) {
      const sim = new ShiftSim(7, 1);
      const a = firstSpawn(sim);
      sim.switchCamera(a.camera);
      for (let t = 0; t < wait - 1e-9; t += 0.1) sim.tick(0.1);
      // nothing else may have spawned on this camera for a clean read
      const r = sim.report(a.camera, a.objectId, a.type);
      if (r.kind !== 'correct') throw new Error(r.kind);
      const expected = SHIFT.points.object + SHIFT.points.type + Math.round(SHIFT.points.speed * Math.max(0, 1 - (sim.elapsed - a.at) / SHIFT.points.speedWindow));
      expect(r.points).toBe(expected);
      if (wait > SHIFT.points.speedWindow) expect(r.points).toBe(SHIFT.points.object + SHIFT.points.type);
      else expect(r.points).toBeGreaterThan(SHIFT.points.object + SHIFT.points.type);
    }
  });

  it('spawn gaps stay inside [spawnMin, spawnMax] and use the whole range', () => {
    for (const night of [1, 7]) {
      const p = nightParams(night);
      const gaps: number[] = [];
      for (let seed = 1; seed <= 40; seed++) {
        const sim = new ShiftSim(seed, night);
        let last = -1;
        runUntil(sim, (ev) => {
          for (const e of ev) {
            if (e.kind !== 'spawn') continue;
            if (last >= 0) gaps.push(e.anomaly.at - last);
            last = e.anomaly.at;
          }
          for (const a of [...sim.active]) {
            sim.switchCamera((a.camera + 1) % 4 === sim.camera ? a.camera : a.camera);
            sim.report(a.camera, a.objectId, a.type);
          }
          return false;
        });
      }
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(p.spawnMin - 0.11);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(p.spawnMax + 0.11);
      expect(Math.max(...gaps)).toBeGreaterThan(p.spawnMin + 0.8 * (p.spawnMax - p.spawnMin));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      expect(Math.abs(mean - (p.spawnMin + p.spawnMax) / 2)).toBeLessThan(1);
    }
  });

  it('resizes both grow and shrink', () => {
    let grow = 0;
    let shrink = 0;
    for (let seed = 1; seed <= 300 && !(grow && shrink); seed++) {
      const sim = new ShiftSim(seed, 3);
      runUntil(sim, (ev) => {
        for (const e of ev) {
          if (e.kind !== 'spawn' || e.anomaly.type !== 'resized') continue;
          const o = sim.objects(e.anomaly.camera).find((s) => s.id === e.anomaly.objectId)!;
          if (o.scale > 1) grow++;
          else shrink++;
        }
        for (const a of [...sim.active]) {
          sim.switchCamera(a.camera);
          sim.report(a.camera, a.objectId, a.type);
        }
        return false;
      });
    }
    expect(grow).toBeGreaterThan(0);
    expect(shrink).toBeGreaterThan(0);
  });

  it('never more than one intruder visible per camera', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sim = new ShiftSim(seed, 7);
      runUntil(sim, () => {
        for (let c = 0; c < 4; c++) expect(sim.intruders(c).filter((g) => g.visible).length).toBeLessThanOrEqual(1);
        if (sim.phase === 'brink') sim.useSecondWind();
        return false;
      });
    }
  });

  it('intruders get fainter on later nights', () => {
    expect(nightParams(3).intruderAlpha).toBeGreaterThan(nightParams(7).intruderAlpha);
    expect(nightParams(7).intruderAlpha).toBeGreaterThanOrEqual(0.5);
  });
});

describe('hit testing', () => {
  it('finds the object under a point, the smallest one when they overlap', () => {
    const sim = new ShiftSim(1, 1);
    const mug = STATION[3]!.objects.find((o) => o.id === 'mug')!;
    expect(sim.hitTest(3, mug.x, mug.y)).toBe('mug');
    const table = STATION[3]!.objects.find((o) => o.id === 'table')!;
    expect(sim.hitTest(3, table.x + 100, table.y + 30)).toBe('table');
  });

  it('a missing object can still be reported by tapping where it used to be', () => {
    for (let seed = 1; seed < 200; seed++) {
      const sim = new ShiftSim(seed, 1);
      const a = firstSpawn(sim);
      if (a.type !== 'missing') continue;
      const def = STATION[a.camera]!.objects.find((o) => o.id === a.objectId)!;
      expect(sim.hitTest(a.camera, def.x, def.y)).toBe(a.objectId);
      return;
    }
    throw new Error('no missing anomaly found in 200 seeds');
  });

  it('an extra copy and an intruder are hittable', () => {
    let copy = false;
    let intruder = false;
    for (let seed = 1; seed < 300 && !(copy && intruder); seed++) {
      const sim = new ShiftSim(seed, 5);
      const a = firstSpawn(sim);
      if (a.type === 'extra') {
        const o = sim.objects(a.camera).find((x) => x.id === a.objectId)!;
        expect(sim.hitTest(a.camera, o.copy!.x, o.copy!.y)).toBe(a.objectId);
        copy = true;
      }
      if (a.type === 'intruder') {
        const s = sim.intruders(a.camera).find((x) => x.id === a.objectId)!;
        expect(s.visible).toBe(true);
        expect(sim.hitTest(a.camera, s.x, s.y)).toBe(a.objectId);
        intruder = true;
      }
    }
    expect(copy && intruder).toBe(true);
  });

  it('empty floor far from everything hits nothing', () => {
    const sim = new ShiftSim(1, 1);
    // top centre of the dock sky, between moon and nothing
    expect(sim.hitTest(2, 250, 40)).toBeNull();
  });
});

describe('win and lose', () => {
  it('wins at 06:00 when anomalies are kept down', () => {
    const sim = new ShiftSim(11, 1);
    let reportPoints = 0;
    const ev = runUntil(sim, (e) => {
      for (const a of [...sim.active]) {
        sim.switchCamera(a.camera);
        const r = sim.report(a.camera, a.objectId, a.type);
        if (r.kind === 'correct') reportPoints += r.points;
      }
      return e.some((x) => x.kind === 'won');
    });
    expect(sim.phase).toBe('won');
    const won = ev.find((e) => e.kind === 'won');
    expect(won).toEqual({ kind: 'won', bonus: SHIFT.points.dawn });
    expect(sim.score).toBe(reportPoints + SHIFT.points.dawn);
    expect(sim.elapsed).toBeGreaterThanOrEqual(SHIFT.hours * SHIFT.hourSeconds);
    expect(sim.clock()).toEqual({ hour: 6, minute: 0 });
    expect(ev.filter((e) => e.kind === 'hour')).toHaveLength(6);
    expect(sim.score).toBeGreaterThan(0);
  });

  it('4 active anomalies → brink (second wind offer), which runs out into a loss', () => {
    const sim = new ShiftSim(3, 1);
    runUntil(sim, (e) => e.some((x) => x.kind === 'brink'));
    expect(sim.phase).toBe('brink');
    expect(sim.active).toHaveLength(SHIFT.maxActive);
    const clockAt = sim.elapsed;
    runUntil(sim, (e) => e.some((x) => x.kind === 'lost'));
    expect(sim.phase).toBe('lost');
    expect(sim.elapsed).toBe(clockAt); // the clock is frozen at the brink
  });

  it('second wind clears two anomalies once; the next 4th anomaly loses at once', () => {
    const sim = new ShiftSim(3, 1);
    runUntil(sim, (e) => e.some((x) => x.kind === 'brink'));
    expect(sim.useSecondWind()).toBe(true);
    expect(sim.active).toHaveLength(SHIFT.maxActive - 2);
    expect(sim.phase).toBe('running');
    expect(sim.useSecondWind()).toBe(false);
    const ev = runUntil(sim, (e) => e.some((x) => x.kind === 'lost'));
    expect(ev.some((e) => e.kind === 'brink')).toBe(false);
    expect(sim.phase).toBe('lost');
  });

  it('declining second wind loses immediately; nothing ticks after the end', () => {
    const sim = new ShiftSim(3, 1);
    runUntil(sim, (e) => e.some((x) => x.kind === 'brink'));
    sim.declineSecondWind();
    expect(sim.phase).toBe('lost');
    const t = sim.elapsed;
    expect(sim.tick(5)).toEqual([]);
    expect(sim.elapsed).toBe(t);
  });

  it('switching cameras is ignored for invalid indices and counts switches', () => {
    const sim = new ShiftSim(1, 1);
    expect(sim.switchCamera(9)).toBe(false);
    expect(sim.switchCamera(0)).toBe(false);
    expect(sim.switchCamera(2)).toBe(true);
    expect(sim.camera).toBe(2);
  });
});
