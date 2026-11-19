// Fossil Odds / Fosil Şansı — games/fosil (Phaser).
//
// Capture: the store's capture build (2× render) opened with the store's openGame (?test=1, paused
// fake clock). Saves are the store listing's own staging (store/fosil/listing.config.mjs stage():
// the pacing test's "fast" player digs the ten layers in the game's pure sim; the grand-find save
// is the state just before a 1 in 10,000+ find). Taps in the recorded beats are real mouse clicks
// on the block at a finger's pace (the pickaxe swings to the click point); the hard vein is a real
// press held 0.9 s. Only the wait for the grand find taps through the test hook with no time
// passing (as the listing's shot does), and the beat starts at that tap.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, STORE, launchGpu, work } from '../lib/env.mjs';
import { captureBuild, serve } from '../../lib/build.mjs';
import { openGame } from '../../lib/browser.mjs';
import { withGameModules } from '../../lib/sim.mjs';
import { Recorder } from '../lib/record.mjs';

export const meta = {
  slug: 'fosil',
  name: { tr: 'Fosil Şansı', en: 'Fossil Odds' },
  icon: join(STORE, 'fosil', 'icon', 'icon.svg'),
  sfx: join(REPO, 'games', 'fosil', 'src', 'sfx.ts'),
  palette: { bg1: '#9a6334', bg2: '#1d120b', accent: '#f2c46d', hot: '#e8603c', ink: '#1a0f08', text: '#fff6e6', glow: '#ffd27a' },
  music: { bpm: 120, root: 48, mode: 'major', style: 'warm' },
};

async function stage(fresh) {
  const cache = work('fosil', 'saves.json');
  if (!fresh && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const cfg = (await import('../../../fosil/listing.config.mjs')).default;
  const saves = await withGameModules('fosil', (load) => cfg.stage(load));
  mkdirSync(work('fosil'), { recursive: true });
  writeFileSync(cache, JSON.stringify(saves));
  return saves;
}

const PAGE_SCRIPT = `
(() => {
  let prev = null;
  window.__vstep = () => {
    const H = window.__OYUN__;
    if (!H || !H.ready) return null;
    const s = H.state();
    const d = s.data;
    const ev = [];
    if (s.scene !== 'dig' || !d) { prev = null; return ev; }
    if (prev) {
      if (d.taps > prev.taps) ev.push({ type: 'tap', sfx: 'dig', volume: 0.8 });
      if (d.rolls > prev.rolls) {
        const odds = d.lastFind ? d.lastFind.odds : 1;
        ev.push({ type: 'find', odds, sfx: odds >= 10000 ? 'longChime' : odds >= 100 ? 'chime' : 'crack', volume: odds >= 100 ? 1 : 0.7 });
        if (odds >= 10000) ev.push({ sfx: 'slam' });
      } else if (d.blockDamage < prev.blockDamage) ev.push({ type: 'break', sfx: 'crack' });
      if (d.fever > 0 && prev.fever <= 0) ev.push({ type: 'fever', sfx: 'fever' });
      if (d.block !== prev.block && d.block === 'boss') ev.push({ type: 'boss', sfx: 'gong' });
      if (d.relics > prev.relics) ev.push({ type: 'relic', sfx: 'relic' });
    }
    if (d.overlay && d.overlay !== 'grand') ev.push({ type: 'calm' });
    prev = { taps: d.taps, rolls: d.rolls, blockDamage: d.blockDamage, fever: d.fever, block: d.block, relics: d.relics };
    return ev;
  };
})();
`;

async function toDig(g, rec, layer) {
  await g.act('play');
  await g.scene('dig');
  await rec.skip(600);
  if (layer !== undefined && (await g.data()).layer !== layer) {
    await g.act('travel', layer);
    await rec.skip(1200);
  }
}

/** Real clicks on the block at `rate` taps per second for `ms` (recorded when a clip is open). */
async function tapFor(g, rec, ms, rate = 6, seed = 1) {
  const n = Math.round((ms / 1000) * rate);
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
  for (let i = 0; i < n; i++) {
    const d = await g.data();
    if (d.overlay === 'grand' || d.ceremony) {
      await rec.run(1000 / rate);
      continue;
    }
    const b = d.ui.block;
    await g.page.mouse.click(b.x + rnd() * 120, b.y + rnd() * 90);
    await rec.run(1000 / rate);
  }
}

const CLIPS = {
  /** tapping in the Amber Forest: pickaxe, chips, cracks, breaking blocks, finds with their odds */
  async dig(ctx) {
    const { g, rec } = await ctx.open('amber');
    await toDig(g, rec, 5);
    rec.start('dig');
    await tapFor(g, rec, 7000, 6.5, 3);
    rec.end();
  },

  /** a 1 in 10,000+ find in Magma Vents: the ceremony, from the tap that found it */
  async grand(ctx) {
    const { g, rec } = await ctx.open('grand');
    await toDig(g, rec, 8);
    // the wait for the find taps through the test hook with no time passing (no assistant rolls)
    const found = await g.page.evaluate(() => {
      const H = window.__OYUN__;
      for (let i = 0; i < 4000; i++) {
        H.act('tap', 1);
        if (H.state().data.ceremony === 'grand' || H.state().data.overlay === 'grand') return i;
      }
      return -1;
    });
    if (found < 0) throw new Error('grand: no 1 in 10,000+ find within 4000 taps');
    rec.start('grand');
    rec.mark('find');
    await rec.run(6500);
    rec.end();
  },

  /** Coal Swamp hard vein: press and hold, let go: the charged smash */
  async vein(ctx) {
    const { g, rec } = await ctx.open('coal');
    await toDig(g, rec, 4);
    for (let i = 0; i < 400; i++) {
      const d = await g.data();
      if (d.block === 'vein' && !d.ceremony && !d.overlay) break;
      await g.page.mouse.click(d.ui.block.x, d.ui.block.y);
      await rec.skip(150);
    }
    await rec.skip(400);
    rec.start('vein');
    await rec.run(300);
    const b = (await g.data()).ui.block;
    await g.page.mouse.move(b.x + 30, b.y + 20);
    await g.page.mouse.down();
    rec.mark('press');
    await rec.run(900);
    await g.page.mouse.up();
    rec.mark('smash');
    await rec.run(1400);
    await tapFor(g, rec, 1500, 6, 9);
    rec.end();
  },

  /** combo fever in Magma Vents */
  async fever(ctx) {
    const { g, rec } = await ctx.open('magma');
    await toDig(g, rec, 8);
    for (let i = 0; i < 600; i++) {
      const d = await g.data();
      if (d.fever > 0) break;
      if (d.overlay) await g.act('tap', 1);
      await g.page.mouse.click(d.ui.block.x, d.ui.block.y);
      await rec.skip(1000 / 7);
    }
    rec.start('fever');
    await tapFor(g, rec, 5000, 7.5, 13);
    rec.end();
  },

  /** First Seas boss block, struck through its phases */
  async boss(ctx) {
    const { g, rec } = await ctx.open('seas');
    await toDig(g, rec, 9);
    await g.page.evaluate(() => {
      const H = window.__OYUN__;
      for (let i = 0; i < 6000; i++) {
        const d = H.state().data;
        if (d.block === 'boss' && !d.ceremony && !d.overlay) return;
        H.act('tap', 1);
      }
    });
    await rec.skip(2500);
    rec.start('boss');
    await tapFor(g, rec, 6000, 6, 21);
    rec.end();
  },

  /** travel between layers: the strata rush */
  async travel(ctx) {
    const { g, rec } = await ctx.open('seas');
    await toDig(g, rec, 2);
    rec.start('travel');
    await rec.run(300);
    await g.act('travel', 6);
    await rec.run(2200);
    rec.end();
  },

  async museum(ctx) {
    const { g, rec } = await ctx.open('seas');
    await toDig(g, rec);
    await g.act('museum');
    await g.scene('museum');
    await rec.skip(500);
    rec.start('museum');
    await g.act('tab', 7);
    await rec.run(1300);
    await g.act('tab', 8);
    await rec.run(1300);
    rec.end();
  },

  async ranks(ctx) {
    const { g, rec } = await ctx.open('seas');
    await toDig(g, rec);
    await g.act('ranks');
    await g.scene('ranks');
    rec.start('ranks');
    await rec.run(1800);
    rec.mark('exp');
    await g.act('expedition');
    await rec.run(1800);
    rec.end();
  },
};

export async function record({ lang, root, only, log, fresh }) {
  log('fosil: staging (listing stage(): the pacing test\'s fast player)');
  const saves = await stage(fresh);
  const cfg = (await import('../../../fosil/listing.config.mjs')).default;
  log('fosil: capture build');
  const build = await captureBuild('fosil');
  const server = await serve(build.dir);
  const browser = await launchGpu();
  const problems = [];
  try {
    for (const [id, fn] of Object.entries(CLIPS)) {
      if (only && !only.includes(id)) continue;
      let cur = null;
      const ctx = {
        async open(saveName) {
          const g = await openGame(browser, build, { url: server.url, seed: cfg.seed ?? 1, lang, storage: cfg.storageFor(saves[saveName]), stampLastSeen: cfg.stampLastSeen ?? [] });
          await g.page.evaluate(PAGE_SCRIPT);
          cur = g;
          return { g, rec: new Recorder(g.page, root) };
        },
      };
      const t = Date.now();
      try {
        await fn(ctx);
        log(`fosil ${lang}: clip ${id} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
      } catch (e) {
        problems.push(`${id}: ${e.message}`);
        log(`fosil ${lang}: clip ${id} FAILED ${e.message}`);
      } finally {
        if (cur) {
          const errs = cur.errors.filter((e) => !/\[oyun\]/.test(e) || /missing string/.test(e));
          if (errs.length) problems.push(`${id}: ${errs.slice(0, 3).join(' | ')}`);
          await cur.close();
        }
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  return problems;
}

// ---------------------------------------------------------------- the edit
export function scoreEvent(e) {
  if (e.type === 'calm') return -6;
  if (e.type === 'find') return e.odds >= 100 ? 4 : 1.5;
  if (e.type === 'break') return 1;
  if (e.type === 'fever' || e.type === 'boss' || e.type === 'relic') return 4;
  if (e.type === 'tap') return 0.3;
  return 0;
}
export function shakeOn(e) {
  if (e.type === 'find') return e.odds >= 10000 ? 0.8 : e.odds >= 100 ? 0.3 : 0;
  if (e.type === 'break') return 0.12;
  if (e.type === 'fever') return 0.5;
  return 0;
}

const TXT = {
  tr: {
    dig: 'Dokun, *kaz*, fosil bul!', odds: 'Her bulgu *gerçek şansını* gösterir', grand: 'Milyonda birin *peşine* düş',
    vein: 'Sert damarı *basılı tut*, bırak!', fever: 'Komboyu sürdür: *ATEŞ MODU!*', boss: 'En dipte *patron blok*', bossK: 'İlk Denizler',
    travel: '*10 katman* aşağı in', museum: '*Müzeni* doldur: 120 fosil', ranks: '*Rütbeler* ve rekorlar', exp: '*Sefere* çık, daha derine kaz',
    soon: 'Yakında: *sıralama sistemi!*', sub: 'Dünya sıralaması yakında', stamp: 'YAKINDA',
  },
  en: {
    dig: 'Tap, *dig*, find fossils!', odds: 'Every find shows its *true odds*', grand: 'Chase the *one-in-a-million*',
    vein: '*Hold*, then smash hard veins', fever: 'Keep the combo: *FEVER!*', boss: 'A *boss block* at the bottom', bossK: 'First Seas',
    travel: 'Dig down through *10 layers*', museum: 'Fill your *museum*: 120 fossils', ranks: '*Ranks* and records', exp: 'Go on *expeditions*, dig deeper',
    soon: 'Leaderboards *coming soon!*', sub: 'Global rankings on the way', stamp: 'SOON',
  },
};

export function edit(lang) {
  const T = TXT[lang];
  return {
    beats: [
      { clip: 'dig', from: 0.1, dur: 3.0, caption: T.dig, pos: 'top', capY: 400, zoom: [1.12, 1.02], focus: [0.5, 0.55] },
      { clip: 'dig', from: { auto: true, min: 3.2 }, dur: 2.5, caption: T.odds, pos: 'top', capY: 400, trans: 'punch' },
      { clip: 'grand', from: ['find', -0.1], dur: 4.5, speed: [[0, 1.2], [1.6, 1.2], [1.9, 1]], caption: T.grand, pos: 'bottom', trans: 'flash', zoom: [1.0, 1.1] },
      { clip: 'vein', from: ['press', -0.4], dur: 3.0, caption: T.vein, pos: 'top', capY: 400, trans: 'whip' },
      { clip: 'fever', from: { auto: true, min: 0.2 }, dur: 3.0, caption: T.fever, pos: 'top', capY: 400, trans: 'punch' },
      { clip: 'boss', from: { auto: true, min: 0.2 }, dur: 3.0, caption: T.boss, kicker: T.bossK, pos: 'top', capY: 400, trans: 'whip', dir: -1 },
      { clip: 'travel', from: 0.2, dur: 2.0, caption: T.travel, pos: 'bottom', trans: 'zoom' },
      { clip: 'museum', from: 0.1, dur: 2.5, caption: T.museum, pos: 'bottom', trans: 'whip', capY: 1520 },
      { clip: 'ranks', from: 0.1, dur: 2.0, caption: T.ranks, pos: 'bottom', trans: 'whip', dir: -1, capY: 1520 },
      { clip: 'ranks', from: ['exp', 0], dur: 2.0, caption: T.exp, pos: 'bottom', trans: 'flash', capY: 1520 },
    ],
    end: { dur: 5.0, stampAt: 2.1 },
    endCard: { soon: T.soon, sub: T.sub, stamp: T.stamp },
  };
}
