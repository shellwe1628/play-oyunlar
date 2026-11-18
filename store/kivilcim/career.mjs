// Staging for the Sparkrise listing: a player's career played headless through the game's own
// rules. For each level, the human model (src/sim/human.ts: 250 ms reaction, ±40 ms noise, the
// model the difficulty tables are measured with) attempts it until it finishes; every failed
// attempt is recorded with its progress (src/sim/progress.ts recordLevelRun), then a finishing
// run of the gem line (the game's own solver, src/sim/solver.ts, replayed through RunSim) takes
// the level's gems and stars. After every run the save is settled like the game does
// (src/sim/meta.ts settle: achievements, gems, earned trails, rank). Worlds open only on their
// star requirement (progress.ts levelOpen). Trails and shapes are bought with buySkin.

const DT_MS = 1000 / 120;
export { DT_MS };

export async function loadMods(load) {
  return {
    L: await load('/src/sim/levels.ts'),
    S: await load('/src/sim/solver.ts'),
    R: await load('/src/sim/run.ts'),
    H: await load('/src/sim/human.ts'),
    P: await load('/src/sim/progress.ts'),
    PT: await load('/src/sim/patterns.ts'),
    M: await load('/src/sim/meta.ts'),
    E: await load('/src/sim/endless.ts'),
    K: await load('/src/sim/skins.ts'),
    C: await load('@oyun/core/pure'),
  };
}

/** The comfortable gem line a person flies (middle of the corridor, few input changes). */
export function gemLine(M, track, window) {
  const p = M.S.prepare(track, window ? { toTick: window } : {});
  for (const [minClear, gems] of [[14, true], [12, true], [14, false], [10, false]]) {
    const plan = M.S.solve(p, { minClear, minHoldTicks: M.S.K_REF, gems, startHeld: 1, comfort: { cap: 70, switchCost: 10 } });
    if (plan) return plan.held;
  }
  throw new Error('no comfortable line');
}

/** Replay a plan in the sim; keep x per tick (to check the in-page run) and the outcome. */
export function replay(M, track, held) {
  const sim = new M.R.RunSim(track);
  const x = new Float64Array(held.length + 1);
  x[0] = sim.x;
  const switches = [];
  for (let j = 0; j < held.length; j++) {
    if (j > 0 && held[j] !== held[j - 1]) switches.push(j);
    sim.step(held[j] === 1);
    x[j + 1] = sim.x;
    if (!sim.alive || sim.finished) break;
  }
  return { sim, x, switches };
}

/**
 * Play levels 1 … `upTo` in order (a level is played only once the save opens it). `buy(d)` is
 * called after every finished level (the player's shopping). `snap(id, d)` may keep copies.
 * Returns the save, the per-level lines (for shots) and a log.
 */
export function career(M, { upTo = 40, maxFails = 600, buy = () => {}, snap = () => {}, keepLines = [], date = (i) => '' }) {
  const d = M.P.defaults();
  d.played = true;
  d.tutorial = true; // the one-time "LET GO!" / "HOLD!" cues were shown on the first run
  const lines = new Map();
  const log = [];
  let runs = 0;
  for (let id = 1; id <= upTo; id++) {
    if (!M.P.levelOpen(d, id)) {
      log.push(`L${id} locked (stars ${M.M.totalStars(d)})`);
      break;
    }
    snap(id, d, 'before');
    // a mechanic's one-time cue is shown (and saved as seen) on the first run of its intro level
    const intro = M.L.levelInfo(id).intro;
    if (intro) d.cues |= 1 << M.PT.MECHANICS.indexOf(intro);
    const track = M.L.buildLevel(id);
    const comfort = M.S.solve(M.S.prepare(track), { minClear: 0, minHoldTicks: M.S.K_REF, comfort: { cap: 120, switchCost: 20 } });
    const ref = M.H.reference(track, comfort.held);
    const rng = M.C.createRng(1000 + id);
    let fails = 0;
    for (; fails < maxFails; fails++) {
      const r = M.H.humanAttempt(track, ref, { rng });
      if (r.finished) break;
      M.P.recordLevelRun(d, id, { percent: r.progress * 100, gemMask: 0, finished: false, date: date(runs++) });
      M.M.settle(d);
    }
    if (fails >= maxFails) {
      log.push(`L${id} not finished in ${maxFails}`);
      break;
    }
    const held = gemLine(M, track);
    const { sim, x, switches } = replay(M, track, held);
    if (!sim.finished) throw new Error(`career: level ${id} line did not finish`);
    M.P.recordLevelRun(d, id, { percent: 100, gemMask: sim.gemMask, finished: true, nearMisses: sim.nearMisses, date: date(runs++) });
    M.M.settle(d);
    if (keepLines.includes(id)) lines.set(`L${id}`, { held, x, switches, trackLength: Math.round(track.length) });
    log.push(`L${id} ${fails}✗`);
    buy(d);
    M.M.settle(d);
    snap(id, d, 'after');
  }
  return { d, lines, log };
}
