import { describe, expect, it } from 'vitest';
import { TrackBuilder } from '../../src/sim/builder';
import { DT, SPARK_R } from '../../src/sim/constants';
import { RunSim } from '../../src/sim/run';
import { analyse, kinematics, prepare, reactionWindow, replay, safetyMargin, solve, K_REF } from '../../src/sim/solver';

describe('kinematics timeline', () => {
  it('matches a RunSim tick for tick (y never depends on input)', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(512, 300).gate('fast').straight(800, 300).gate('slow').straight(800, 300).finish();
    const tl = kinematics(track);
    const sim = new RunSim(track);
    for (let j = 0; j < tl.n; j++) {
      expect(sim.y).toBe(tl.y[j]);
      sim.step(j % 2 === 0);
    }
    expect(sim.finished).toBe(true);
    expect(tl.y[tl.n]).toBeGreaterThanOrEqual(track.length);
  });
});

describe('solve', () => {
  it('finds a finishing plan through an open shaft, and the plan replays to the finish', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(3000, 200).finish();
    const plan = solve(track, { minClear: 0, minHoldTicks: K_REF });
    expect(plan).not.toBeNull();
    const r = replay(track, plan!.held);
    expect(r.finished).toBe(true);
  });

  it('returns null for an impossible track (corridor narrower than the spark)', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(400, 200).straight(600, SPARK_R - 3).straight(400, 200).finish();
    expect(solve(track, { minClear: 0, minHoldTicks: 1 })).toBeNull();
  });

  it('honours the minimum hold: every input interval in the plan is at least K ticks', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(6, 260, 90).straight(300, 200).finish();
    const plan = solve(track, { minClear: 0, minHoldTicks: 20 })!;
    expect(plan).not.toBeNull();
    const r = replay(track, plan.held);
    expect(r.finished).toBe(true);
    expect(r.minInterval).toBeGreaterThanOrEqual(20);
  });

  it('the replayed clearance is never below the requested minimum', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(4, 300, 100).slalom(4, 400, 200, 150).finish();
    const plan = solve(track, { minClear: 12, minHoldTicks: K_REF })!;
    expect(plan).not.toBeNull();
    expect(replay(track, plan.held).minClear).toBeGreaterThanOrEqual(12);
  });

  it('can be required to start held (a run that begins with a finger already down)', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(4, 300, 100).finish();
    const plan = solve(track, { minClear: 0, minHoldTicks: K_REF, startHeld: 1 })!;
    expect(plan.held[0]).toBe(1);
    expect(replay(track, plan.held).finished).toBe(true);
    const plan0 = solve(track, { minClear: 0, minHoldTicks: K_REF, startHeld: 0 })!;
    expect(plan0.held[0]).toBe(0);
  });

  it('can plan from a mid-run state (re-planning after an off-plan input)', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(200, 220).zig(4, 300, 100).straight(300, 220).finish();
    const p = prepare(track);
    // Play 20 ticks held (off any plan), then plan the rest from where the spark really is.
    // (After 40 held ticks it is only recoverable with sub-100 ms taps, and the solver says so.)
    const sim = new RunSim(track);
    for (let j = 0; j < 20; j++) sim.step(true);
    const rest = solve(p, { minClear: 0, minHoldTicks: K_REF, from: { tick: sim.tick, x: sim.x, held: 1 } })!;
    expect(rest).not.toBeNull();
    expect(rest.held.subarray(0, 20).every((h) => h === 1)).toBe(true);
    // The first K_REF ticks after the hand-over keep the current input (it has just been pressed).
    expect(rest.held.subarray(20, 20 + K_REF).every((h) => h === 1)).toBe(true);
    for (let j = 20; j < rest.held.length && sim.alive && !sim.finished; j++) sim.step(rest.held[j] === 1);
    expect(sim.finished).toBe(true);
  });

  it('from a state held long enough, the plan may switch at once', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(1200, 120).finish();
    const sim = new RunSim(track);
    for (let j = 0; j < 20; j++) sim.step(true); // x = 360 + 83: 24 px from the right wall
    const p = prepare(track);
    expect(solve(p, { minClear: 0, minHoldTicks: K_REF, from: { tick: 20, x: sim.x, held: 1, since: 1 } })).toBeNull();
    const r = solve(p, { minClear: 0, minHoldTicks: K_REF, from: { tick: 20, x: sim.x, held: 1, since: 20 } })!;
    expect(r).not.toBeNull();
    expect(r.held[20]).toBe(0);
  });

  it('can be required to take every gem, and the replay takes them', () => {
    const b = new TrackBuilder({ speed: 500 }).straight(300, 220);
    b.addGem(200, 700).addGem(520, 1300).addGem(300, 1900);
    const track = b.straight(2400, 220).finish();
    const plan = solve(track, { minClear: 0, minHoldTicks: K_REF, gems: true })!;
    expect(plan).not.toBeNull();
    const r = replay(track, plan.held);
    expect(r.finished).toBe(true);
    expect(r.gems).toBe(3);
  });
});

describe('windowed planning (endless autopilot)', () => {
  it('plans a window ahead from a mid-run state and the window replays alive', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(300, 220).zig(12, 260, 110).slalom(5, 420, 200, 160).straight(300, 220).finish();
    const sim = new RunSim(track);
    for (let j = 0; j < 100; j++) sim.step(j % 30 < 15);
    const p = prepare(track, { fromTick: sim.tick, toTick: sim.tick + 600 });
    expect(p.tl.n).toBe(sim.tick + 600);
    const plan = solve(p, { minClear: 2, minHoldTicks: K_REF, from: { tick: sim.tick, x: sim.x, held: 0, since: 15 } })!;
    expect(plan).not.toBeNull();
    for (let j = sim.tick; j < plan.held.length; j++) sim.step(plan.held[j] === 1);
    expect(sim.alive).toBe(true);
    expect(sim.tick).toBe(700);
  });
});

describe('comfort line (sum objective)', () => {
  it('stays near the middle of a wide straight instead of skimming the walls', () => {
    const track = new TrackBuilder({ speed: 500 }).straight(2400, 260).finish();
    const plan = solve(track, { minClear: 0, minHoldTicks: K_REF, comfort: { cap: 200, switchCost: 2 } })!;
    expect(plan).not.toBeNull();
    const sim = new RunSim(track);
    let minClr = Infinity;
    for (let j = 0; j < plan.held.length && sim.alive && !sim.finished; j++) {
      sim.step(plan.held[j] === 1);
      minClr = Math.min(minClr, sim.clearance);
    }
    expect(sim.finished).toBe(true);
    expect(minClr).toBeGreaterThan(150); // half-width 260 - radius 13: the middle keeps ~200+
  });
});

describe('difficulty metrics', () => {
  it('safety margin of a 45° corridor is its perpendicular half-width minus the radius', () => {
    // Horizontal half-width 100 at 45°: perpendicular half-width 100/√2 ≈ 70.7. Corner switches
    // land on whole ticks (≤ ½·v·DT ≈ 2.1 px late or early) and bins cost ≤ 1 px.
    const track = new TrackBuilder({ speed: 500, startH: 100 }).diag(220, -1).diag(440, 1).diag(440, -1).finish(200);
    const m = safetyMargin(track);
    expect(m).toBeGreaterThan(100 / Math.SQRT2 - SPARK_R - 3.5);
    expect(m).toBeLessThanOrEqual(100 / Math.SQRT2 - SPARK_R + 0.01);
  });

  it('reaction window of a tight zigzag is about one leg of travel', () => {
    // Legs of 240 px at 500 px/s: a turn every 0.48 s; the slack of a tight corridor adds little.
    const track = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(6, 240, 40).straight(300, 200).finish();
    const ms = reactionWindow(track);
    expect(ms).toBeGreaterThan(440);
    expect(ms).toBeLessThan(560);
  });

  it('a narrower corridor gives a smaller margin; shorter legs give a smaller window', () => {
    const wide = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(4, 300, 110).finish();
    const narrow = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(4, 300, 70).finish();
    expect(safetyMargin(narrow)).toBeLessThan(safetyMargin(wide));
    const long = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(6, 320, 50).finish();
    const short = new TrackBuilder({ speed: 500 }).straight(200, 200).zig(6, 200, 50).finish();
    expect(reactionWindow(short)).toBeLessThan(reactionWindow(long));
  });

  it('analyse returns both numbers and a plan that finishes with all gems', () => {
    const b = new TrackBuilder({ speed: 500 }).straight(300, 220);
    b.addGem(260, 800);
    const track = b.zig(3, 300, 100).straight(400, 200).finish();
    const a = analyse(track);
    expect(a.marginPx).toBeGreaterThan(0);
    expect(a.windowMs).toBeGreaterThan(0);
    expect(replay(track, a.plan.held).finished).toBe(true);
    expect(replay(track, a.gemPlan!.held).gems).toBe(1);
    void DT;
  });
});
