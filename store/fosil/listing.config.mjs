// Store listing config for Fossil Odds (games/fosil). Read by store/tools/*.mjs.
// Shots drive the real game through its ?test=1 hook (packages/core/README.md). Progress comes
// from saves staged with the game's own pure sim (src/sim/dig.ts) played by the same scripted
// "fast" player the pacing test uses, so every screen is a state a player reaches by playing.

const TIPS = ['odds', 'dust', 'power', 'combo', 'assistant', 'deeper-1', 'deeper-2', 'deeper-3', 'glint', 'fuse', 'luck', 'locked'];
const SAVE_KEY = 'oyun:fosil:save';

/** The pacing test's fast policy: 5 taps/s, glints at once, cheapest upgrade, always travel down. */
function play(sim, UPGRADE_ORDER, seconds, onStep) {
  const DT = 0.1;
  let acc = 0;
  for (let i = 1; i <= Math.round(seconds / DT); i++) {
    if (onStep && onStep(sim, i * DT) === false) return;
    acc += 5 * DT;
    while (acc >= 1) {
      acc -= 1;
      sim.tap();
    }
    sim.tick(DT);
    if (sim.glint) sim.tapGlint();
    for (;;) {
      let best = null;
      for (const id of UPGRADE_ORDER) {
        if (id === 'offline') continue;
        const c = sim.upgradeCost(id);
        if (c === null) continue;
        if (best === null || c < sim.upgradeCost(best)) best = id;
      }
      if (best === null || !sim.buy(best)) break;
    }
    if (sim.unlocked > sim.layer) sim.travel(sim.unlocked);
  }
}

function finish(save, patch = {}) {
  // no tutorial tips over the screenshots, no glint mid-air, nothing "while away"
  return { v: 1, data: { ...save, tips: TIPS, glint: null, glintIn: 30, idle: 0, boost: 0, ...patch } };
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
  await g.run(500);
  if (layer !== undefined && (await g.data()).layer !== layer) {
    await g.act('travel', layer);
    await g.run(700);
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
    const { DigSim } = await load('/src/sim/dig.ts');
    const { UPGRADE_ORDER } = await load('/src/sim/data.ts');
    const at = (minutes) => {
      const sim = new DigSim(this.seed);
      play(sim, UPGRADE_ORDER, minutes * 60);
      return sim;
    };
    const ice = at(4);
    const creta = at(14);
    const deep = at(26);
    // A save from just before a 1 in 10,000+ tap find in the Deep Sea, so the ceremony comes
    // within a few hundred taps instead of thousands (which would inflate every HUD number).
    let grand = null;
    {
      // keep digging the Deep Sea by tapping (and spending dust like the policy) until a tap
      // breaks a block into a 1 in 10,000+ find; keep the save from just before that block
      const sim = new DigSim(this.seed, { ...deep.toSave(), combo: 1, idle: 0 });
      let before = sim.toSave();
      for (let i = 0; i < 400_000 && !grand; i++) {
        const r = sim.tap();
        if (!r.find) continue;
        if (r.find.fossil.odds >= 10_000) grand = before;
        for (;;) {
          let best = null;
          for (const id of UPGRADE_ORDER) {
            if (id === 'offline') continue;
            const c = sim.upgradeCost(id);
            if (c !== null && (best === null || c < sim.upgradeCost(best))) best = id;
          }
          if (best === null || !sim.buy(best)) break;
        }
        before = sim.toSave();
      }
    }
    if (!grand) throw new Error('fosil stage: no 1 in 10,000+ find in 400,000 Deep Sea taps');
    return {
      ice: finish(ice.toSave(), { combo: 0.7 }),
      creta: finish(creta.toSave(), { combo: 0.9 }),
      deep: finish(deep.toSave(), { combo: 1 }),
      glint: finish(creta.toSave(), { combo: 1, glintIn: 0.6 }),
      grand: finish(grand, { combo: 1 }),
    };
  },
  storageFor: (save) => ({ [SAVE_KEY]: save }),
  stampLastSeen: [[SAVE_KEY, 'data', 'lastSeen']],

  shots: [
    {
      id: 'dig',
      save: 'creta',
      caption: { 'en-US': 'Tap to dig. Every find shows its true odds', 'tr-TR': 'Dokun ve kaz: her bulgu gerçek şansını gösterir' },
      async run(g) {
        await toDig(g, 2);
        // break one block (a common find pops out with its odds), then crack the next one a bit
        const before = (await g.data()).rolls;
        await tapUntil(g, `(d) => d.rolls > ${before}`, 400);
        await g.run(120, 60);
        await tapUntil(g, '(d) => d.blockDamage / d.blockHp > 0.45', 400);
        await g.run(140, 70);
      },
    },
    {
      id: 'grand',
      save: 'grand',
      caption: { 'en-US': 'Chase the one-in-a-million find', 'tr-TR': 'Milyonda bir bulgunun peşine düş' },
      async run(g) {
        await toDig(g, 3);
        await tapUntil(g, (d) => d.ceremony === 'grand', 4000);
        await g.run(2700, 150);
      },
    },
    {
      id: 'glint',
      save: 'glint',
      caption: { 'en-US': 'Catch the glint: one roll at 10× luck', 'tr-TR': 'Parıltıyı yakala: 10× şansla bir çekiliş' },
      async run(g) {
        await toDig(g, 2);
        // full combo, and a block with a few taps left (the glint sits on the rock)
        await tapUntil(g, '(d) => d.combo >= 0.95 && (d.blockHp - d.blockDamage) / d.digPower > 2.2', 200);
        await g.until((s) => s.data.glint === true, { step: 150, max: 6000, what: 'glint' });
        await g.run(450, 90);
      },
    },
    {
      id: 'fuse',
      save: 'ice',
      caption: { 'en-US': 'Three copies fuse into bronze, silver and gold', 'tr-TR': 'Üç kopya birleşir: bronz, gümüş, altın' },
      async run(g) {
        await toDig(g, 1);
        await tapUntil(g, (d) => d.fusing === true, 3000);
        await g.run(650, 65);
      },
    },
    {
      id: 'upgrades',
      save: 'creta',
      caption: { 'en-US': 'Upgrade your pick, lucky charm and assistant', 'tr-TR': 'Kazmanı, uğur taşını ve yardımcını geliştir' },
      async run(g) {
        await toDig(g, 2);
        await tapUntil(g, '(d) => d.blockDamage / d.blockHp > 0.2 && (d.blockHp - d.blockDamage) / d.digPower > 1.2', 400);
        await g.act('drawer');
        await g.run(800, 100);
      },
    },
    {
      id: 'deep',
      save: 'deep',
      caption: { 'en-US': 'Dig through four ages, down to the deep sea', 'tr-TR': 'Dört çağı kaz, derin denize kadar in' },
      async run(g) {
        await toDig(g, 3);
        await tapUntil(g, (d) => d.ceremony === 'card' && d.lastFind && d.lastFind.odds >= 100 && d.lastFind.odds < 10_000, 3000);
        await g.run(900, 90);
      },
    },
    {
      id: 'museum',
      save: 'deep',
      caption: { 'en-US': 'Fill your museum: 48 fossils to find', 'tr-TR': 'Müzeni doldur: bulunacak 48 fosil' },
      async run(g) {
        await toDig(g);
        await g.act('museum');
        await g.scene('museum');
        await g.act('tab', 2);
        await g.run(700, 100);
      },
    },
  ],

  // Feature graphic: which captures to crop for the scene (from .raw/<locale>/).
  feature: {
    tagline: { 'en-US': 'Every fossil shows its true odds', 'tr-TR': 'Her fosil gerçek şansını gösterir' },
    // [shot id, crop in logical 720×1280 px: x, y, w, h]
    cards: [
      ['deep', 120, 120, 480, 853],
      ['grand', 120, 250, 480, 853],
    ],
  },
};
