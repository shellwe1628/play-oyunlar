import { describe, expect, it } from 'vitest';
import { createRng } from '@oyun/core/pure';
import { TrackBuilder } from '../../src/sim/builder';
import { DT, EDGE_WINDOW_S, NEAR_PX, NEAR_RELEASE_PX, RAMP_PX, RAMP_START, SPARK_R, SPEED_MULT } from '../../src/sim/constants';
import { buildEndless } from '../../src/sim/endless';
import { buildLevel, LEVEL_COUNT } from '../../src/sim/levels';
import { RunSim } from '../../src/sim/run';
import { barCentre, barSdf, baseSpeed, diamondSdf, type Bar } from '../../src/sim/track';

/** Steer toward `side` until clearance drops below `inside`, then away until a near miss fires. */
function graze(sim: RunSim, side: 1 | -1, inside = 5): number {
  let held = side === 1;
  for (let k = 0; k < 2000; k++) {
    if (sim.clearance < inside) held = side !== 1;
    const ev = sim.step(held);
    if (ev.nearMiss) return sim.tick;
    if (!sim.alive) throw new Error('died while grazing');
  }
  throw new Error('no near miss');
}

/** Hover near the middle for n ticks (alternate input every tick). */
function hover(sim: RunSim, n: number): void {
  for (let k = 0; k < n; k++) sim.step(k % 2 === 0);
}

describe('gates, exact tick', () => {
  it('a gate applies on the tick that crosses its line, not before or after', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').straight(800, 300).finish();
    const sim = new RunSim(track);
    let prevY = 0;
    for (let k = 0; k < 400; k++) {
      const before = sim.speed;
      const ev = sim.step(k % 2 === 0);
      if (ev.gate) {
        expect(prevY).toBeLessThan(512);
        expect(sim.y).toBeGreaterThanOrEqual(512);
        expect(before).toBe(500); // this tick still moved at the old speed
        expect(sim.speed).toBeCloseTo(500 * SPEED_MULT.fast, 9);
        return;
      }
      expect(sim.speed).toBe(500);
      prevY = sim.y;
    }
    throw new Error('gate never crossed');
  });
});

describe('near misses and edge', () => {
  const shaft = (): RunSim => new RunSim(new TrackBuilder({ speed: 500 }).straight(20000, 150).finish());

  it('the near-miss flag is set for exactly one step', () => {
    const sim = shaft();
    graze(sim, 1);
    expect(sim.step(false).nearMiss).toBe(false);
  });

  it('releases only above the hysteresis threshold', () => {
    const sim = shaft();
    let held = true;
    let sawBetween = false;
    for (let k = 0; k < 2000; k++) {
      if (sim.clearance < 5) held = false;
      const c0 = sim.clearance;
      const ev = sim.step(held);
      if (!held && sim.clearance > NEAR_PX && sim.clearance <= NEAR_RELEASE_PX) {
        expect(ev.nearMiss).toBe(false);
        sawBetween = true;
      }
      if (ev.nearMiss) {
        expect(sim.clearance).toBeGreaterThan(NEAR_RELEASE_PX);
        expect(c0).toBeLessThanOrEqual(NEAR_RELEASE_PX);
        expect(sawBetween).toBe(true);
        return;
      }
    }
    throw new Error('no near miss');
  });

  it('edge counts consecutive near misses inside the window and style adds 10 × edge', () => {
    const sim = shaft();
    graze(sim, 1);
    expect([sim.edge, sim.style]).toEqual([1, 10]);
    graze(sim, -1); // ~0.6 s later
    expect([sim.edge, sim.style]).toEqual([2, 30]);
    graze(sim, 1);
    expect([sim.edge, sim.style]).toEqual([3, 60]);
  });

  it('edge restarts at 1 after a gap longer than the window, and expires to 0', () => {
    const sim = shaft();
    graze(sim, 1);
    hover(sim, 30); // back toward the middle area
    const t0 = sim.t;
    hover(sim, Math.ceil((EDGE_WINDOW_S + 0.05) / DT));
    expect(sim.t - t0).toBeGreaterThan(EDGE_WINDOW_S);
    expect(sim.edge).toBe(0);
    graze(sim, 1);
    expect(sim.edge).toBe(1);
  });

  it('a near miss 1.9 s after the last one keeps the combo', () => {
    const sim = shaft();
    const a = graze(sim, 1);
    hover(sim, Math.round(1.2 / DT));
    const b = graze(sim, -1);
    expect((b - a) * DT).toBeLessThan(EDGE_WINDOW_S);
    expect(sim.edge).toBe(2);
  });
});

describe('clone keeps everything the continue path needs', () => {
  it('gems, edge, style and an open near miss carry over', () => {
    const b = new TrackBuilder({ speed: 500 }).straight(300, 150);
    b.addGem(360, 200);
    const track = b.straight(4000, 150).finish();
    const sim = new RunSim(track);
    hover(sim, 60); // takes the gem at y=200
    expect(sim.gemsTaken).toBe(1);
    graze(sim, 1);
    // Now dive into a second graze and clone while inside it (clearance below NEAR_PX).
    let held = false;
    while (sim.clearance >= NEAR_PX) sim.step(held);
    held = true;
    const c = sim.clone();
    expect([c.isTaken(0), c.gemsTaken, c.edge, c.style]).toEqual([true, 1, sim.edge, sim.style]);
    let ea = -1;
    let eb = -1;
    for (let k = 0; k < 300; k++) {
      if (sim.clearance < 5) held = true;
      if (ea < 0 && sim.step(held).nearMiss) ea = k;
      if (eb < 0 && c.step(held).nearMiss) eb = k;
    }
    expect(ea).toBeGreaterThanOrEqual(0);
    expect(eb).toBe(ea);
    expect(c.style).toBe(sim.style);
  });
});

describe('hazard shapes', () => {
  it('a block is a diamond of half-diagonal s (tips and faces exact)', () => {
    expect(diamondSdf(100 + 40 + 3, 50, 100, 50, 40)).toBeCloseTo(3, 9); // beyond the right tip
    expect(diamondSdf(100, 50 + 40 - 2, 100, 50, 40)).toBeCloseTo(-2 * Math.SQRT1_2, 9); // inside, near the top tip
    const face = 40 * Math.SQRT1_2; // distance of a face from the centre
    expect(diamondSdf(100 + (face + 5) * Math.SQRT1_2, 50 + (face + 5) * Math.SQRT1_2, 100, 50, 40)).toBeCloseTo(5, 9);
  });

  it('a spark grazing a block tip lives at r + 0.5 and dies at r - 0.5', () => {
    for (const [gap, alive] of [[SPARK_R + 0.5, true], [SPARK_R - 0.5, false]] as const) {
      const track = new TrackBuilder({ speed: 500 }).straight(800, 320).addBlock(360, 400, 40).straight(1200, 320).finish();
      const sim = new RunSim(track, { startX: 360 + 40 + gap });
      // Hold x still: alternate right/left each tick, starting right so x never goes nearer.
      for (let k = 0; k < 200 && sim.alive; k++) sim.step(k % 2 === 0);
      expect(sim.alive, `gap ${gap}`).toBe(alive);
    }
  });

  it('a bar is a capsule of radius `thick` around a segment centred at x0 + amp·sin(2πt/period + phase)', () => {
    const bar: Bar = { y: 500, x0: 360, amp: 100, period: 2, phase: 0, half: 60, thick: 12 };
    expect(barCentre(bar, 0.5)).toBeCloseTo(460, 9); // quarter period
    expect(barCentre(bar, 1.5)).toBeCloseTo(260, 9);
    expect(barCentre({ ...bar, phase: Math.PI / 2 }, 0)).toBeCloseTo(460, 9);
    expect(barSdf(460, 500 + 12 + 3, bar, 0.5)).toBeCloseTo(3, 9); // above the middle
    expect(barSdf(460 + 60 + 12 + 4, 500, bar, 0.5)).toBeCloseTo(4, 9); // beyond the end cap
    expect(barSdf(460, 500 + 5, bar, 0.5)).toBeCloseTo(-7, 9);
  });
});

describe('speed profile', () => {
  it('creeps with height and stops at the cap', () => {
    const s = { base: 480, creep: 0.0035, max: 650 };
    expect(baseSpeed(s, 0)).toBe(480);
    expect(baseSpeed(s, 10000)).toBeCloseTo(515, 9);
    expect(baseSpeed(s, 1e6)).toBe(650);
  });

  it('the launch ramp starts at RAMP_START of full speed and reaches it at RAMP_PX', () => {
    const s = { base: 500, creep: 0, max: 500, ramp: true };
    expect(baseSpeed(s, 0)).toBeCloseTo(500 * RAMP_START, 9);
    expect(baseSpeed(s, RAMP_PX / 2)).toBeCloseTo(500 * (RAMP_START + (1 - RAMP_START) / 2), 9);
    expect(baseSpeed(s, RAMP_PX)).toBe(500);
  });
});

describe('the opening forgives anything', () => {
  const inputs: [string, (k: number, rng: () => number) => boolean][] = [
    ['always held', () => true],
    ['never held', () => false],
    ['random taps', (_k, r) => r() < 0.5],
  ];
  const tracks = [...Array.from({ length: LEVEL_COUNT }, (_, i) => [`level ${i + 1}`, buildLevel(i + 1)] as const), ['endless', buildEndless(9, { segments: 4 }).track] as const];
  it('nothing can kill in the first 1.5 s of any level or endless, whatever the input', () => {
    for (const [name, track] of tracks) {
      for (const [label, input] of inputs) {
        const rng = createRng(4);
        const sim = new RunSim(track);
        for (let k = 0; k < Math.round(1.5 / DT); k++) sim.step(input(k, () => rng.next()));
        expect(sim.alive, `${name}, ${label}`).toBe(true);
      }
    }
  });
});

describe('endless is endless', () => {
  it('a longer build of the same seed contains the shorter one as a prefix (it can grow ahead)', () => {
    const a = buildEndless(77, { segments: 20 });
    const b = buildEndless(77, { segments: 40 });
    const end = a.joins[19]!;
    const n = Array.from(a.track.wy).findIndex((y) => y > end);
    expect(Array.from(b.track.wy).slice(0, n)).toEqual(Array.from(a.track.wy).slice(0, n));
    expect(Array.from(b.track.lx).slice(0, n)).toEqual(Array.from(a.track.lx).slice(0, n));
    expect(b.track.bars.filter((x) => x.y < end)).toEqual(a.track.bars.filter((x) => x.y < end));
    expect(b.track.gems.filter((x) => x.y < end)).toEqual(a.track.gems.filter((x) => x.y < end));
  });

  it('a run switched onto the longer track carries on unchanged', () => {
    const a = buildEndless(5, { segments: 6 }).track;
    const b = buildEndless(5, { segments: 12 }).track;
    const s1 = new RunSim(a);
    const s2 = new RunSim(b);
    for (let k = 0; k < 200; k++) {
      s1.step(k % 40 < 20);
      s2.step(k % 40 < 20);
    }
    s1.setTrack(b);
    for (let k = 0; k < 200; k++) {
      s1.step(k % 40 < 20);
      s2.step(k % 40 < 20);
    }
    expect([s1.x, s1.y, s1.alive, s1.gemsTaken]).toEqual([s2.x, s2.y, s2.alive, s2.gemsTaken]);
  });

  it('tracks gems past index 31 (no 32-bit mask)', () => {
    const b = new TrackBuilder({ speed: 500 }).straight(100, 300);
    for (let i = 0; i < 40; i++) b.addGem(360, 200 + i * 40);
    const track = b.straight(2000, 300).finish();
    const sim = new RunSim(track);
    hover(sim, 600);
    expect(sim.gemsTaken).toBe(40);
    expect(sim.isTaken(39)).toBe(true);
  });
});
