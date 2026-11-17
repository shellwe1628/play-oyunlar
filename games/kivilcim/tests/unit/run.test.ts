import { describe, expect, it } from 'vitest';
import { DT, MINI_R, SPARK_R, SPEED_MULT } from '../../src/sim/constants';
import { TrackBuilder } from '../../src/sim/builder';
import { RunSim } from '../../src/sim/run';

/** A wide vertical shaft, nothing in it. */
function openShaft(len = 4000, speed = 500): TrackBuilder {
  return new TrackBuilder({ speed }).straight(len, 300);
}

describe('RunSim kinematics', () => {
  it('climbs at the scroll speed and moves left at 45 degrees when released', () => {
    const sim = new RunSim(openShaft().finish());
    const x0 = sim.x;
    sim.step(false);
    expect(sim.y).toBeCloseTo(500 * DT, 9);
    expect(sim.x).toBeCloseTo(x0 - 500 * DT, 9);
    expect(sim.dir).toBe(-1);
  });

  it('changes direction on the exact tick the input changes, both ways', () => {
    const sim = new RunSim(openShaft().finish());
    sim.step(false);
    let x = sim.x;
    sim.step(true); // press
    expect(sim.dir).toBe(1);
    expect(sim.x - x).toBeCloseTo(500 * DT, 9);
    x = sim.x;
    sim.step(false); // release
    expect(sim.dir).toBe(-1);
    expect(sim.x - x).toBeCloseTo(-500 * DT, 9);
  });

  it('has no inertia: 10 ticks held then 10 released returns to the start x', () => {
    const sim = new RunSim(openShaft().finish());
    const x0 = sim.x;
    for (let i = 0; i < 10; i++) sim.step(true);
    for (let i = 0; i < 10; i++) sim.step(false);
    expect(sim.x).toBeCloseTo(x0, 9);
  });

  it('is deterministic: same track and timeline give the same run', () => {
    const track = new TrackBuilder({ speed: 520 }).straight(300, 260).zig(4, 300, 120).slalom(4, 380, 200, 150).bars(3, 420, 220, 2, 90).finish();
    const timeline = (t: number): boolean => Math.floor(t / 37) % 2 === 0;
    const run = (): string => {
      const s = new RunSim(track);
      for (let t = 0; t < 3000 && s.alive && !s.finished; t++) s.step(timeline(t));
      return `${s.tick}:${s.x}:${s.y}:${s.alive}:${s.deathCause}`;
    };
    expect(run()).toBe(run());
  });
});

describe('RunSim snapshots', () => {
  it('clone() continues exactly like the original', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').zig(4, 300, 120).gate('normal').straight(800, 300).finish();
    const a = new RunSim(track);
    for (let i = 0; i < 150; i++) a.step(i % 2 === 0);
    const b = a.clone();
    for (let i = 0; i < 200; i++) {
      a.step(i % 3 === 0);
      b.step(i % 3 === 0);
    }
    expect([b.x, b.y, b.tick, b.alive, b.speed, b.gemMask]).toEqual([a.x, a.y, a.tick, a.alive, a.speed, a.gemMask]);
  });
});

describe('RunSim collisions', () => {
  it('dies on the left wall when never touching, cause "wall"', () => {
    const sim = new RunSim(new TrackBuilder({ speed: 500 }).straight(3000, 150).finish());
    let ticks = 0;
    while (sim.alive && ticks < 2000) {
      sim.step(false);
      ticks++;
    }
    expect(sim.alive).toBe(false);
    expect(sim.deathCause).toBe('wall');
    // Left wall at 360 - 150 = 210: contact when x - r <= 210.
    expect(sim.x - SPARK_R).toBeLessThanOrEqual(210 + 1e-6);
    expect(sim.x - SPARK_R).toBeGreaterThan(210 - 500 * DT - 1e-6);
  });

  it('stops moving after death and ignores further steps', () => {
    const sim = new RunSim(new TrackBuilder({ speed: 500 }).straight(3000, 150).finish());
    while (sim.alive) sim.step(false);
    const { x, y, tick } = sim;
    sim.step(true);
    expect([sim.x, sim.y, sim.tick]).toEqual([x, y, tick]);
  });

  it('dies on a spike block in its path, cause "block"', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(400, 300).addBlock(360, 300, 40).straight(2000, 300).finish();
    const sim = new RunSim(track);
    // Hold/release alternately each tick: the spark goes straight up x≈360 into the block.
    while (sim.alive && sim.tick < 400) sim.step(sim.tick % 2 === 0);
    expect(sim.alive).toBe(false);
    expect(sim.deathCause).toBe('block');
    expect(sim.y).toBeLessThan(300);
  });

  it('a block corner is exact: passing just outside the diamond tip survives', () => {
    // Diamond half-diagonal 40 centred at x=360: tip at x=400. A spark column at x = 400 + r + 1.
    const track = new TrackBuilder({ speed: 500 }).straight(800, 320).addBlock(360, 400, 40).straight(1200, 320).finish();
    const sim = new RunSim(track, { startX: 400 + SPARK_R + 1.5 });
    while (sim.alive && sim.y < 600) sim.step(sim.tick % 2 === 0);
    expect(sim.alive).toBe(true);
  });

  it('dies on a moving bar when it sweeps through the spark, cause "bar"', () => {
    // A bar across the middle of the shaft whose centre oscillates; the spark sits at 360.
    const track = new TrackBuilder({ speed: 500 }).straight(300, 300).addBar({ y: 600, x0: 360, amp: 120, period: 2, phase: 0, half: 90, thick: 12 }).straight(2000, 300).finish();
    const sim = new RunSim(track);
    while (sim.alive && sim.tick < 600) sim.step(sim.tick % 2 === 0);
    expect(sim.alive).toBe(false);
    expect(sim.deathCause).toBe('bar');
  });

  it('a mini spark fits through a gap the normal spark cannot', () => {
    // Pinch to half-width 13: normal radius 13 dies, mini radius 7.5 passes.
    const build = (mini: boolean): RunSim => {
      const b = new TrackBuilder({ speed: 500 }).straight(200, 300);
      if (mini) b.gate('mini');
      b.straight(300, 300).straight(400, 13).straight(300, 300);
      if (mini) b.gate('big');
      return new RunSim(b.straight(400, 300).finish());
    };
    for (const mini of [false, true]) {
      const sim = build(mini);
      while (sim.alive && !sim.finished) sim.step(sim.tick % 2 === 0);
      expect(sim.alive, `mini=${mini}`).toBe(mini);
    }
  });
});

describe('RunSim gates', () => {
  const run = (track: ReturnType<TrackBuilder['finish']>, untilY: number): RunSim => {
    const sim = new RunSim(track);
    while (sim.alive && sim.y < untilY) sim.step(sim.tick % 2 === 0);
    return sim;
  };

  it('fast gate multiplies scroll speed until a normal gate', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').straight(1024, 300).gate('normal').straight(1024, 300).finish();
    expect(run(track, 400).speed).toBeCloseTo(500, 9);
    expect(run(track, 800).speed).toBeCloseTo(500 * SPEED_MULT.fast, 9);
    expect(run(track, 2000).speed).toBeCloseTo(500, 9);
  });

  it('slow gate slows the scroll until a normal gate', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('slow').straight(1024, 300).gate('normal').straight(1024, 300).finish();
    expect(run(track, 800).speed).toBeCloseTo(500 * SPEED_MULT.slow, 9);
    expect(run(track, 2000).speed).toBeCloseTo(500, 9);
  });

  it('lateral speed always equals scroll speed (45 degrees), also after a fast gate', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').straight(2000, 300).finish();
    const sim = run(track, 700);
    const x = sim.x;
    const y = sim.y;
    sim.step(true);
    expect(sim.x - x).toBeCloseTo(sim.y - y, 9);
  });

  it('mini gate shrinks the spark until a big gate', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('mini').straight(1024, 300).gate('big').straight(1024, 300).finish();
    expect(run(track, 400).radius).toBe(SPARK_R);
    expect(run(track, 800).radius).toBe(MINI_R);
    expect(run(track, 2000).radius).toBe(SPARK_R);
  });

  it('flip gate swaps the controls until an unflip gate', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('flip').straight(1024, 300).gate('unflip').straight(1024, 300).finish();
    const a = run(track, 800);
    expect(a.flipped).toBe(true);
    a.step(true);
    expect(a.dir).toBe(-1); // held = left while flipped
    a.step(false);
    expect(a.dir).toBe(1);
    const b = run(track, 2000);
    expect(b.flipped).toBe(false);
    b.step(true);
    expect(b.dir).toBe(1);
  });

  it('reports each gate exactly once, on the tick it is crossed', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').straight(1024, 300).gate('normal').straight(600, 300).finish();
    const sim = new RunSim(track);
    const seen: string[] = [];
    while (sim.alive && !sim.finished) {
      const ev = sim.step(sim.tick % 2 === 0);
      if (ev.gate) seen.push(`${ev.gate}@${Math.round(sim.y)}`);
    }
    expect(seen.map((s) => s.split('@')[0])).toEqual(['fast', 'normal']);
  });

  it('gates sit on the beat grid', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(500, 300).gate('fast').straight(700, 300).gate('normal').straight(600, 300).finish();
    for (const g of track.gates) expect(g.y % 256).toBe(0);
  });
});

describe('RunSim gems', () => {
  it('collects a gem only by overlap', () => {
    const near = new TrackBuilder({ speed: 500 }).straight(300, 300).addGem(360, 500).straight(1500, 300).finish();
    const s1 = new RunSim(near);
    while (s1.alive && s1.y < 800) s1.step(s1.tick % 2 === 0);
    expect(s1.gemsTaken).toBe(1);
    expect(s1.gemMask).toBe(1);

    const far = new TrackBuilder({ speed: 500 }).straight(300, 300).addGem(500, 500).straight(1500, 300).finish();
    const s2 = new RunSim(far);
    while (s2.alive && s2.y < 800) s2.step(s2.tick % 2 === 0);
    expect(s2.gemsTaken).toBe(0);
  });

  it('a gem is taken once and reported on that tick', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(300, 300).addGem(360, 500).straight(1500, 300).finish();
    const sim = new RunSim(track);
    let events = 0;
    while (sim.alive && sim.y < 900) if (sim.step(sim.tick % 2 === 0).gem >= 0) events++;
    expect(events).toBe(1);
  });
});

describe('RunSim progress and finish', () => {
  it('progress reaches exactly 100% at the finish ring and the run stops', () => {
    const track = openShaft(2000).finish();
    const sim = new RunSim(track);
    let finishedEvents = 0;
    let last = 0;
    while (sim.alive && !sim.finished) {
      const ev = sim.step(sim.tick % 2 === 0);
      expect(sim.progress).toBeGreaterThanOrEqual(last);
      last = sim.progress;
      if (ev.finished) finishedEvents++;
      if (!sim.finished) expect(sim.progress).toBeLessThan(1);
    }
    expect(sim.finished).toBe(true);
    expect(sim.progress).toBe(1);
    expect(finishedEvents).toBe(1);
    expect(sim.y).toBeGreaterThanOrEqual(track.length);
  });

  it('progress is 0 at the start', () => {
    expect(new RunSim(openShaft().finish()).progress).toBe(0);
  });
});

describe('RunSim near misses', () => {
  it('passing within a few px of a wall without touching counts as a near miss and builds edge', () => {
    // Narrow vertical shaft: zigzag wall to wall, grazing each side.
    const track = new TrackBuilder({ speed: 500 }).straight(4000, 60).finish();
    const sim = new RunSim(track);
    let near = 0;
    // Bounce: switch direction when within 5 px (one tick is 4.17 px) of a wall.
    let held = true;
    while (sim.alive && sim.y < 3000) {
      if (sim.clearance < 5) held = sim.x < 360;
      const ev = sim.step(held);
      if (ev.nearMiss) near++;
    }
    expect(sim.alive).toBe(true);
    expect(near).toBeGreaterThan(3);
    expect(sim.edge).toBeGreaterThan(1);
    expect(sim.style).toBeGreaterThan(0);
  });

  it('a run straight up the middle of a wide shaft has no near misses', () => {
    const sim = new RunSim(openShaft(3000).finish());
    let near = 0;
    while (sim.alive && !sim.finished) if (sim.step(sim.tick % 2 === 0).nearMiss) near++;
    expect(near).toBe(0);
  });
});
