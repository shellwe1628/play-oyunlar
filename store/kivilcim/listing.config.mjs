// Store listing config for Sparkrise (games/kivilcim). Read by store/tools/*.mjs.
// Shots drive the real game through its ?test=1 hook: act('start', {mode, level}) picks the run,
// act('autopilot', true) lets the game's own solver fly it (the same exact-replay plans its tests
// use), and the fake clock (store/tools/lib/browser.mjs) stops time on the frame we want.
// The "player" save is someone who has finished levels 1-7 with some gems and skins.

const SAVE_KEY = 'oyun:kivilcim:save';

function level(best, done, gemMask = 7) {
  return { best, attempts: done ? 3 : 6, gemMask, done };
}

async function startAuto(g, mode, lvl) {
  await g.run(400, 100);
  await g.act('start', { mode, level: lvl });
  await g.run(500, 100);
  await g.act('autopilot', true);
}

/** Fly until `test(data)` holds (checked every frame). */
async function flyUntil(g, test, { frame = 200, max = 60_000, what = 'moment' } = {}) {
  return g.until((s) => s.data.phase === 'dead' ? Promise.reject(new Error(`died at ${s.data.progress}%`)) : new Function('d', `return (${test})(d)`)(s.data), { step: frame, max, what });
}

export default {
  slug: 'kivilcim',
  name: { 'en-US': 'Sparkrise', 'tr-TR': 'Kıvılcım' },
  seed: 1,

  look: {
    bg: ['#9b2dff', '#ff2d95'],
    band: ['#ffffff'],
    accent: '#3ff6ff',
    ink: '#16032b',
    text: '#ffffff',
    stroke: 12,
    frame: '#3ff6ffaa',
    pattern: 'sparks',
  },

  // Icon: a glowing four-point spark climbing its zigzag trail, in the family frame.
  icon: { emblem: 'spark', bg: ['#ff4fa3', '#5a1aa8'], glow: '#ffe66b', mono: true },

  async stage() {
    const levels = [level(100, true), level(100, true), level(100, true), level(100, true), level(100, true, 5), level(100, true, 3), level(100, true, 6), level(64, false, 1), level(0, false, 0), level(0, false, 0)];
    const player = {
      v: 2,
      data: {
        unlocked: 8,
        levels,
        gems: 9,
        skin: { shape: 2, trail: 3, ownedShapes: 0b0000111, ownedTrails: 0b0001011 },
        endlessBest: 612,
        daily: { date: '', best: 0, streak: 0, lastDate: '', gems: [] },
        finishes: 9,
        played: true,
        tutorial: true,
      },
    };
    // all ten levels open (a player who has finished 1-9), for the later-level colour schemes
    const late = structuredClone(player);
    late.data.unlocked = 10;
    late.data.levels = late.data.levels.map((l, i) => (i < 9 ? level(100, true, i % 2 ? 7 : 5) : level(41, false, 1)));
    return { player, late };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  shots: [
    {
      id: 'climb',
      save: 'player',
      caption: { 'en-US': 'Hold to veer right, let go to veer left', 'tr-TR': 'Basılı tut sağa, bırak sola' },
      async run(g) {
        await startAuto(g, 'level', 2);
        await flyUntil(g, '(d) => d.progress >= 27');
        await g.run(140, 70);
      },
    },
    {
      id: 'close',
      save: 'player',
      caption: { 'en-US': 'Skim the walls for close calls', 'tr-TR': 'Duvarları sıyır, kıl payı kurtul' },
      async run(g) {
        await startAuto(g, 'level', 4);
        await flyUntil(g, '(d) => d.progress >= 20');
        const n = (await g.data()).nearMisses;
        await flyUntil(g, `(d) => d.nearMisses > ${n}`, { frame: 60 });
        await g.run(120, 60);
      },
    },
    {
      id: 'gate',
      save: 'late',
      caption: { 'en-US': 'Gates flip, speed up or shrink your spark', 'tr-TR': 'Kapılar kontrolleri çevirir, hızlandırır, küçültür' },
      async run(g) {
        await startAuto(g, 'level', 6);
        await flyUntil(g, "(d) => d.nextGate === 'flip' && d.nextGateIn < 900 && d.nextGateIn > 0", { max: 90_000, what: 'flip gate ahead' });
        await flyUntil(g, '(d) => d.flipped', { frame: 50 });
        await g.run(250, 50);
      },
    },
    {
      id: 'colours',
      save: 'late',
      caption: { 'en-US': 'Ten levels, each in its own colours', 'tr-TR': 'On bölüm, her biri kendi renginde' },
      async run(g) {
        await startAuto(g, 'level', 9);
        await flyUntil(g, '(d) => d.progress >= 42', { max: 90_000 });
        await g.run(100, 50);
      },
    },
    {
      id: 'finish',
      save: 'player',
      caption: { 'en-US': 'Reach 100% to clear the level', 'tr-TR': "%100'e ulaş, bölümü geç" },
      async run(g) {
        await startAuto(g, 'level', 3);
        await flyUntil(g, "(d) => d.phase === 'finishing' || d.phase === 'finished'", { max: 120_000, what: 'finish' });
        await g.run(600, 60);
      },
    },
    {
      id: 'endless',
      save: 'player',
      caption: { 'en-US': 'Endless mode: how high can you climb?', 'tr-TR': 'Sonsuz mod: ne kadar yükseğe çıkarsın?' },
      async run(g) {
        await startAuto(g, 'endless');
        await flyUntil(g, '(d) => d.height >= 190', { max: 90_000, what: 'endless height' });
        await g.run(100, 50);
      },
    },
    {
      id: 'skins',
      save: 'player',
      caption: { 'en-US': 'Spend gems on new sparks and trails', 'tr-TR': 'Elmaslarla yeni kıvılcım ve izler aç' },
      async run(g) {
        await g.run(600, 100);
        await g.act('skins');
        await g.run(800, 100);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Hold to go right, let go to go left', 'tr-TR': 'Bas sağa, bırak sola' },
    cards: [
      ['colours', 120, 200, 480, 853],
      ['close', 120, 200, 480, 853],
    ],
  },
};
