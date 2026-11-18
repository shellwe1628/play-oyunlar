// Store listing config for Noodle Archers (games/okcu). Read by store/tools/*.mjs.
// Saves come from a career played headless through the game's own rules (./career.mjs: the
// careful scripted player from src/sim/aimbot.ts, banked and forged by the game's own functions).
// Shots drive the real game through its ?test=1 hook (packages/core/README.md): the scripted
// player shoots through the same release handler a finger uses; the aiming shots are real touch
// drags (Chrome DevTools touch events, as tests/e2e/smoke.spec.ts does). Later stages are reached
// with the chapter select (what a player taps) and played; the documented capture aid `god` keeps
// the scripted player alive on the way, `unleash` spends a full focus meter before a shot.
import { stageCareer } from './career.mjs';

const SAVE_KEY = 'oyun:okcu:save';
const SAVE_VERSION = 3;

/**
 * Game time only (no frames): the scripted player shoots while `stop(data)` is false. Card
 * screens get a pick by preference. Returns the data when `stop` holds; fails if the run ends.
 */
async function playUntil(g, stop, { error = 0.012, max = 6000, pick = true, god = false } = {}) {
  for (let round = 0; round < 60; round++) {
    const res = await g.page.evaluate(
      ([src, error, max, god]) => {
        const H = window.__OYUN__;
        const stop = new Function('d', `return (${src})(d)`);
        for (let i = 0; i < max; i++) {
          const s = H.state();
          const d = s.data;
          if (s.scene !== 'game' || d.phase === 'over' || d.phase === 'dying') return { fail: `run ended on wave ${d.wave}` };
          if (stop(d)) return { done: true };
          // capture aid `god` (no damage taken; GAME.md test hook): health cards reset it, keep it on
          if (god && (d.health < 1e5 || d.health !== d.maxHealth) && d.phase !== 'cards') H.act('god');
          if (d.phase === 'cards') return { cards: d.offer };
          if ((d.phase === 'title' || d.phase === 'play' || d.phase === 'bonus') && d.reload === 0) H.act('aimbot', { error });
          H.act('advance', 0.1);
        }
        const d = H.state().data;
        return { fail: `too long: wave ${d.wave} phase ${d.phase} enemies ${JSON.stringify(d.enemies.map((e) => [e.type, e.alive, e.hp]))} bonus ${JSON.stringify(d.bonus)}` };
      },
      [stop.toString(), error, max, god],
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

/** In god mode (a capture aid used while playing up to a shot) keep it on, with health == max so the HUD bar reads full. */
const needGod = (d) => d.phase === 'play' && (d.health < 1e5 || d.health !== d.maxHealth);

/**
 * Before a gameplay shot: spend a full focus meter (its "Tap!" cue is a prompt, not a screenshot),
 * wait for stage banners to clear and the bow to be ready.
 */
async function settle(g, { god = false } = {}) {
  await g.until(
    async (s) => {
      const d = s.data;
      if (!d) return false;
      if (god && needGod(d)) await g.act('god');
      if (d.focus >= 1 && d.focusT <= 0 && d.phase === 'play') await g.act('unleash');
      return d.focus < 1 && d.focusT <= 0 && !d.bannerUp && d.reload === 0 && d.phase === 'play';
    },
    { step: 150, max: 40000, what: 'calm' },
  ).catch(async (e) => {
    const st = await g.state();
    const d = st.data ?? {};
    throw new Error(`${e.message}: scene ${st.scene} focus ${d.focus} focusT ${d.focusT} banner ${d.bannerUp} "${d.banner}" reload ${d.reload} phase ${d.phase}`);
  });
  await g.run(600, 150);
}

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
    const { save, at, forgeAt } = await stageCareer(load, { bowTarget: 20, snapshots: [6, 9, 12] });
    const wrap = (data, cosmetic) => ({ v: SAVE_VERSION, data: { ...data, cosmetic } });
    return {
      verdant: wrap(at[6], 'flower'),
      golden: wrap(at[9], 'feather'),
      azure: wrap(at[12], 'tophat'),
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
        await playUntil(g, (d) => d.wave >= 27 && d.phase === 'play', { god: true });
        await g.run(1500, 150);
        await settle(g, { god: true });
        const t = await holdAim(g, { power: 0.95 });
        await g.run(250, 50);
        await t.send('touchEnd', [{ ...t.css(400, 900), id: 1 }]);
        await g.run(160, 40);
      },
    },
    {
      id: 'boss',
      save: 'verdant',
      caption: { 'en-US': 'Four bosses that change tactics halfway', 'tr-TR': 'Yarı yolda taktik değiştiren dört patron' },
      async run(g) {
        // Frozen Peaks from the chapter select, played up to the Frost Giant on its sliding ledge
        await toChapter(g, 1);
        await playUntil(g, (d) => d.wave >= 14 && d.phase === 'play' && d.enemies.some((e) => e.type === 'boss' && e.alive), { god: true });
        await settle(g, { god: true });
        await g.act('aimbot', { error: 0.002 });
        await g.run(140, 35);
      },
    },
    {
      id: 'forge',
      save: 'forge16',
      caption: { 'en-US': 'Every forge chance is shown before you try', 'tr-TR': 'Demircide her şans denemeden önce yazar' },
      async run(g) {
        await g.run(600, 120);
        await g.act('forge');
        await g.scene('forge');
        await g.run(800, 120);
        await g.act('forge');
        await g.until((s) => s.data.shown === 16, { step: 60, max: 10000, what: 'forge payoff' });
        await g.run(1100, 40);
      },
    },
    {
      id: 'dunes',
      save: 'azure',
      caption: { 'en-US': 'Swinging ledges, elites and arrow-catchers', 'tr-TR': 'Sallanan platformlar, seçkin rakipler, ok yakalayanlar' },
      async run(g) {
        await toChapter(g, 2);
        await playUntil(g, (d) => d.wave >= 18 && d.phase === 'play', { god: true });
        await g.run(1500, 150);
        await settle(g, { god: true });
        await g.act('aimbot', { error: 0.002 });
        await g.run(160, 40);
      },
    },
    {
      id: 'cards',
      save: 'golden',
      caption: { 'en-US': 'Pick a trick each stage and find the combos', 'tr-TR': 'Her aşamada bir numara seç, uyumları yakala' },
      async run(g) {
        await toChapter(g, 1);
        for (let i = 0; i < 12; i++) {
          await playUntil(g, (d) => d.phase === 'cards', { pick: false, god: true });
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
      caption: { 'en-US': 'Climb 12 ranks and beat your own records', 'tr-TR': '12 rütbeyi tırman, kendi rekorlarını kır' },
      async run(g) {
        await g.run(600, 120);
        await g.act('ranks');
        await g.scene('ranks');
        await g.run(1500, 120);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Knock them off, forge a blazing bow!', 'tr-TR': 'Okçuları düşür, yayını parlat!' },
    cards: [
      ['glow', 40, 200, 640, 896],
      ['boss', 40, 300, 600, 840],
    ],
  },
};
