// Store listing config for Fossil Odds (games/fosil). Read by store/tools/*.mjs.
// Shots drive the real game through its ?test=1 hook (packages/core/README.md). Progress comes
// from saves staged with the game's own pure sim (src/sim/dig.ts) played by the same scripted
// "fast" player the pacing test uses (./career.mjs), so every screen is a state a player reaches
// by playing: layers opened by dig power, relics from fragments, ranks from the real score.
import { loadMods, newCareer, playFast } from './career.mjs';

// every one-time tip the dig screen has (none of them over a screenshot)
const TIPS = ['odds', 'dust', 'power', 'combo', 'assistant', 'fuse', 'glint', 'luck', 'locked', 'fever', 'pity', 'chain', 'relic', 'cavein', 'boss', 'golden', 'vein', 'unstable', 'twin', 'rank', 'daily', 'expedition', ...Array.from({ length: 10 }, (_, i) => `deeper-${i}`)];
const SAVE_KEY = 'oyun:fosil:save';
const SAVE_VERSION = 2;
/** The career ran over the days before the capture (record dates), the last dig today. */
const DAY = 86_400_000;

function finish(save, patch = {}) {
  // no glint mid-air, nothing "while away", the rank-up already celebrated
  return { v: SAVE_VERSION, data: { ...save, tips: TIPS, glint: null, glintIn: 30, idle: 0, boost: 0, ...patch } };
}

/** Tap (instantly, no time passing) until `test(data)` holds; returns the data. */
async function tapUntil(g, test, max = 6000, chunk = 1) {
  return g.page.evaluate(
    ([max, chunk, src]) => {
      const H = window.__OYUN__;
      const ok = new Function('d', `return (${src})(d)`);
      for (let i = 0; i < max; i += chunk) {
        H.act('tap', chunk);
        const d = H.state().data;
        if (ok(d)) return d;
      }
      throw new Error('tapUntil: condition never met');
    },
    [max, chunk, test.toString()],
  );
}

async function toDig(g, layer) {
  await g.act('play');
  await g.scene('dig');
  await g.run(600);
  if (layer !== undefined && (await g.data()).layer !== layer) {
    await g.act('travel', layer);
    await g.run(900);
  }
}

export default {
  slug: 'fosil',
  name: { 'en-US': 'Fossil Odds', 'tr-TR': 'Fosil Şansı' },
  seed: 1,

  // Look of the store frame around screenshots and of the feature graphic (game palette).
  look: {
    bg: ['#3d2819', '#1d120b'],
    band: ['#5a3b24', '#4a301d', '#6d4628', '#3f2817'],
    accent: '#f2c46d',
    ink: '#1a0f08',
    text: '#fff6e6',
    pattern: 'strata',
    frame: '#f2c46d66',
  },

  // Icon: one golden ammonite on sediment, in the family frame (store/tools/lib/icons.mjs).
  icon: { emblem: 'ammonite', bg: ['#9a6334', '#2e1a0c'], glow: '#ffd27a', mono: true },

  async stage(load) {
    const m = await loadMods(load);
    const c = newCareer(m, this.seed);
    // the dig started some days ago; the daily dig was claimed on each of the last days
    const startMs = Date.now() - 9 * DAY;
    const today = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / DAY);
    const snaps = {};
    const save = () => c.sim.toSave();
    // first run: play until each layer of interest is reached and has been dug for a while
    const at = (layer, minutes) => {
      playFast(m, c, { minutes: 600, until: (s) => s.layer === layer && s.unlocked === layer, expedition: false, startMs });
      playFast(m, c, { minutes, expedition: false, startMs, until: (s) => s.layer !== layer });
      return save();
    };
    snaps.amber = at(5, 6);
    snaps.coal = null;
    snaps.magma = at(8, 8);
    snaps.seas = at(9, 10);
    if (!c.sim.canExpedition) playFast(m, c, { minutes: 600, until: (s) => s.canExpedition, expedition: false, startMs });
    for (let d = today - 3; d <= today; d++) c.sim.claimDaily(d);
    snaps.seas = save();
    // the Coal Swamp's hard veins: a second career stopped there (layer 5, index 4)
    const c2 = newCareer(m, this.seed + 1);
    playFast(m, c2, { minutes: 600, until: (s) => s.layer === 4 && s.unlocked === 4, expedition: false, startMs });
    playFast(m, c2, { minutes: 4, expedition: false, startMs, until: (s) => s.layer !== 4 });
    snaps.coal = c2.sim.toSave();
    // A save from just before a 1 in 10,000+ tap find in Magma Vents, so the ceremony comes within
    // a few hundred taps (tapping only, as the shot does: no time passes, no assistant rolls).
    let grand = null;
    {
      const sim = new m.DigSim(this.seed, { ...snaps.magma, combo: 1, idle: 0 });
      let before = sim.toSave();
      for (let i = 0; i < 400_000 && !grand; i++) {
        const r = sim.tap();
        const finds = [r.find, ...r.extra].filter(Boolean);
        if (!finds.length) continue;
        if (finds.some((f) => f.fossil.odds >= 10_000)) grand = before;
        before = sim.toSave();
      }
    }
    if (!grand) throw new Error('fosil stage: no 1 in 10,000+ find in 400,000 Magma Vents taps');
    const day = { daily: { day: today, streak: 4 } };
    return {
      amber: finish(snaps.amber, { combo: 0.8, ...day }),
      coal: finish(snaps.coal, { combo: 0.6, ...day }),
      magma: finish(snaps.magma, { combo: 0.9, ...day }),
      grand: finish(grand, { combo: 1, ...day }),
      seas: finish(snaps.seas, { combo: 1 }),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),
  stampLastSeen: [[SAVE_KEY, 'data', 'lastSeen']],

  shots: [
    {
      id: 'dig',
      save: 'amber',
      caption: { 'en-US': 'Tap to dig. Every find shows its true odds', 'tr-TR': 'Dokun ve kaz: her bulgu gerçek şansını gösterir' },
      async run(g) {
        await toDig(g, 5);
        const before = (await g.data()).rolls;
        await tapUntil(g, `(d) => d.rolls > ${before}`, 600);
        await g.run(160, 40);
        await tapUntil(g, '(d) => d.blockDamage / d.blockHp > 0.4', 400);
        await g.run(110, 55);
      },
    },
    {
      id: 'grand',
      save: 'grand',
      caption: { 'en-US': 'Chase the one-in-a-million find', 'tr-TR': 'Milyonda bir bulgunun peşine düş' },
      async run(g) {
        await toDig(g, 8);
        await tapUntil(g, (d) => d.ceremony === 'grand', 4000);
        await g.run(2700, 150);
      },
    },
    {
      id: 'boss',
      save: 'seas',
      caption: { 'en-US': 'Ten layers, each with a twist, down to a boss block', 'tr-TR': 'Her biri ayrı sürprizli on katman ve patron blok' },
      async run(g) {
        await toDig(g, 9);
        await tapUntil(g, (d) => d.block === 'boss' && !d.ceremony && !d.overlay, 6000);
        // let the chain labels and the "boss surfaces" toast clear, then strike at a finger's pace.
        // Each phase change floats a banner up onto the status line (the helper's hits cross
        // phases too), so the captured strike is one with no phase change in the 1.4 s before it.
        await g.run(4000, 200);
        const phase = (d) => (d.block === 'boss' ? Math.floor(d.blockDamage / (d.blockHp / 3)) : -1);
        for (let i = 0; i < 40; i++) {
          const p0 = phase(await g.data());
          let calm = true;
          for (let k = 0; k < 7 && calm; k++) {
            await g.run(200, 100);
            calm = phase(await g.data()) === p0;
          }
          const d = await g.data();
          if (d.block !== 'boss') throw new Error('boss block broke before a clean strike');
          const third = d.blockHp / 3;
          const safe = calm && d.blockDamage + 2.5 * d.digPower < (p0 + 1) * third;
          await g.act('tap', 1);
          await g.run(120, 40);
          if (safe && phase(await g.data()) === p0) return;
        }
        throw new Error('no clean boss strike');
      },
    },
    {
      id: 'vein',
      save: 'coal',
      caption: { 'en-US': 'Hold, then let go to smash hard veins', 'tr-TR': 'Sert damarları basılı tutup parçala' },
      async run(g) {
        await toDig(g, 4);
        await tapUntil(g, (d) => d.block === 'vein' && !d.ceremony && !d.overlay, 3000);
        await g.run(300, 60);
        const b = (await g.data()).ui.block;
        await g.page.mouse.move(b.x + 40, b.y + 30);
        await g.page.mouse.down();
        await g.run(900, 60);
      },
    },
    {
      id: 'fever',
      save: 'magma',
      caption: { 'en-US': 'Keep the combo going and set off fever', 'tr-TR': 'Komboyu sürdür, ateş moduna gir' },
      async run(g) {
        await toDig(g, 8);
        for (let i = 0; i < 400; i++) {
          const d = await g.data();
          if (d.fever > 6) break;
          if (d.overlay) await g.act('tap', 1);
          await g.act('tap', 1);
          await g.run(200, 100);
        }
        if ((await g.data()).glint) await g.act('glint');
        await g.run(900, 100);
      },
    },
    {
      id: 'museum',
      save: 'seas',
      caption: { 'en-US': 'Fill your museum: 120 fossils in ten layers', 'tr-TR': 'Müzeni doldur: on katmanda 120 fosil' },
      async run(g) {
        await toDig(g);
        await g.act('museum');
        await g.scene('museum');
        await g.act('tab', 7);
        await g.run(900, 100);
      },
    },
    {
      id: 'ranks',
      save: 'seas',
      caption: { 'en-US': 'Climb 12 ranks and beat your own records', 'tr-TR': '12 rütbeyi tırman, kendi rekorlarını kır' },
      async run(g) {
        await toDig(g);
        await g.act('ranks');
        await g.scene('ranks');
        await g.run(1200, 120);
      },
    },
    {
      id: 'expedition',
      save: 'seas',
      caption: { 'en-US': 'Set off on expeditions: dig deeper, keep your museum', 'tr-TR': 'Sefere çık: daha derine kaz, müzen seninle kalsın' },
      async run(g) {
        await toDig(g);
        await g.act('ranks');
        await g.scene('ranks');
        await g.run(800, 120);
        await g.act('expedition');
        await g.run(1000, 100);
      },
    },
  ],

  // Feature graphic: which captures to crop for the scene (from .raw/<locale>/).
  feature: {
    tagline: { 'en-US': 'Every fossil shows its true odds', 'tr-TR': 'Her fosil gerçek şansını gösterir' },
    // [shot id, crop in logical 720×1280 px: x, y, w, h]
    cards: [
      ['dig', 90, 230, 540, 660],
      ['grand', 110, 230, 500, 700],
    ],
  },
};
