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
// The save is earned by the game's rules too (./career.mjs): the human model attempts all 50
// levels in order (worlds open on their star requirement), every attempt is recorded, a
// finishing run of the gem line takes gems and stars, achievements and earned trails are settled
// like the game does, and trails are bought with buySkin as the wallet allows. Shots equip
// different owned trails (equipSkin).
import { career, DT_MS, gemLine, loadMods, replay } from './career.mjs';

const SAVE_KEY = 'oyun:kivilcim:save';

/** Planned lines by key ('L4', 'endless'), filled by stage() (same Node process as the shots). */
const LINES = new Map();


/**
 * Take off on a planned line from the 'ready' phase. `to(tick)` flies on until that many ticks
 * have run. Each input change is sent with the page clock inside the planned tick's time slot
 * (the game stamps an edge with performance.now() and applies it from the first tick ending at
 * or after it), so the in-page run is the planned one tick for tick; it throws if the spark
 * leaves the line.
 */
async function takeoff(g, key) {
  // Frames must stay under the game's 200 ms automation cap even when the fake rAF fires a few
  // ms late, or the run loses time and later edges land on earlier ticks: keep `frame` ≤ 150.
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
      if (frame > 150) throw new Error('fly: frame must be ≤ 150 ms');
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

/** Keep a caption phrase on one line (no-break spaces), so captions break where they read well. */
const keep = (phrase) => phrase.replace(/ /g, '\u00a0');

function withSkin(base, shape, trail) {
  const s = structuredClone(base);
  s.data.skin.shape = shape;
  s.data.skin.trail = trail;
  if (!(s.data.skin.ownedShapes & (1 << shape)) || !(s.data.skin.ownedTrails & (1 << trail))) throw new Error('skin not owned');
  return s;
}

/** Trail index by id (src/sim/skins.ts TRAILS). */
const TRAIL = (M, id) => M.K.TRAILS.findIndex((t) => t.id === id);
const SHAPE = (M, id) => M.K.SHAPES.findIndex((t) => t.id === id);

/** Levels whose lines the shots fly (kept from the career's finishing runs). */
const SHOT_LEVELS = [21, 26, 30, 34, 45];
/** Where the vortex shot is taken on level 45's line: dive + lean settled, spinners in view, no banner. */
const VORTEX_AT = 0.62;
/** The tick at a fraction of a level's planned line. */
const at = (key, f) => Math.round(LINES.get(key).held.length * f);

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
    pattern: 'neon',
    ribbons: ['#3ff6ff', '#ff4fa3', '#ffe14d'],
  },

  // Icon: a glowing four-point spark at the top of its zigzag trail, in the family frame.
  icon: { emblem: 'spark', bg: ['#ff4fa3', '#5a1aa8'], glow: '#ffe66b', mono: true },

  async stage(load) {
    const M = await loadMods(load);
    // The player's shopping: the cheap trails as soon as they can, then a few epics and
    // legendaries, then saving up for the two mythic trails; two shapes along the way.
    const wishlist = [
      ['trail', 'lava'], ['trail', 'mint'], ['shape', 'diamond'], ['trail', 'sky'], ['trail', 'candy'], ['shape', 'star'],
      ['trail', 'lime'], ['trail', 'violet'], ['trail', 'rainbow'], ['trail', 'sunset'], ['trail', 'flame'], ['trail', 'aurora'],
      ['trail', 'prism'], ['trail', 'supernova'],
    ].map(([k, id]) => [k, k === 'trail' ? TRAIL(M, id) : SHAPE(M, id)]);
    const buy = (d) => {
      while (wishlist.length && M.P.buySkin(d, ...wishlist[0]) === 'bought') wishlist.shift();
    };
    // record dates: the career ran over the last weeks (a few runs a day)
    const t0 = Date.now() - 20 * 86_400_000;
    const date = (i) => new Date(t0 + Math.floor(i / 12) * 86_400_000).toISOString().slice(0, 10);
    const { d, lines, log } = career(M, { upTo: 50, buy, keepLines: SHOT_LEVELS, date });
    for (const [k, v] of lines) LINES.set(k, v);
    if (wishlist.length) log.push(`not bought: ${wishlist.map((w) => w.join(' ')).join(', ')}`);
    // one endless run by the human model (its milestone gems count; gems taken there do not)
    const seed = M.C.createRng(1).int(1, 2 ** 31 - 1); // the game's first endless seed with ?seed=1
    const endless = M.E.buildEndless(seed).track;
    const eRef = M.H.reference(endless, M.S.solve(M.S.prepare(endless, { toTick: 120 * 45 }), { minClear: 0, minHoldTicks: M.S.K_REF, comfort: { cap: 120, switchCost: 20 } }).held);
    const er = M.H.humanAttempt(endless, eRef, { rng: M.C.createRng(77) });
    M.P.recordEndless(d, Math.floor((er.progress * endless.length) / 10), 0, date(400));
    M.M.settle(d);
    console.log(`[stage kivilcim] ${log.join(' · ')} · gems left ${d.gems} · stars ${M.M.totalStars(d)} · score ${M.M.progressScore(d)} · endless ${d.endlessBest} m`);
    const player = { v: 3, data: d };
    const skin = (shape, trail) => withSkin(player, SHAPE(M, shape), TRAIL(M, trail));
    return {
      player,
      supernova: skin('star', 'supernova'),
      prism: skin('diamond', 'prism'),
      aurora: skin('orb', 'aurora'),
      flame: skin('diamond', 'flame'),
      sunset: skin('star', 'sunset'),
      rainbow: skin('orb', 'rainbow'),
      voidwalker: skin('star', 'voidwalker'),
      champion: skin('diamond', 'champion'),
      maelstrom: skin('orb', 'maelstrom'),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  // Shot ticks were picked from contact sheets of each flight: the spark just past a turn, the
  // level's mechanic in view, no milestone text fading at 25/50/75 %, no near miss (no "EDGE").
  shots: [
    {
      // Level 21 (Storm Spire, teal): wind streaks across the shaft, a gem ahead.
      id: 'climb',
      save: 'flame',
      caption: { 'en-US': `Hold to veer right, ${keep('let go to veer left')}`, 'tr-TR': `Basılı tut, sağa git; ${keep('bırak, sola dön')}` },
      async run(g) {
        await startMode(g, 'level', 21);
        await fly(g, 'L21', at('L21', 0.6));
      },
    },
    {
      // Level 34 (Void Gate): the mirror twin flies the other side; the prism trail at flow ×2+.
      id: 'trail',
      save: 'prism',
      caption: { 'en-US': `Collect 23 trails, ${keep('up to mythic')}`, 'tr-TR': '23 iz topla, mitik olanlara kadar' },
      async run(g) {
        await startMode(g, 'level', 34);
        await fly(g, 'L34', at('L34', 0.66));
      },
    },
    {
      // Level 30 (Storm Spire boss): the storm eye in the backdrop, its HP bar, a laser.
      id: 'boss',
      save: 'aurora',
      caption: { 'en-US': `Every world ends in ${keep('a boss finale')}`, 'tr-TR': 'Her dünya bir patron finaliyle biter' },
      async run(g) {
        await startMode(g, 'level', 30);
        await fly(g, 'L30', at('L30', 0.6));
      },
    },
    {
      // Level 26 (Storm Spire): a dark section, lit only around the spark.
      id: 'dark',
      save: 'supernova',
      caption: { 'en-US': 'Dark sections lit only by your spark', 'tr-TR': 'Yalnızca kıvılcımının aydınlattığı karanlık' },
      async run(g) {
        await startMode(g, 'level', 26);
        const f = await takeoff(g, 'L26');
        const n = LINES.get('L26').held.length;
        for (let t = Math.round(n * 0.2); t < n; t += 120) {
          const d = await f.to(t);
          if (d.dark > 0.7 && d.progress > 35 && d.progress < 48) return;
        }
        throw new Error('no dark section between 35 and 48 %');
      },
    },
    {
      // Level 45 (world 5, Vortex): the view dived upside down and leaning, spinners ahead.
      id: 'vortex',
      save: 'maelstrom',
      caption: { 'en-US': `World 5 flips ${keep('and tilts the view')}`, 'tr-TR': '5. dünyada görüntü ters döner, eğilir' },
      async run(g) {
        await startMode(g, 'level', 45);
        await fly(g, 'L45', at('L45', VORTEX_AT));
      },
    },
    {
      // The trail shop: the prism trail playing in the live preview.
      id: 'shop',
      save: 'supernova',
      caption: { 'en-US': 'Watch every trail live before you unlock it', 'tr-TR': 'Her izi açmadan önce canlı izle' },
      async run(g) {
        await g.run(600, 100);
        await g.act('skins');
        await g.scene('skins');
        await g.act('tab', 'trail');
        await g.act('select', { kind: 'trail', i: 16 });
        await g.run(1500, 100);
      },
    },
    {
      id: 'levels',
      save: 'aurora',
      caption: { 'en-US': '50 levels in five worlds, three stars each', 'tr-TR': 'Beş dünyada 50 bölüm, her birinde üç yıldız' },
      async run(g) {
        await g.run(600, 100);
        await g.act('levels');
        await g.scene('levels');
        await g.act('world', 5);
        await g.run(1200, 100);
      },
    },
    {
      id: 'ranks',
      save: 'aurora',
      caption: { 'en-US': 'Climb 12 ranks and earn 23 feats', 'tr-TR': '12 rütbeyi tırman, 23 başarımı topla' },
      async run(g) {
        await g.run(600, 100);
        await g.act('ranks');
        await g.scene('ranks');
        await g.run(1200, 100);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Hold right, let go left', 'tr-TR': 'Bas sağa, bırak sola' },
    cards: [
      ['boss', 60, 120, 600, 900],
      ['trail', 60, 300, 600, 900],
    ],
  },
};

export { fly, LINES, startMode, takeoff };
