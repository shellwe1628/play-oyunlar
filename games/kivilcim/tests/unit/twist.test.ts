import { describe, expect, it } from 'vitest';
import { TrackBuilder } from '../../src/sim/builder';
import { SHAFT_W } from '../../src/sim/constants';
import { buildEndless, DIVE_TWIST, TWIST_MAX_Q } from '../../src/sim/endless';
import { buildLevel, buildLevelParts, CRUX_Q, LEVEL_COUNT, levelInfo } from '../../src/sim/levels';
import { TWIST_H } from '../../src/sim/patterns';
import { RunSim } from '../../src/sim/run';
import { K_REF, kinematics, prepare, solve } from '../../src/sim/solver';
import { segmentAt, TWIST_KINDS, wallXAt, type Track, type Twist, type TwistKind } from '../../src/sim/track';
import {
  AHEAD_STEP,
  BASE_AHEAD,
  BASE_CLEAR,
  CALM_ROCK,
  CUE_LEAD,
  DIVE_Y,
  holdVector,
  lookahead,
  MAX_ROLL_DPS,
  MAX_TILT,
  MIN_AHEAD_S,
  MIN_CLEAR_S,
  mirrored,
  NORMAL_POSE,
  poseAt,
  poseMatrix,
  project,
  SIDE_X,
  SPARK_Y,
  twistCues,
  twistWeight,
  viewRange,
  type Pose,
} from '../../src/sim/twist';

const VORTEX = Array.from({ length: 10 }, (_, i) => 41 + i);
const isNormal = (p: Pose): boolean => p.flip === 1 && p.fold === 1 && p.tilt === 0 && p.zoom === 1;
const tw = (kind: TwistKind, amount = 0, y0 = 1000, y1 = 5000, ease = 500, period = 3000): Twist => ({ kind, y0, y1, ease, amount, period });

/** FNV hash of a run on `track` under input `held`, the way the scene hashes its sim. */
function runHash(track: Track, held: Uint8Array): { hash: number; ticks: number; finished: boolean; gems: number } {
  const sim = new RunSim(track);
  let h = 2166136261;
  for (let j = 0; j < held.length && sim.alive && !sim.finished; j++) {
    sim.step(held[j] === 1);
    h = Math.imul(h ^ Math.round(sim.x * 1000) ^ (sim.tick << 8) ^ (sim.alive ? 0 : 0x55555), 16777619) >>> 0;
  }
  return { hash: h, ticks: sim.tick, finished: sim.finished, gems: sim.gemsTaken };
}

describe('view poses', () => {
  it('the normal pose is the view the game always had: screen = (x, SPARK_Y - (y - ry))', () => {
    const m = poseMatrix(NORMAL_POSE);
    const p = project(NORMAL_POSE, m, 123, 5400, 5000, { x: 0, y: 0 });
    expect(p).toEqual({ x: 123, y: SPARK_Y - 400 });
    expect(isNormal(poseAt([], 1234))).toBe(true);
    expect(isNormal(poseAt([tw('dive')], 999))).toBe(true);
    expect(isNormal(poseAt([tw('dive')], 5001))).toBe(true);
  });

  it('normal lookahead: to the screen edge and to the HUD band (the base every twist must match)', () => {
    const t = buildLevel(1);
    const a = lookahead(t, NORMAL_POSE, 4000);
    expect(a.edge).toBeGreaterThan(BASE_AHEAD - AHEAD_STEP);
    expect(a.edge).toBeLessThanOrEqual(BASE_AHEAD);
    expect(a.clear).toBeGreaterThan(BASE_CLEAR - AHEAD_STEP);
    expect(a.clear).toBeLessThanOrEqual(BASE_CLEAR);
  });

  it('dive: the spark flies down the screen and hold still goes to the right', () => {
    const p = poseAt([tw('dive')], 3000);
    expect(p.flip).toBe(-1);
    expect(p.ay).toBe(DIVE_Y);
    const m = poseMatrix(p);
    const ahead = project(p, m, 360, 3100, 3000, { x: 0, y: 0 });
    expect(ahead.y).toBeGreaterThan(p.ay); // further along the flight = lower on the screen
    expect(ahead.x).toBeCloseTo(360, 9);
    const right = project(p, m, 460, 3000, 3000, { x: 0, y: 0 });
    expect(right.x).toBeGreaterThan(360); // sim right is still screen right
    const hold = holdVector(p);
    expect(hold.x).toBeGreaterThan(0);
    expect(hold.y).toBeGreaterThan(0); // down-right
    expect(mirrored(p)).toBe(true);
  });

  it('side: the spark flies to the right and hold goes up; no rotation on the way (a mirror fold)', () => {
    const p = poseAt([tw('side')], 3000);
    expect(p.fold).toBe(-1);
    expect(p.ax).toBe(SIDE_X);
    const m = poseMatrix(p);
    const ahead = project(p, m, 360, 3100, 3000, { x: 0, y: 0 });
    expect(ahead.x).toBeGreaterThan(p.ax);
    expect(ahead.y).toBeCloseTo(p.ay, 9);
    const hold = holdVector(p);
    expect(hold.x).toBeGreaterThan(0);
    expect(hold.y).toBeLessThan(0); // up and forward
    // Half way through the fold the matrix is symmetric (a squash along one diagonal, no turn).
    const mid = poseMatrix(poseAt([tw('side')], 1250));
    expect(mid.b).toBeCloseTo(mid.c, 9);
    expect(mirrored(poseAt([tw('side')], 1100))).toBe(false);
  });

  it('lean: the far end leans the way the sign says, the shaft is zoomed to stay on screen', () => {
    const p = poseAt([tw('tilt', 10)], 3000);
    expect(p.tilt).toBe(10);
    expect(p.zoom).toBeLessThan(1);
    const m = poseMatrix(p);
    const far = project(p, m, 360, 3900, 3000, { x: 0, y: 0 });
    const here = project(p, m, 360, 3000, 3000, { x: 0, y: 0 });
    expect(far.x).toBeGreaterThan(here.x);
    // Both ends of the lookahead are inside the screen for a wall at the shaft's edge.
    for (const x of [26, 694]) for (const y of [3000, 3000 + BASE_AHEAD]) expect(project(p, m, x, y, 3000, { x: 0, y: 0 }).x, `${x},${y}`).toBeGreaterThanOrEqual(0);
    for (const x of [26, 694]) for (const y of [3000, 3000 + BASE_AHEAD]) expect(project(p, m, x, y, 3000, { x: 0, y: 0 }).x, `${x},${y}`).toBeLessThanOrEqual(720);
    expect(poseAt([tw('tilt', -10)], 3000).tilt).toBe(-10);
  });

  it('eases are smooth and symmetric; a twist is fully on between them', () => {
    const t = tw('far', 0.8);
    expect(twistWeight(t, 1000)).toBe(0);
    expect(twistWeight(t, 1250)).toBeCloseTo(0.5, 9);
    expect(twistWeight(t, 1500)).toBe(1);
    expect(twistWeight(t, 3000)).toBe(1);
    expect(twistWeight(t, 4750)).toBeCloseTo(0.5, 9);
    expect(twistWeight(t, 5000)).toBe(0);
    let prev = 0;
    for (let y = 1000; y <= 1500; y += 5) {
      const w = twistWeight(t, y);
      expect(w).toBeGreaterThanOrEqual(prev);
      expect(w - prev).toBeLessThan(0.02); // never a snap
      prev = w;
    }
  });

  it('reduced motion: twists switch instead of moving, and a rocking twist is a fixed lean', () => {
    const t = tw('rock', 8);
    const poses = new Set<number>();
    for (let y = 900; y <= 5100; y += 3) poses.add(poseAt([t], y, true).tilt);
    expect([...poses].sort((a, b) => a - b)).toEqual([0, 8 * CALM_ROCK]);
    const d = tw('dive');
    const flips = new Set<number>();
    for (let y = 900; y <= 5100; y += 3) flips.add(poseAt([d], y, true).flip);
    expect([...flips].sort((a, b) => a - b)).toEqual([-1, 1]);
    // ... and it switches in the middle of the ease, where the gate is drawn.
    expect(poseAt([d], 1249, true).flip).toBe(1);
    expect(poseAt([d], 1251, true).flip).toBe(-1);
  });

  it('the culling range covers what a pose can show, within what the chunk pool holds', () => {
    expect(viewRange(NORMAL_POSE)).toEqual({ below: 380, above: 1000 });
    for (const p of [poseAt([tw('dive')], 3000), poseAt([tw('side')], 3000), poseAt([tw('far', 0.8)], 3000), poseAt([tw('tilt', 12)], 3000), poseAt([tw('dive')], 1250)]) {
      const r = viewRange(p);
      expect(r.below).toBeGreaterThanOrEqual(380);
      expect(r.below).toBeLessThanOrEqual(900);
      expect(r.above).toBeGreaterThanOrEqual(1000);
      expect(r.above).toBeLessThanOrEqual(2300);
    }
  });
});

describe('twists are presentation only', () => {
  it('a level with its twists removed is the same track to the sim, the solver and a run', () => {
    for (const id of [41, 44, 47, 50]) {
      const track = buildLevel(id);
      expect(track.twists.length, `level ${id}`).toBeGreaterThan(0);
      const bare: Track = { ...track, twists: [] };
      const plan = solve(prepare(track), { minClear: 4, minHoldTicks: K_REF, gems: true })!;
      const planBare = solve(prepare(bare), { minClear: 4, minHoldTicks: K_REF, gems: true })!;
      expect(plan, `level ${id}`).not.toBeNull();
      expect(Array.from(planBare.held), `level ${id}`).toEqual(Array.from(plan.held));
      const a = runHash(track, plan.held);
      const b = runHash(bare, plan.held);
      expect(a.finished, `level ${id}`).toBe(true);
      expect(b, `level ${id}`).toEqual(a);
    }
  });

  it('the sim files never import the view module (twist.ts is read by the builder for ease lengths only)', async () => {
    const fs = await import('node:fs');
    const url = await import('node:url');
    for (const f of ['run.ts', 'solver.ts', 'human.ts', 'track.ts']) {
      const src = fs.readFileSync(url.fileURLToPath(new URL(`../../src/sim/${f}`, import.meta.url)), 'utf8');
      expect(src.includes("from './twist'"), f).toBe(false);
      expect(/\.twists\b/.test(src), f).toBe(false);
    }
  });

  it('levels 1-40 have no twists; endless and daily have none below 300 m and are the same shaft with or without them', () => {
    for (let id = 1; id <= 40; id++) expect(buildLevel(id).twists, `level ${id}`).toEqual([]);
    for (const seed of [1, 7, 99, 12345]) {
      const a = buildEndless(seed, { segments: 40 });
      const b = buildEndless(seed, { segments: 40, twists: false });
      expect(b.track.twists).toEqual([]);
      expect(Array.from(a.track.lx)).toEqual(Array.from(b.track.lx));
      expect(Array.from(a.track.rx)).toEqual(Array.from(b.track.rx));
      expect(a.track.blocks).toEqual(b.track.blocks);
      expect(a.track.bars).toEqual(b.track.bars);
      expect(a.track.gates).toEqual(b.track.gates);
      expect(a.track.gems).toEqual(b.track.gems);
      for (const t of a.track.twists) {
        expect(t.y0, `seed ${seed}`).toBeGreaterThanOrEqual(3000);
        expect(['tilt', 'rock', 'far'], `seed ${seed}`).toContain(t.kind);
      }
    }
  });

  it('endless twist stretches are a function of the seed (the daily shaft is the same for everyone)', () => {
    const a = buildEndless(20261122, { segments: 60 });
    const b = buildEndless(20261122, { segments: 60 });
    expect(a.track.twists).toEqual(b.track.twists);
    // A longer build of the same seed keeps the twists it already had (the run grows ahead).
    const longer = buildEndless(20261122, { segments: 120 });
    expect(longer.track.twists.slice(0, a.track.twists.length)).toEqual(a.track.twists);
    let some = 0;
    for (let seed = 1; seed <= 20; seed++) some += buildEndless(seed, { segments: 60 }).track.twists.length;
    expect(some).toBeGreaterThan(30);
  });

  it('endless twist stretches keep the lookahead, roll slowly and never touch a gate block', () => {
    let stretches = 0;
    let worstRoll = 0;
    let lowEdge = Infinity;
    let lowClear = Infinity;
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      for (const dive of [false, true]) {
        const { track, joins, gated, kinds, qs } = buildEndless(seed, { segments: 60, dive });
        const stretchesHere = track.twists.filter((t) => t.ease > 0);
        stretches += stretchesHere.length;
        for (const t of stretchesHere) {
          // Over one plain segment, with plain neighbours: no gate inside the stretch at all.
          expect(track.gates.filter((g) => g.y >= t.y0 && g.y <= t.y1), `seed ${seed}`).toEqual([]);
          const i = joins.findIndex((y) => y > t.y0 + t.ease / 2 + 1);
          expect([gated[i - 1], gated[i], gated[i + 1]], `seed ${seed} segment ${i}`).toEqual([false, false, false]);
          // Never on a crux: not a needle or a rhythm run (nor beside one), nothing above 0.6 difficulty.
          expect(['needle', 'rhythm'], `seed ${seed} segment ${i} is a ${kinds[i]}`).not.toContain(kinds[i]);
          expect(['needle', 'rhythm'], `seed ${seed} segment ${i - 1}`).not.toContain(kinds[i - 1]);
          expect(['needle', 'rhythm'], `seed ${seed} segment ${i + 1}`).not.toContain(kinds[i + 1]);
          expect(qs[i], `seed ${seed} segment ${i}`).toBeLessThanOrEqual(TWIST_MAX_Q);
          // The stretch is that one segment: it eases in around the join before and out around the join after.
          expect(t.y0 + t.ease / 2, `seed ${seed}`).toBeCloseTo(i === 0 ? t.y0 + t.ease / 2 : joins[i - 1]!, 6);
          expect(t.y1 - t.ease / 2, `seed ${seed}`).toBeCloseTo(joins[i]!, 6);
          expect(Math.abs(t.kind === 'far' ? 0 : t.amount), `seed ${seed}`).toBeLessThanOrEqual(MAX_TILT);
        }
        const tl = kinematics(track);
        const pose = { ...NORMAL_POSE };
        const a = { edge: 0, clear: 0 };
        let prevTilt = 0;
        for (let j = 0; j <= tl.n; j += 3) {
          const y = tl.y[j]!;
          if (!stretchesHere.some((t) => y >= t.y0 - 20 && y <= t.y1 + 20)) {
            prevTilt = 0;
            continue;
          }
          poseAt(track.twists, y, false, pose);
          lookahead(track, pose, y, a);
          lowEdge = Math.min(lowEdge, a.edge);
          lowClear = Math.min(lowClear, a.clear);
          worstRoll = Math.max(worstRoll, (Math.abs(pose.tilt - prevTilt) * 120) / 3);
          prevTilt = pose.tilt;
        }
      }
    }
    console.warn(`endless twist stretches (8 seeds x 60 segments, plain and dive): ${stretches} stretches, lowest lookahead ${lowEdge} px (clear ${lowClear} px), fastest roll ${worstRoll.toFixed(1)} deg/s`);
    expect(stretches).toBeGreaterThan(20);
    expect(lowEdge).toBeGreaterThan(BASE_AHEAD - AHEAD_STEP);
    expect(lowClear).toBeGreaterThan(BASE_CLEAR - AHEAD_STEP);
    expect(worstRoll).toBeLessThanOrEqual(MAX_ROLL_DPS + 0.5);
  });

  it('dive mode is the endless generator under one dive twist from start to end', () => {
    const d = buildEndless(5, { segments: 30, dive: true });
    const e = buildEndless(5, { segments: 30 });
    expect(Array.from(d.track.lx)).toEqual(Array.from(e.track.lx));
    expect(d.track.twists[0]).toEqual(DIVE_TWIST);
    expect(poseAt(d.track.twists, 0).flip).toBe(-1);
    expect(poseAt(d.track.twists, 123456).flip).toBe(-1);
    expect(d.track.twists.filter((t) => t.kind === 'side')).toEqual([]);
  });
});

/** Per level: the lowest lookahead under each twist kind, in px and in seconds at that speed. */
interface Low {
  edgePx: number;
  clearPx: number;
  edgeS: number;
  clearS: number;
  roll: number;
  zoom: number;
  /** The same lookahead with the twist fully on (the eases start and end at the normal view). */
  fullEdgePx: number;
  fullClearPx: number;
}

function survey(track: Track): Map<string, Low> {
  const tl = kinematics(track);
  const out = new Map<string, Low>();
  const pose = { ...NORMAL_POSE };
  const prev = { ...NORMAL_POSE };
  const a = { edge: 0, clear: 0 };
  for (let j = 0; j <= tl.n; j += 2) {
    const y = tl.y[j]!;
    poseAt(track.twists, y, false, pose);
    const on = track.twists.filter((t) => y >= t.y0 && y <= t.y1);
    const kinds = on.map((t) => t.kind);
    const full = on.every((t) => twistWeight(t, y) === 1);
    if (!kinds.length) {
      Object.assign(prev, pose);
      continue;
    }
    lookahead(track, pose, y, a);
    const v = tl.v[j]!;
    const roll = j >= 2 ? (Math.abs(pose.tilt - prev.tilt) * 120) / 2 : 0;
    Object.assign(prev, pose);
    for (const k of kinds) {
      const lo = out.get(k) ?? { edgePx: Infinity, clearPx: Infinity, edgeS: Infinity, clearS: Infinity, roll: 0, zoom: Infinity, fullEdgePx: Infinity, fullClearPx: Infinity };
      if (full) {
        lo.fullEdgePx = Math.min(lo.fullEdgePx, a.edge);
        lo.fullClearPx = Math.min(lo.fullClearPx, a.clear);
      }
      lo.edgePx = Math.min(lo.edgePx, a.edge);
      lo.clearPx = Math.min(lo.clearPx, a.clear);
      lo.edgeS = Math.min(lo.edgeS, a.edge / v);
      lo.clearS = Math.min(lo.clearS, a.clear / v);
      lo.roll = Math.max(lo.roll, roll);
      lo.zoom = Math.min(lo.zoom, pose.zoom);
      out.set(k, lo);
    }
  }
  return out;
}

describe('world 5: the twists on levels 41-50', () => {
  const parts = new Map(VORTEX.map((id) => [id, buildLevelParts(id)]));

  it('every level has twists, all of them closed, in order, and none is flipped two ways at once', () => {
    for (const id of VORTEX) {
      const { track } = parts.get(id)!;
      expect(track.twists.length, `level ${id}`).toBeGreaterThanOrEqual(2);
      for (const t of track.twists) {
        expect(Number.isFinite(t.y1), `level ${id} ${t.kind}`).toBe(true);
        expect(t.y1 - t.y0, `level ${id} ${t.kind}`).toBeGreaterThan(2 * t.ease + 600);
        if (t.kind === 'tilt' || t.kind === 'rock') expect(Math.abs(t.amount), `level ${id}`).toBeLessThanOrEqual(MAX_TILT);
        if (t.kind === 'far') expect(t.amount).toBeLessThan(1);
        if (t.kind === 'near') expect(t.amount).toBeGreaterThan(1);
      }
      const flips = track.twists.filter((t) => t.kind === 'dive' || t.kind === 'side');
      for (let i = 1; i < flips.length; i++) expect(flips[i]!.y0, `level ${id}`).toBeGreaterThanOrEqual(flips[i - 1]!.y1);
      // Side is never combined with a lean (the shaft would leave the screen) or a dark section.
      for (const s of track.twists.filter((t) => t.kind === 'side')) {
        for (const o of track.twists) if (o !== s && o.kind !== 'far') expect(o.y1 <= s.y0 || o.y0 >= s.y1, `level ${id} side with ${o.kind}`).toBe(true);
        for (const z of track.darks) expect(z.y1 <= s.y0 || z.y0 >= s.y1, `level ${id} dark in side`).toBe(true);
      }
    }
  });

  it('every change of view happens in a calm chamber: wide, straight, empty, no gate', () => {
    for (const id of VORTEX) {
      const { track: t } = parts.get(id)!;
      for (const twist of t.twists) {
        for (const [a, b] of [
          [twist.y0, twist.y0 + twist.ease],
          [twist.y1 - twist.ease, twist.y1],
        ] as const) {
          const what = `level ${id} ${twist.kind} ${Math.round(a)}..${Math.round(b)}`;
          for (let y = a; y <= b; y += 20) {
            const i = segmentAt(t.wy, y);
            expect(wallXAt(t.wy, t.lx, i, y), what).toBeCloseTo(SHAFT_W / 2 - TWIST_H, 6);
            expect(wallXAt(t.wy, t.rx, i, y), what).toBeCloseTo(SHAFT_W / 2 + TWIST_H, 6);
          }
          const pad = 120;
          const inY = (y: number): boolean => y > a - pad && y < b + pad;
          expect(t.blocks.filter((o) => inY(o.y)), what).toEqual([]);
          expect(t.bars.filter((o) => inY(o.y)), what).toEqual([]);
          expect(t.pills.filter((o) => inY(o.y + o.hl) || inY(o.y - o.hl)), what).toEqual([]);
          expect(t.lasers.filter((o) => inY(o.y)), what).toEqual([]);
          expect(t.spinners.filter((o) => inY(o.y + o.len) || inY(o.y - o.len)), what).toEqual([]);
          expect(t.portals.filter((o) => inY(o.y)), what).toEqual([]);
          expect(t.gates.filter((o) => inY(o.y)), what).toEqual([]);
          expect(t.gems.filter((o) => inY(o.y)), what).toEqual([]);
          for (const z of [...t.winds, ...t.mirrors]) expect(z.y1 < a || z.y0 > b, what).toBe(true);
        }
      }
    }
  });

  it('no twist on the crux: the needle and the rhythm run are flown in the normal view', () => {
    for (const id of VORTEX) {
      const { track, ranges } = parts.get(id)!;
      const crux = ranges.filter((r) => (r.seg.k === 'needle' && r.seg.q === CRUX_Q[id - 1]) || r.seg.k === 'rhythm');
      expect(crux.length, `level ${id}`).toBe(2);
      for (const c of crux) {
        for (let y = c.y0 - 200; y <= c.y1 + 200; y += 40) expect(isNormal(poseAt(track.twists, y)), `level ${id} y ${y}`).toBe(true);
      }
      // ... and so is the launch and the finish.
      for (const y of [0, 400, 800, track.length - 800, track.length, track.length + 600]) expect(isNormal(poseAt(track.twists, y)), `level ${id} y ${y}`).toBe(true);
    }
  });

  it('lookahead under every twist is at least the normal view (zoom-in: at least the tightest existing view in time); roll stays slow', () => {
    const rows: string[] = [];
    const worst = new Map<string, Low>();
    for (const id of VORTEX) {
      const s = survey(parts.get(id)!.track);
      for (const [kind, lo] of s) {
        rows.push(
          `L${id} ${kind.padEnd(4)} lowest ahead ${String(Math.round(lo.edgePx)).padStart(5)} px ${lo.edgeS.toFixed(2)} s  clear of HUD ${String(Math.round(lo.clearPx)).padStart(5)} px ${lo.clearS.toFixed(2)} s  | fully on: ${String(Math.round(lo.fullEdgePx)).padStart(5)} px, clear ${String(Math.round(lo.fullClearPx)).padStart(5)} px  zoom ${lo.zoom.toFixed(2)}  roll ${lo.roll.toFixed(1)} deg/s`,
        );
        if (kind === 'near') {
          expect(lo.edgeS, `level ${id} near`).toBeGreaterThanOrEqual(MIN_AHEAD_S);
          expect(lo.clearS, `level ${id} near`).toBeGreaterThanOrEqual(MIN_CLEAR_S);
        }
        expect(lo.roll, `level ${id} ${kind}`).toBeLessThanOrEqual(MAX_ROLL_DPS + 0.5);
        const w = worst.get(kind) ?? { ...lo };
        w.edgePx = Math.min(w.edgePx, lo.edgePx);
        w.clearPx = Math.min(w.clearPx, lo.clearPx);
        w.edgeS = Math.min(w.edgeS, lo.edgeS);
        w.clearS = Math.min(w.clearS, lo.clearS);
        w.roll = Math.max(w.roll, lo.roll);
        w.zoom = Math.min(w.zoom, lo.zoom);
        w.fullEdgePx = Math.min(w.fullEdgePx, lo.fullEdgePx);
        w.fullClearPx = Math.min(w.fullClearPx, lo.fullClearPx);
        worst.set(kind, w);
      }
      // Wherever no zoom-in is active, the px rule holds outright.
      const { track } = parts.get(id)!;
      const tl = kinematics(track);
      const pose = { ...NORMAL_POSE };
      const a = { edge: 0, clear: 0 };
      for (let j = 0; j <= tl.n; j += 3) {
        const y = tl.y[j]!;
        if (track.twists.some((t) => t.kind === 'near' && y >= t.y0 && y <= t.y1)) continue;
        if (!track.twists.some((t) => y >= t.y0 && y <= t.y1)) continue;
        lookahead(track, poseAt(track.twists, y, false, pose), y, a);
        expect(a.edge, `level ${id} y ${Math.round(y)}`).toBeGreaterThan(BASE_AHEAD - AHEAD_STEP);
        expect(a.clear, `level ${id} y ${Math.round(y)}`).toBeGreaterThan(BASE_CLEAR - AHEAD_STEP);
      }
    }
    console.warn(
      `lookahead under twists (normal view: ${BASE_AHEAD} px to the edge, ${BASE_CLEAR} px clear of the HUD; tightest existing view in time: ${MIN_AHEAD_S.toFixed(2)} s / ${MIN_CLEAR_S.toFixed(2)} s)\n${rows.join('\n')}\nworst per twist:\n${[...worst]
        .map(([k, lo]) => `${k.padEnd(4)} lowest ahead ${Math.round(lo.edgePx)} px ${lo.edgeS.toFixed(2)} s  clear ${Math.round(lo.clearPx)} px ${lo.clearS.toFixed(2)} s  | fully on: ${Math.round(lo.fullEdgePx)} px, clear ${Math.round(lo.fullClearPx)} px  zoom ${lo.zoom.toFixed(2)}  roll ${lo.roll.toFixed(1)} deg/s`)
        .join('\n')}`,
    );
    expect([...worst.keys()].sort()).toEqual([...TWIST_KINDS].sort());
  });

  it('reduced motion: the same levels keep the lookahead with twists that switch instead of moving', () => {
    for (const id of VORTEX) {
      const { track } = parts.get(id)!;
      const tl = kinematics(track);
      const pose = { ...NORMAL_POSE };
      const a = { edge: 0, clear: 0 };
      let changes = 0;
      let last = '';
      for (let j = 0; j <= tl.n; j += 3) {
        const y = tl.y[j]!;
        poseAt(track.twists, y, true, pose);
        const key = `${pose.flip},${pose.fold},${pose.tilt},${pose.zoom}`;
        if (key !== last) changes++;
        last = key;
        if (isNormal(pose)) continue;
        lookahead(track, pose, y, a);
        const v = tl.v[j]!;
        const near = track.twists.some((t) => t.kind === 'near' && y >= t.y0 && y <= t.y1);
        if (near) expect(a.edge / v, `level ${id} y ${Math.round(y)}`).toBeGreaterThanOrEqual(MIN_AHEAD_S);
        else expect(a.edge, `level ${id} y ${Math.round(y)}`).toBeGreaterThan(BASE_AHEAD - AHEAD_STEP);
      }
      // Only switches: at most two per twist (in, out), plus the first pose.
      expect(changes, `level ${id}`).toBeLessThanOrEqual(2 * track.twists.length + 1);
    }
  });

  it('each twist is introduced alone on its own level, in the easier half of the world', () => {
    const family = (k: TwistKind): string => (k === 'tilt' || k === 'rock' ? 'lean' : k === 'far' || k === 'near' ? 'zoom' : k);
    const seen = new Set<TwistKind>();
    for (const id of VORTEX) {
      const { track } = parts.get(id)!;
      const kinds = new Set(track.twists.map((t) => t.kind));
      const intro = levelInfo(id).twists;
      for (const k of kinds) if (!seen.has(k)) expect(intro, `level ${id} shows ${k} first`).toContain(k);
      if (intro.length) {
        expect(id, `intro of ${intro.join('+')}`).toBeLessThanOrEqual(45);
        // Alone: only this family on the level, and no mechanic introduced with it.
        expect(new Set([...kinds].map(family)).size, `level ${id}`).toBe(1);
        expect(levelInfo(id).intro, `level ${id}`).toBeNull();
        for (const k of intro) expect(kinds.has(k), `level ${id} ${k}`).toBe(true);
      }
      for (const k of kinds) seen.add(k);
    }
    expect([...seen].sort()).toEqual([...TWIST_KINDS].sort());
    expect(LEVEL_COUNT).toBe(50);
  });

  it('a bare builder track has no twists (old test tracks are untouched)', () => {
    expect(new TrackBuilder({ speed: 500 }).straight(900, 200).finish().twists).toEqual([]);
  });
});

/** A twist is settled at y when it is fully off or fully on (nothing is easing). */
const settledAt = (twists: readonly Twist[], y: number): boolean =>
  twists.every((t) => {
    const w = twistWeight(t, y);
    return w === 0 || w === 1;
  });

/**
 * Walk a track tick by tick. Every time the view leaves a settled pose, the cue for that change
 * must already be up, raised while the view was still settled, and it must name the twists that
 * are coming in. Returns how many changes of view were met.
 */
function checkCues(track: Track, what: string): number {
  const twists = track.twists;
  const cues = twistCues(twists);
  const tl = kinematics(track);
  let was = true;
  let departures = 0;
  for (let j = 1; j <= tl.n; j++) {
    const y = tl.y[j]!;
    const now = settledAt(twists, y);
    if (was && !now) {
      departures++;
      const cue = cues.find((c) => y >= c.from && y <= c.end);
      expect(cue, `${what}: no cue for the change at y ${Math.round(y)}`).toBeDefined();
      // Raised before the pose began to move: at least 300 px and half a second earlier.
      expect(cue!.y, `${what} y ${Math.round(y)}`).toBeLessThanOrEqual(y - 300);
      let k = j;
      while (k > 0 && tl.y[k]! > cue!.y) k--;
      expect((j - k) / 120, `${what} y ${Math.round(y)}: seconds between the cue and the change`).toBeGreaterThanOrEqual(0.5);
      // ... and nothing was moving between the cue and the change.
      for (let i = k; i < j; i++) expect(settledAt(twists, tl.y[i]!), `${what}: the view moves at y ${Math.round(tl.y[i]!)}, before the change the cue at ${Math.round(cue!.y)} announces`).toBe(true);
      // It names what is coming.
      const incoming = twists.filter((t) => t.ease > 0 && t.y0 >= cue!.from - 1 && t.y0 <= cue!.end);
      expect(cue!.out, `${what} y ${Math.round(y)}`).toBe(incoming.length === 0);
      for (const t of incoming) expect(cue!.kinds, `${what} y ${Math.round(y)}`).toContain(t.kind);
    }
    was = now;
  }
  expect(departures, what).toBe(cues.length);
  // Every twist has a cue of its own kind, up before anything in its chamber moves.
  for (const t of twists) {
    if (t.ease <= 0) continue;
    const cue = cues.find((c) => !c.out && c.kinds.includes(t.kind) && t.y0 >= c.from - 1 && t.y0 + t.ease <= c.end + 1);
    expect(cue, `${what}: ${t.kind} at ${Math.round(t.y0)} has no cue`).toBeDefined();
    expect(cue!.y + CUE_LEAD, `${what}: ${t.kind}`).toBeLessThanOrEqual(t.y0);
  }
  return departures;
}

/** Hold's direction on screen under the pose at y, worked out from two projected points. */
function holdOnScreen(twists: readonly Twist[], y: number): { x: number; y: number } {
  const p = poseAt(twists, y);
  const m = poseMatrix(p);
  const a = project(p, m, 300, y, y, { x: 0, y: 0 });
  const b = project(p, m, 310, y + 10, y, { x: 0, y: 0 });
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
}

describe('cues: the player is told before the view moves', () => {
  it('levels 41-50: at every change of view the banner and arrow are already up, also in chained chambers', () => {
    let changes = 0;
    let chained = 0;
    for (const id of VORTEX) {
      const track = buildLevel(id);
      changes += checkCues(track, `level ${id}`);
      // A chained chamber: twists ease out and others ease in under one cue, raised before the first.
      for (const c of twistCues(track.twists)) {
        const outs = track.twists.filter((t) => t.y1 - t.ease >= c.from - 1 && t.y1 <= c.end + 1);
        if (!c.out && outs.length) {
          chained++;
          expect(c.from, `level ${id}`).toBeCloseTo(Math.min(...outs.map((t) => t.y1 - t.ease)), 6);
          expect(c.y, `level ${id}`).toBeCloseTo(c.from - CUE_LEAD, 6);
        }
      }
    }
    expect(changes).toBeGreaterThanOrEqual(40);
    expect(chained).toBeGreaterThanOrEqual(6); // levels 46 to 50 chain their chambers
  });

  it('endless and dive: the same for every twist stretch', () => {
    let changes = 0;
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      for (const dive of [false, true]) changes += checkCues(buildEndless(seed, { segments: 60, dive }).track, `seed ${seed}${dive ? ' dive' : ''}`);
    }
    expect(changes).toBeGreaterThan(20);
  });

  it('the cue list of a chained level reads in order: what comes in, never a late "back to normal"', () => {
    const c47 = twistCues(buildLevel(47).twists).map((c) => `${c.out ? 'normal' : c.kinds.join('+')}${c.turns ? '!' : ''}`);
    expect(c47).toEqual(['side!', 'dive!', 'normal!', 'near', 'normal']);
    const c50 = twistCues(buildLevel(50).twists).map((c) => `${c.out ? 'normal' : c.kinds.join('+')}${c.turns ? '!' : ''}`);
    expect(c50).toEqual(['dive!', 'side!', 'normal!', 'dive+tilt!', 'normal!']);
    const c49 = twistCues(buildLevel(49).twists).map((c) => `${c.out ? 'normal' : c.kinds.join('+')}${c.turns ? '!' : ''}`);
    expect(c49).toEqual(['far+tilt', 'side!', 'dive!', 'normal!']);
  });

  it('the arrow points the way hold goes once the view has settled (side, dive, stacked and chained)', () => {
    const R = Math.SQRT1_2;
    for (const id of VORTEX) {
      const { twists } = buildLevel(id);
      for (const c of twistCues(twists)) {
        const want = holdOnScreen(twists, c.end + 2);
        expect(c.holdX, `level ${id} cue at ${Math.round(c.y)}`).toBeCloseTo(want.x, 6);
        expect(c.holdY, `level ${id} cue at ${Math.round(c.y)}`).toBeCloseTo(want.y, 6);
      }
    }
    // Dive: down and right. Back to normal: up and right.
    const c41 = twistCues(buildLevel(41).twists);
    expect([c41[0]!.holdX, c41[0]!.holdY].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.707, 0.707]);
    expect([c41[1]!.holdX, c41[1]!.holdY].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.707, -0.707]);
    // Side: hold = up while the flight runs right, which is up and right on screen.
    const c44 = twistCues(buildLevel(44).twists);
    expect(c44[0]!.kinds).toEqual(['side']);
    expect(c44[0]!.holdX).toBeCloseTo(R, 6);
    expect(c44[0]!.holdY).toBeCloseTo(-R, 6);
    // Stacked: dive under a lean of -6 degrees turns the dive's arrow by the lean (39 degrees below the horizontal).
    const stacked = twistCues(buildLevel(45).twists).find((c) => c.kinds.join('+') === 'dive+tilt')!;
    expect(stacked.holdX).toBeCloseTo(Math.cos((39 * Math.PI) / 180), 6);
    expect(stacked.holdY).toBeCloseTo(Math.sin((39 * Math.PI) / 180), 6);
    // ... and level 50's dive under +10 degrees (55 degrees below the horizontal).
    const boss = twistCues(buildLevel(50).twists).find((c) => c.kinds.join('+') === 'dive+tilt')!;
    expect(boss.holdX).toBeCloseTo(Math.cos((55 * Math.PI) / 180), 6);
    expect(boss.holdY).toBeCloseTo(Math.sin((55 * Math.PI) / 180), 6);
    // Chained: side straight into dive announces the dive, with the dive's arrow.
    const chained = twistCues(buildLevel(47).twists)[1]!;
    expect(chained.kinds).toEqual(['dive']);
    expect([chained.holdX, chained.holdY].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.707, 0.707]);
  });
});
