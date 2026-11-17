// Store listing config for Sparkrise (games/kivilcim). Read by store/tools/*.mjs.
//
// How the shots are flown. The game's own autopilot (act('autopilot')) replays a solver plan that
// skims every wall with 6 px to spare, so it throws a near miss and an "EDGE ×N" combo every
// second: honest, but it makes the game look like it plays itself. Instead, stage() computes in
// Node, with the game's own solver (src/sim/solver.ts), the line a person flies: the "comfort"
// objective the human-model tests use (middle of the corridor, few input changes), every gem,
// at least 14 px from any hazard (no near-miss text). The shot then flies that line through the
// game's real input path, the ?test=1 'hold' action (the same press/release handler a finger
// lands in), on the stepped clock: each press or release is sent while the sim is exactly one
// tick before the planned change, so the in-page run is the Node run tick for tick (checked:
// the shot fails if the spark's x drifts from the planned line).
//
// The save is earned by the game's rules too (src/sim/progress.ts): the human model
// (src/sim/human.ts, 250 ms reaction, ±40 ms noise) attempts each level until it finishes, every
// failed attempt is recorded with its progress, then a finishing run of the gem line (replayed
// through RunSim) collects the level's three gems. 10 levels × 3 gems = 30 gems, spent with
// buySkin() on two spark shapes and two trails; shots equip different owned skins (equipSkin).

const SAVE_KEY = 'oyun:kivilcim:save';
const DT_MS = 1000 / 120;

/** Planned lines by key ('L4', 'endless'), filled by stage() (same Node process as the shots). */
const LINES = new Map();

function gemLine(M, track, window) {
  const p = M.S.prepare(track, window ? { toTick: window } : {});
  for (const [minClear, gems] of [[14, true], [12, true], [14, false], [10, false]]) {
    const plan = M.S.solve(p, { minClear, minHoldTicks: M.S.K_REF, gems, startHeld: 1, comfort: { cap: 70, switchCost: 10 } });
    if (plan) return plan.held;
  }
  throw new Error('no comfortable line');
}

/** Replay a plan in the sim; keep x per tick (to check the in-page run) and the outcome. */
function replay(M, track, held) {
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
 * Take off on a planned line from the 'ready' phase. `to(tick)` flies on until that many ticks
 * have run. Each input change is sent with the page clock inside the planned tick's time slot
 * (the game stamps an edge with performance.now() and applies it from the first tick ending at
 * or after it), so the in-page run is the planned one tick for tick; it throws if the spark
 * leaves the line.
 */
async function takeoff(g, key) {
  const line = LINES.get(key);
  if (!line) throw new Error(`no line ${key}`);
  const d0 = await g.data();
  if (d0.phase !== 'ready') throw new Error(`fly ${key}: phase ${d0.phase}, expected ready`);
  if (Math.abs(d0.trackLength - line.trackLength) > 1) throw new Error(`fly ${key}: track ${d0.trackLength} ≠ planned ${line.trackLength}`);
  const now = () => g.page.evaluate(() => performance.now());
  const T0 = await now();
  await g.act('hold', true); // the press that starts the run is its first held tick
  let held = true;
  let next = 0;
  const goto = async (tick, frame) => {
    const ms = Math.round(T0 + tick * DT_MS + DT_MS / 2 - (await now()));
    if (ms > 0) await g.run(ms, frame);
  };
  return {
    async to(stopTick, frame = 150) {
      for (; next < line.switches.length && line.switches[next] < stopTick; next++) {
        const s = line.switches[next];
        await goto(s, frame);
        const d = await g.data();
        if (d.phase !== 'playing') throw new Error(`fly ${key}: ${d.phase} at tick ${d.tick} (${d.deathCause})`);
        // The edge's time (the clock now) falls inside tick s; frames only lag behind the clock.
        if (d.tick > s) throw new Error(`fly ${key}: sim at tick ${d.tick}, past the change at ${s}`);
        held = !held;
        await g.act('hold', held);
      }
      await goto(Math.min(stopTick, line.held.length), frame);
      const d = await g.data();
      const want = line.x[Math.min(d.tick, line.x.length - 1)];
      if (d.phase === 'playing' && Math.abs(d.x - want) > 1.5) throw new Error(`fly ${key}: x ${d.x} off the line (${want.toFixed(1)}) at tick ${d.tick}`);
      return d;
    },
  };
}

async function fly(g, key, stopTick, frame = 150) {
  return (await takeoff(g, key)).to(stopTick, frame);
}

async function startMode(g, mode, level) {
  await g.run(400, 100);
  await g.act('start', { mode, level });
  await g.run(300, 100);
}

function withSkin(base, shape, trail) {
  const s = structuredClone(base);
  s.data.skin.shape = shape;
  s.data.skin.trail = trail;
  if (!(s.data.skin.ownedShapes & (1 << shape)) || !(s.data.skin.ownedTrails & (1 << trail))) throw new Error('skin not owned');
  return s;
}

export default {
  slug: 'kivilcim',
  name: { 'en-US': 'Sparkrise', 'tr-TR': 'Kıvılcım' },
  seed: 1,

  look: {
    bg: ['#3a0f6e', '#14062b'],
    band: ['#ffffff'],
    accent: '#3ff6ff',
    ink: '#14062b',
    text: '#ffffff',
    stroke: 12,
    frame: '#3ff6ffaa',
    pattern: 'sparks',
  },

  // Icon: a glowing four-point spark at the top of its zigzag trail, in the family frame.
  icon: { emblem: 'spark', bg: ['#ff4fa3', '#5a1aa8'], glow: '#ffe66b', mono: true },

  async stage(load) {
    const M = {
      L: await load('/src/sim/levels.ts'),
      S: await load('/src/sim/solver.ts'),
      R: await load('/src/sim/run.ts'),
      H: await load('/src/sim/human.ts'),
      P: await load('/src/sim/progress.ts'),
      E: await load('/src/sim/endless.ts'),
      C: await load('@oyun/core/pure'),
    };
    const d = M.P.defaults();
    d.played = true;
    d.tutorial = true; // the one-time "LET GO!" / "HOLD!" cues were shown on the first run
    const log = [];
    for (let id = 1; id <= M.L.LEVEL_COUNT; id++) {
      const track = M.L.buildLevel(id);
      // The human model flies the human-test comfort line until it finishes once.
      const comfort = M.S.solve(M.S.prepare(track), { minClear: 0, minHoldTicks: M.S.K_REF, comfort: { cap: 120, switchCost: 20 } });
      const ref = M.H.reference(track, comfort.held);
      const rng = M.C.createRng(1000 + id);
      let fails = 0;
      for (; fails < 80; fails++) {
        const r = M.H.humanAttempt(track, ref, { rng });
        if (r.finished) break;
        M.P.recordLevelRun(d, id, { percent: r.progress * 100, gemMask: 0, finished: false });
      }
      // The finishing run: the gem line, replayed through the sim.
      const held = gemLine(M, track);
      const { sim, x, switches } = replay(M, track, held);
      if (!sim.finished) throw new Error(`stage: level ${id} line did not finish`);
      M.P.recordLevelRun(d, id, { percent: 100, gemMask: sim.gemMask, finished: true });
      LINES.set(`L${id}`, { held, x, switches, trackLength: Math.round(track.length) });
      log.push(`L${id} ${fails}✗ +${sim.gemsTaken}`);
    }
    // One endless run by the human model (gems taken there are not counted: a lower bound).
    const seed = M.C.createRng(1).int(1, 2 ** 31 - 1); // the game's first endless seed with ?seed=1
    const endless = M.E.buildEndless(seed).track;
    const eHeld = gemLine(M, endless, 120 * 45);
    const eRef = M.H.reference(endless, M.S.solve(M.S.prepare(endless, { toTick: 120 * 45 }), { minClear: 0, minHoldTicks: M.S.K_REF, comfort: { cap: 120, switchCost: 20 } }).held);
    const er = M.H.humanAttempt(endless, eRef, { rng: M.C.createRng(77) });
    M.P.recordEndless(d, Math.floor((er.progress * endless.length) / 10), 0);
    const e = replay(M, endless, eHeld);
    if (!e.sim.alive) throw new Error('stage: endless line died');
    LINES.set('endless', { held: eHeld, x: e.x, switches: e.switches, trackLength: Math.round(endless.length) });
    // Spend the 30 gems in the shop's order of price: lava trail, diamond, mint trail, star.
    for (const [kind, i] of [['trail', 1], ['shape', 1], ['trail', 2], ['shape', 2]]) {
      if (M.P.buySkin(d, kind, i) !== 'bought') throw new Error(`stage: could not buy ${kind} ${i} with ${d.gems} gems`);
    }
    log.push(`gems left ${d.gems}, endless best ${d.endlessBest} m`);
    console.log(`[stage kivilcim] ${log.join(' · ')}`);
    const player = { v: 2, data: d };
    return {
      player, // star + mint (as left by the last purchase)
      diamondLava: withSkin(player, 1, 1),
      orbMint: withSkin(player, 0, 2),
      starLava: withSkin(player, 2, 1),
      diamondWhite: withSkin(player, 1, 0),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  // Shot ticks were picked from contact sheets of each flight: spark just past a turn near a
  // wall, a gate or gem on screen ahead, no banner over the path, colours unlike the other shots.
  shots: [
    {
      id: 'climb',
      save: 'diamondLava',
      caption: { 'en-US': 'Hold to veer right, let go to veer left', 'tr-TR': 'Basılı tut sağa, bırak sola' },
      async run(g) {
        await startMode(g, 'level', 2);
        await fly(g, 'L2', 1400);
      },
    },
    {
      id: 'flip',
      save: 'orbMint',
      caption: { 'en-US': 'Flip gates swap your controls', 'tr-TR': 'Ters kapıdan geçince kontroller yer değiştirir' },
      async run(g) {
        await startMode(g, 'level', 4);
        await fly(g, 'L4', 1400);
      },
    },
    {
      id: 'gems',
      save: 'starLava',
      caption: { 'en-US': 'Grab the gems on the riskier lines', 'tr-TR': 'Riskli yollardaki elmasları kap' },
      async run(g) {
        await startMode(g, 'level', 7);
        await fly(g, 'L7', 3290);
      },
    },
    {
      id: 'mini',
      save: 'player',
      caption: { 'en-US': 'Gates speed you up, slow you down or shrink you', 'tr-TR': 'Kapılar hızlandırır, yavaşlatır ya da küçültür' },
      async run(g) {
        await startMode(g, 'level', 9);
        await fly(g, 'L9', 2840);
      },
    },
    {
      id: 'finish',
      save: 'diamondWhite',
      caption: { 'en-US': 'Ten levels, each in its own colours', 'tr-TR': 'On bölüm, her biri kendi renginde' },
      async run(g) {
        await startMode(g, 'level', 6);
        await fly(g, 'L6', 1e9, 200);
        await g.until((s) => s.data.phase === 'finishing' || s.data.phase === 'finished', { step: 50, max: 5000, what: 'finish' });
        await g.run(450, 50);
      },
    },
    {
      id: 'endless',
      save: 'starLava',
      caption: { 'en-US': 'Endless mode: how high can you climb?', 'tr-TR': 'Sonsuz mod: ne kadar yükseğe çıkabilirsin?' },
      async run(g) {
        await startMode(g, 'endless');
        await fly(g, 'endless', 3000);
      },
    },
    {
      id: 'skins',
      save: 'player',
      caption: { 'en-US': 'Spend gems on new sparks and trails', 'tr-TR': 'Elmaslarla yeni kıvılcım ve iz al' },
      async run(g) {
        await g.run(600, 100);
        await g.act('skins');
        await g.scene('skins');
        await g.run(900, 100);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Hold to go right, let go to go left', 'tr-TR': 'Bas sağa, bırak sola' },
    cards: [
      ['flip', 120, 200, 480, 853],
      ['gems', 120, 200, 480, 853],
    ],
  },
};

export { fly, LINES, startMode, takeoff };
