// Store listing config for Noodle Archers (games/okcu). Read by store/tools/*.mjs.
// Saves come from a career played headless through the game's own rules (./career.mjs: the
// careful scripted player from src/sim/aimbot.ts, banked and forged by the game's own functions).
// Shots drive the real game through its ?test=1 hook (packages/core/README.md): the scripted
// player shoots through the same release handler a finger uses; the aiming shots are real touch
// drags (Chrome DevTools touch events, as tests/e2e/smoke.spec.ts does). Later stages are reached
// with the chapter select (what a player taps) or the documented capture aid `jump-wave`.
import { stageCareer } from './career.mjs';

const SAVE_KEY = 'oyun:okcu:save';
const SAVE_VERSION = 3;

/**
 * Game time only (no frames): the scripted player shoots while `stop(data)` is false. Card
 * screens get a pick by preference. Returns the data when `stop` holds; fails if the run ends.
 */
async function playUntil(g, stop, { error = 0.004, max = 6000, pick = true } = {}) {
  for (let round = 0; round < 60; round++) {
    const res = await g.page.evaluate(
      ([src, error, max]) => {
        const H = window.__OYUN__;
        const stop = new Function('d', `return (${src})(d)`);
        for (let i = 0; i < max; i++) {
          const s = H.state();
          const d = s.data;
          if (s.scene !== 'game' || d.phase === 'over' || d.phase === 'dying') return { fail: `run ended on wave ${d.wave}` };
          if (stop(d)) return { done: true };
          if (d.phase === 'cards') return { cards: d.offer };
          if ((d.phase === 'title' || d.phase === 'play' || d.phase === 'bonus') && d.reload === 0) H.act('aimbot', { error });
          H.act('advance', 0.1);
        }
        return { fail: 'too long' };
      },
      [stop.toString(), error, max],
    );
    if (res.fail) throw new Error(`playUntil: ${res.fail}`);
    if (res.done) return g.data();
    if (!pick) return g.data();
    // the card screen needs real frames: the cards slam in before they take a pick
    await g.run(1000, 200);
    await g.act('pick-card', 0);
    await g.run(400, 200);
  }
  throw new Error('playUntil: too many rounds');
}

/** Step short frames until `test(data)` holds. */
async function watch(g, test, frame = 30, max = 3000) {
  for (let t = 0; t < max; t += frame) {
    await g.run(frame, frame);
    if (await g.page.evaluate((src) => new Function('d', `return (${src})(d)`)(window.__OYUN__.state().data), test.toString())) return true;
  }
  return false;
}

async function touch(g) {
  const cdp = await g.page.context().newCDPSession(g.page);
  const box = await g.page.evaluate(() => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    return { x: r.x, y: r.y, k: r.width / 720 };
  });
  const css = (x, y) => ({ x: box.x + x * box.k, y: box.y + y * box.k });
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  return { css, send };
}

/** A real finger drag that holds the string at the solved aim (does not release). */
async function holdAim(g, { x0 = 470, y0 = 820, power = 0.92, dAngle = -0.06 } = {}) {
  const d = await g.data();
  if (!d.solution) throw new Error('no target to aim at');
  const pull = d.drag.dead + d.solution.power * power * (d.drag.full - d.drag.dead);
  const a = d.solution.angle + dAngle;
  const t = await touch(g);
  await t.send('touchStart', [{ ...t.css(x0, y0), id: 1 }]);
  for (let i = 1; i <= 6; i++) {
    await t.send('touchMove', [{ ...t.css(x0 - (Math.cos(a) * pull * i) / 6, y0 - (Math.sin(a) * pull * i) / 6), id: 1 }]);
    await g.run(40, 40);
  }
  return t;
}

/** Title → chapter select: tap the chapter pill until it shows chapter `c` (0 … 3). */
async function toChapter(g, c) {
  for (let i = 0; i < 6; i++) {
    const d = await g.data();
    if (d.chapter === c) return;
    await g.act('chapter');
    await g.scene('game');
    await g.run(900, 150);
  }
  throw new Error(`chapter select did not reach ${c}`);
}

/** Same as src/sim/cards.ts SYNERGIES: two tricks that make a combo. */
const COMBOS = [['fire', 'boom'], ['pierce', 'chain'], ['split', 'seeker'], ['heavy', 'overdraw'], ['keen', 'longsight']];
const completesCombo = (held, c) => COMBOS.some(([a, b]) => (c === a && held.includes(b) && !held.includes(a)) || (c === b && held.includes(a) && !held.includes(b)));

/** Spend a full focus meter (its "Tap!" cue is a prompt, not a screenshot), let banners clear. */
async function settle(g) {
  if ((await g.data()).focus >= 1) await g.act('unleash');
  await g.until((s) => s.data.focus < 1 && s.data.focusT <= 0 && !s.data.bannerUp && s.data.reload === 0, { step: 150, max: 30000, what: 'calm' });
  await g.run(600, 150);
}

const FORGE_T = Number(process.env.FORGE_T ?? 300);
const BOSS_SCOUT = [7, 14, 21, 28].map((wave) => ({
  id: `boss${wave}`,
  save: 'golden',
  caption: { 'en-US': 'x', 'tr-TR': 'x' },
  async run(g) {
    await g.act('jump-wave', wave);
    await g.act('god');
    await g.run(800, 150);
    const hp0 = (await g.data()).enemies.find((e) => e.type === 'boss').hp;
    await playUntil(g, new Function('d', `return d.enemies.some((e) => e.type === 'boss' && e.alive && e.hp < ${hp0 * 0.45})`));
    await settle(g);
    await g.act('aimbot', { error: 0.002 });
    await g.run(260, 40);
  },
}));

export default {
  slug: 'okcu',
  name: { 'en-US': 'Noodle Archers', 'tr-TR': 'Sallanan Okçular' },
  seed: 1,

  look: {
    bg: ['#2fa8f5', '#a9e6ff'],
    band: ['#ffffff', '#e6f7ff'],
    accent: '#ffb233',
    ink: '#2a1838',
    text: '#ffffff',
    pattern: 'clouds',
    stroke: 12,
    frame: '#ffffffaa',
  },

  // Icon: a drawn bow with its arrow on the game's sky, in the family frame.
  icon: { emblem: 'bow', bg: ['#4fc3ff', '#1d6fd1'], glow: '#fff2a8', mono: true },

  async stage(load) {
    const { save, at, forgeAt } = await stageCareer(load, { bowTarget: 20, snapshots: [9, 12, 16] });
    const wrap = (data, cosmetic) => ({ v: SAVE_VERSION, data: { ...data, cosmetic } });
    return {
      fresh: { v: SAVE_VERSION, data: (await load('/src/sim/meta.ts')).freshSave() },
      golden: wrap(at[9], 'feather'),
      azure: wrap(at[12], 'tophat'),
      magenta: wrap(at[16], 'horns'),
      prism: wrap(save, 'crown'),
      forge16: wrap(forgeAt[16], 'horns'),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  shots: [
    {
      id: 'aim',
      save: 'golden',
      caption: { 'en-US': 'Pull back, let go, knock them off their ledges', 'tr-TR': 'Geri çek, bırak, rakipleri platformdan düşür' },
      async run(g) {
        await playUntil(g, (d) => d.wave >= 3 && d.phase === 'play');
        await settle(g);
        await holdAim(g, { power: 0.9 });
        await g.run(400, 50);
      },
    },
    {
      id: 'glow',
      save: 'prism',
      caption: { 'en-US': 'Forge your bow to +20 and watch it blaze', 'tr-TR': 'Yayını +20’ye kadar döv, alev alev parlasın' },
      async run(g) {
        await toChapter(g, 3);
        await g.act('god');
        await g.act('jump-wave', 27);
        await g.run(1500, 150);
        await settle(g);
        const t = await holdAim(g, { power: 0.95 });
        await g.run(250, 50);
        await t.send('touchEnd', [{ ...t.css(400, 900), id: 1 }]);
        await g.run(160, 40);
      },
    },
    ...BOSS_SCOUT,
    {
      id: 'forge',
      save: 'forge16',
      caption: { 'en-US': 'x', 'tr-TR': 'x' },
      async run(g) {
        await g.run(600, 120);
        await g.act('forge');
        await g.scene('forge');
        await g.run(800, 120);
        await g.act('forge');
        await g.until((s) => s.data.shown === 16, { step: 60, max: 10000, what: 'forge payoff' });
        await g.run(FORGE_T, 40);
      },
    },
    {
      id: 'dunes',
      save: 'azure',
      caption: { 'en-US': 'x', 'tr-TR': 'x' },
      async run(g) {
        await toChapter(g, 2);
        await g.act('god');
        await g.act('jump-wave', 20);
        await g.run(1500, 150);
        await settle(g);
        const kos = (await g.data()).kos;
        await g.act('aimbot', { error: 0.002 });
        const hit = await watch(g, `(d) => d.kos > ${kos}`);
        if (!hit) throw new Error('no knockout from the shot');
        await g.run(60, 30);
      },
    },
    {
      id: 'snow',
      save: 'azure',
      caption: { 'en-US': 'x', 'tr-TR': 'x' },
      async run(g) {
        await toChapter(g, 1);
        await g.act('god');
        await g.act('jump-wave', 12);
        await g.run(1500, 150);
        await settle(g);
        await g.act('aimbot', { error: 0.004 });
        await g.run(450, 50);
      },
    },
    {
      id: 'cards',
      save: 'golden',
      caption: { 'en-US': 'x', 'tr-TR': 'x' },
      async run(g) {
        await toChapter(g, 1);
        await g.act('god');
        for (let i = 0; i < 12; i++) {
          await playUntil(g, (d) => d.phase === 'cards', { pick: false });
          const d = await g.data();
          if (d.offer.some((c) => completesCombo(d.cards, c))) break;
          await g.run(1000, 200);
          await g.act('pick-card', 0);
          await g.run(400, 200);
        }
        await g.run(2400, 200);
      },
    },
    {
      id: 'ranks',
      save: 'azure',
      caption: { 'en-US': 'x', 'tr-TR': 'x' },
      async run(g) {
        await g.run(600, 120);
        await g.act('ranks');
        await g.scene('ranks');
        await g.run(1500, 120);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Pull back, let go, knock them off!', 'tr-TR': 'Geri çek, bırak, düşür!' },
    cards: [
      ['night', 0, 220, 540, 960],
      ['forge', 100, 120, 560, 996],
    ],
  },
};
