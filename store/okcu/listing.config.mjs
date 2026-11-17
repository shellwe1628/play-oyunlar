// Store listing config for Noodle Archers (games/okcu). Read by store/tools/*.mjs.
// Shots drive the real game through its ?test=1 hook (packages/core/README.md): the game's own
// scripted player ('aimbot', the careful profile from src/sim/aimbot.ts) shoots through the same
// release handler a finger uses, and the aiming shot is a real touch drag (Chrome DevTools touch
// events, as tests/e2e/smoke.spec.ts does). The "veteran" save is what a player has after a few
// runs: best wave 12, coins banked, a few permanent upgrades bought.

const SAVE_KEY = 'oyun:okcu:save';
const POWER_PICKS = ['split', 'double', 'fire', 'bounce', 'heavy', 'pierce', 'quick', 'vitality', 'shield', 'longsight', 'vampire', 'magnet'];

/**
 * Play (game time only, no frames) until `wave` is in its 'play' phase: the careful aimbot fires
 * whenever the bow is ready, cards are picked by preference. Fails if the run ends.
 */
async function playTo(g, wave, picks = POWER_PICKS, error = 0.004) {
  for (let round = 0; round < 40; round++) {
    const res = await g.page.evaluate(
      ([wave, error]) => {
        const H = window.__OYUN__;
        for (let i = 0; i < 3000; i++) {
          const d = H.state().data;
          if (d.phase === 'over' || d.phase === 'dying' || H.state().scene !== 'game') return { fail: `run ended on wave ${d.wave}` };
          if (d.wave >= wave && d.phase === 'play') return { done: true };
          if (d.phase === 'cards') return { cards: d.offer };
          if ((d.phase === 'title' || d.phase === 'play') && d.reload === 0) H.act('aimbot', { error });
          H.act('advance', 0.2);
        }
        return { fail: 'too long' };
      },
      [wave, error],
    );
    if (res.fail) throw new Error(`playTo(${wave}): ${res.fail}`);
    if (res.done) return;
    // the card screen needs real frames: the cards slam in before they take a pick
    await g.run(1000, 200);
    const rank = (id) => (picks.indexOf(id) < 0 ? 99 : picks.indexOf(id));
    let best = 0;
    res.cards.forEach((id, k) => {
      if (rank(id) < rank(res.cards[best])) best = k;
    });
    await g.act('pick-card', best);
    await g.run(400, 200);
  }
  throw new Error(`playTo(${wave}): too many waves`);
}

/** Fire one aimbot shot, then step short frames until `test(data)` holds (e.g. a knockout). */
async function shootAndWatch(g, test, frame = 30, max = 2500) {
  await g.act('aimbot', { error: 0.002 });
  for (let t = 0; t < max; t += frame) {
    await g.run(frame, frame);
    if (await g.page.evaluate((src) => new Function('d', `return (${src})(d)`)(window.__OYUN__.state().data), test)) return true;
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

  async stage() {
    const fresh = { v: 2, data: { best: 0, coins: 0, runs: 0, upgrades: { hp: 0, dmg: 0, coins: 0, reroll: 0, starter: 0 }, cosmetic: 'classic', dailyDate: '', dailyBest: 0 } };
    const veteran = { v: 2, data: { best: 12, coins: 412, runs: 7, upgrades: { hp: 3, dmg: 3, coins: 2, reroll: 0, starter: 0 }, cosmetic: 'feather', dailyDate: '', dailyBest: 0 } };
    return { fresh, veteran };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),

  shots: [
    {
      id: 'aim',
      save: 'fresh',
      caption: { 'en-US': 'Pull back, let go, knock them off their ledges', 'tr-TR': 'Geri çek, bırak, rakipleri platformdan düşür' },
      async run(g) {
        await g.run(1200, 120);
        const d = await g.data();
        const pull = d.drag.dead + d.solution.power * 0.92 * (d.drag.full - d.drag.dead);
        const a = d.solution.angle - 0.06;
        const t = await touch(g);
        const x0 = 470;
        const y0 = 760;
        await t.send('touchStart', [{ ...t.css(x0, y0), id: 1 }]);
        for (let i = 1; i <= 6; i++) {
          await t.send('touchMove', [{ ...t.css(x0 - (Math.cos(a) * pull * i) / 6, y0 - (Math.sin(a) * pull * i) / 6), id: 1 }]);
          await g.run(40, 40);
        }
        await g.run(500, 60);
      },
    },
    {
      id: 'headshot',
      save: 'fresh',
      caption: { 'en-US': 'Land a headshot for a slow-motion knockout', 'tr-TR': 'Kafadan vur, ağır çekimde nakavt et' },
      async run(g) {
        await playTo(g, 2);
        await g.run(2200, 110);
        await g.until((s) => s.data.reload === 0, { step: 60, max: 3000, what: 'reload' });
        const kos = (await g.data()).kos;
        const hit = await shootAndWatch(g, `(d) => d.kos > ${kos}`);
        if (!hit) throw new Error('no knockout from the shot');
        await g.run(60, 30);
      },
    },
    {
      id: 'cards',
      save: 'veteran',
      caption: { 'en-US': 'Pick a new trick after every wave', 'tr-TR': 'Her dalgadan sonra yeni bir numara seç' },
      async run(g) {
        await playTo(g, 3);
        await g.page.evaluate(() => {
          const H = window.__OYUN__;
          for (let i = 0; i < 400 && H.state().data.phase !== 'cards'; i++) {
            const d = H.state().data;
            if (d.reload === 0) H.act('aimbot', { error: 0.004 });
            H.act('advance', 0.2);
          }
        });
        await g.until((s) => s.data.phase === 'cards', { what: 'cards' });
        await g.run(2400, 200);
      },
    },
    {
      id: 'volley',
      save: 'veteran',
      caption: { 'en-US': 'Stack tricks: split, double and fire arrows', 'tr-TR': 'Numaraları birleştir: yelpaze, çift ve ateşli ok' },
      async run(g) {
        await playTo(g, 8);
        await g.run(2400, 120);
        await g.until((s) => s.data.reload === 0, { step: 60, max: 3000, what: 'reload' });
        await g.act('aimbot', { error: 0.01 });
        await g.run(500, 50);
      },
    },
    {
      id: 'boss',
      save: 'veteran',
      caption: { 'en-US': 'Every fifth wave: an armoured boss', 'tr-TR': 'Her beşinci dalgada zırhlı bir patron' },
      async run(g) {
        await playTo(g, 5);
        await g.run(1500, 100);
        await g.until((s) => s.data.reload === 0, { step: 60, max: 3000, what: 'reload' });
        await g.act('aimbot', { error: 0.002 });
        await g.run(240, 40);
      },
    },
    {
      id: 'bomber',
      save: 'veteran',
      caption: { 'en-US': 'New foes: shields, jumpers and bombers', 'tr-TR': 'Yeni rakipler: kalkanlı, zıpzıp ve bombacı' },
      async run(g) {
        await playTo(g, 6);
        await g.run(700, 100);
      },
    },
    {
      id: 'shop',
      save: 'veteran',
      caption: { 'en-US': 'Spend coins on upgrades and new hats', 'tr-TR': 'Altınları geliştirmelere ve şapkalara harca' },
      async run(g) {
        await g.run(600, 120);
        await g.act('shop');
        await g.scene('shop');
        await g.run(700, 100);
      },
    },
  ],

  feature: {
    tagline: { 'en-US': 'Pull back, let go, knock them off!', 'tr-TR': 'Geri çek, bırak, düşür!' },
    cards: [
      ['volley', 0, 260, 480, 853],
      ['headshot', 150, 150, 480, 853],
    ],
  },
};
