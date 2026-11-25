// Sparkrise / Kıvılcım — games/kivilcim (Phaser).
//
// Capture: the store's capture build (store/tools/lib/build.mjs: the real game at 2× render
// resolution) opened with the store's openGame (?test=1 hook, paused fake clock). The save and
// the flown lines come from the store listing's own staging (store/kivilcim/listing.config.mjs
// stage(): the human model plays all 40 levels, settle() gives stars, feats and earned trails,
// trails are bought with buySkin). Flights use the listing's takeoff(): the line a person flies
// (the solver's "comfort" objective, every gem), sent through the game's real press/release
// path ('hold') tick-exactly; for the mechanic levels the listing does not keep, the same
// gemLine/replay from store/kivilcim/career.mjs computes the line. The death beat is a real
// crash: the line is followed, then the finger stays off and the spark hits the wall.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, STORE, launchGpu, work } from '../lib/env.mjs';
import { captureBuild, serve } from '../../lib/build.mjs';
import { openGame } from '../../lib/browser.mjs';
import { withGameModules } from '../../lib/sim.mjs';
import { Recorder } from '../lib/record.mjs';

export const meta = {
  slug: 'kivilcim',
  name: { tr: 'Kıvılcım', en: 'Sparkrise' },
  icon: join(STORE, 'kivilcim', 'icon', 'icon.svg'),
  sfx: join(REPO, 'store', 'tools', 'video', 'games', 'kivilcim.sfx.ts'),
  palette: { bg1: '#5a1aa8', bg2: '#14062b', accent: '#3ff6ff', hot: '#ff4fa3', ink: '#14062b', text: '#ffffff', glow: '#ffe66b' },
  music: { bpm: 120, root: 45, mode: 'minor', style: 'neon' },
};

/** Mechanic levels flown in the montage besides the listing's (split, lasers, the world-2 boss finale, pistons, portals). */
const EXTRA = [11, 13, 20, 23, 31];

async function stage(fresh) {
  const cache = work('kivilcim', 'stage.json');
  if (!fresh && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const cfg = (await import('../../../kivilcim/listing.config.mjs')).default;
  const { LINES } = await import('../../../kivilcim/listing.config.mjs');
  const { loadMods, gemLine, replay } = await import('../../../kivilcim/career.mjs');
  const out = await withGameModules('kivilcim', async (load) => {
    const saves = await cfg.stage(load);
    const M = await loadMods(load);
    for (const id of EXTRA) {
      const track = M.L.buildLevel(id);
      const held = gemLine(M, track);
      const { sim, x, switches } = replay(M, track, held);
      if (!sim.finished) throw new Error(`kivilcim: line of level ${id} did not finish`);
      LINES.set(`L${id}`, { held, x, switches, trackLength: Math.round(track.length) });
    }
    const lines = {};
    for (const [k, v] of LINES) lines[k] = { held: Array.from(v.held), x: Array.from(v.x), switches: v.switches, trackLength: v.trackLength };
    return { saves, lines };
  });
  mkdirSync(work('kivilcim'), { recursive: true });
  writeFileSync(cache, JSON.stringify(out));
  return out;
}

// page side: sound cues and "calm" marks from the test hook's state, one read per clock step
const PAGE_SCRIPT = `
(() => {
  let prev = null;
  window.__vstep = () => {
    const H = window.__OYUN__;
    if (!H || !H.ready) return null;
    const s = H.state();
    const d = s.data;
    const ev = [];
    if (s.scene !== 'game' || !d) { prev = null; ev.push({ type: 'calm' }); return ev; }
    if (prev && prev.level === d.level) {
      if (d.gems > prev.gems) ev.push({ type: 'gem', sfx: '@coin', pitch: d.gems * 3, volume: 0.8 });
      if (d.phase === 'dead' && prev.phase !== 'dead') ev.push({ type: 'death', sfx: 'death' });
      if (d.phase === 'finishing' && prev.phase !== 'finishing') ev.push({ type: 'finish', sfx: 'ring' }, { sfx: '@win', volume: 0.8 });
      if (d.phase === 'playing' && prev.phase === 'playing') {
        if (d.speed > prev.speed * 1.15) ev.push({ type: 'gate', sfx: 'gate' });
        else if (d.speed < prev.speed * 0.87) ev.push({ type: 'gate', sfx: 'gateSlow' });
        if (d.flipped !== prev.flipped || d.size !== prev.size) ev.push({ type: 'gate', sfx: 'gate', pitch: 3 });
        if (d.edge > prev.edge) ev.push({ type: 'edge', sfx: 'edge', pitch: Math.min(14, d.edge * 2) });
      }
      if (d.held !== prev.held) ev.push({ type: 'hold', on: d.held });
    }
    if (d.phase !== 'playing' && d.phase !== 'finishing') ev.push({ type: 'calm' });
    prev = { level: d.level, gems: d.gems, phase: d.phase, speed: d.speed, flipped: d.flipped, size: d.size, edge: d.edge, held: d.held };
    return ev;
  };
})();
`;

/** g wrapped so the listing's helpers (which call g.run) drive the recorder. */
const via = (g, rec) => ({ ...g, run: (ms) => rec.run(ms) });

async function start(g, rec, level) {
  await rec.skip(400);
  await g.act('start', { mode: 'level', level });
  await rec.skip(300);
}

const CLIPS = {};

// Flights: [clip id, save, level, from fraction, seconds]
const FLIGHTS = [
  ['mirror', 'prism', 34, 0.5, 7],
  ['wind', 'flame', 21, 0.3, 6],
  ['spin', 'voidwalker', 16, 0.45, 5],
  ['boss', 'aurora', 30, 0.55, 6],
  ['dark', 'supernova', 26, 0.36, 5],
  ['lasers', 'sunset', 13, 0.4, 4],
  ['split', 'rainbow', 11, 0.35, 4],
  ['pistons', 'champion', 23, 0.4, 4],
  ['portals', 'aurora', 31, 0.4, 4],
];
for (const [id, save, level, from, secs] of FLIGHTS) {
  CLIPS[id] = async (ctx) => {
    const { g, rec, L } = await ctx.open(save);
    await start(g, rec, level);
    const f = await L.takeoff(via(g, rec), `L${level}`);
    const n = L.LINES.get(`L${level}`).held.length;
    await f.to(Math.round(n * from));
    rec.start(id);
    await f.to(Math.round(n * from) + Math.round(120 * secs));
    rec.end();
  };
}

Object.assign(CLIPS, {
  /** a real crash: the finger lets go and stays off, the spark shatters, a tap retries at once */
  async death(ctx) {
    const { g, rec, L } = await ctx.open('flame');
    await start(g, rec, 16);
    const f = await L.takeoff(via(g, rec), 'L16');
    const n = L.LINES.get('L16').held.length;
    await f.to(Math.round(n * 0.3));
    rec.start('death', { density: 2 });
    await f.to(Math.round(n * 0.3) + 120 * 1.2);
    const held = (await g.data()).held;
    await g.act('hold', !held);
    rec.mark('let');
    for (let i = 0; i < 120 && (await g.data()).phase !== 'dead'; i++) await rec.run(1000 / 30);
    rec.mark('dead');
    await rec.run(1500);
    await g.act('hold', true);
    rec.mark('retry');
    await rec.run(700);
    await g.act('hold', false);
    await rec.run(700);
    await g.act('hold', true);
    await rec.run(600);
    rec.end();
  },

  /** the finish: rings, confetti, the 100 % slam, the slow coast, the card */
  async finish(ctx) {
    const { g, rec, L } = await ctx.open('sunset');
    await start(g, rec, 20);
    if (!L.LINES.get('L20')) throw new Error('no L20 line');
    const f = await L.takeoff(via(g, rec), 'L20');
    const n = L.LINES.get('L20').held.length;
    await f.to(n - 120 * 3);
    rec.start('finish', { density: 2 });
    await f.to(n);
    for (let i = 0; i < 30 * 6; i++) await rec.run(1000 / 30);
    rec.end();
  },

  /** the trail shop: the live preview, then three trails one after another */
  async shop(ctx) {
    const { g, rec } = await ctx.open('supernova');
    await rec.skip(600);
    await g.act('skins');
    await g.scene('skins');
    await g.act('tab', 'trail');
    await g.act('select', { kind: 'trail', i: 16 });
    rec.start('shop');
    await rec.run(1800);
    rec.mark('t2');
    await g.act('select', { kind: 'trail', i: 19 });
    await rec.run(1500);
    rec.mark('t3');
    await g.act('select', { kind: 'trail', i: 12 });
    await rec.run(1500);
    rec.end();
  },

  async levels(ctx) {
    const { g, rec } = await ctx.open('aurora');
    await rec.skip(600);
    await g.act('levels');
    await g.scene('levels');
    rec.start('levels');
    await rec.run(1000);
    await g.act('world', 2);
    await rec.run(900);
    await g.act('world', 3);
    await rec.run(900);
    await g.act('world', 4);
    await rec.run(1200);
    rec.end();
  },

  async ranks(ctx) {
    const { g, rec } = await ctx.open('aurora');
    await rec.skip(600);
    await g.act('ranks');
    await g.scene('ranks');
    rec.start('ranks');
    await rec.run(2600);
    rec.end();
  },
});

export async function record({ lang, root, only, log, fresh }) {
  log('kivilcim: staging (listing stage(): human model career, solver lines)');
  const st = await stage(fresh);
  const listing = await import('../../../kivilcim/listing.config.mjs');
  const cfg = listing.default;
  // the listing's helpers read its LINES map: fill it from the cache
  const L = { takeoff: listing.takeoff, LINES: listing.LINES };
  for (const [k, v] of Object.entries(st.lines)) L.LINES.set(k, { ...v, x: Float64Array.from(v.x) });
  log('kivilcim: capture build');
  const build = await captureBuild('kivilcim');
  const server = await serve(build.dir);
  const browser = await launchGpu();
  const problems = [];
  try {
    for (const [id, fn] of Object.entries(CLIPS)) {
      if (only && !only.includes(id)) continue;
      let cur = null;
      const ctx = {
        lang,
        async open(saveName) {
          const save = st.saves[saveName];
          if (!save) throw new Error(`no save ${saveName}`);
          const g = await openGame(browser, build, { url: server.url, seed: cfg.seed ?? 1, lang, storage: cfg.storageFor(save) });
          await g.page.evaluate(PAGE_SCRIPT);
          cur = g;
          return { g, rec: new Recorder(g.page, root), L };
        },
      };
      const t = Date.now();
      try {
        await fn(ctx);
        log(`kivilcim ${lang}: clip ${id} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
      } catch (e) {
        problems.push(`${id}: ${e.message}`);
        log(`kivilcim ${lang}: clip ${id} FAILED ${e.message}`);
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
  if (e.type === 'gem') return 3;
  if (e.type === 'gate') return 2;
  if (e.type === 'hold') return 0.3;
  return 0;
}
export function shakeOn(e) {
  if (e.type === 'death') return 0.6;
  if (e.type === 'finish') return 0.4;
  if (e.type === 'gate') return 0.15;
  return 0;
}

const TXT = {
  tr: {
    hold: '*Bas*: sağa uç', let: '*Bırak*: sola dön', flow: 'Elmasları topla, *akışı* yakala',
    mech: 'Lazer, portal, piston *ve dahası*', k: ['Lazerler', 'Ayrık yollar', 'Pistonlar', 'Portallar', 'Karanlık'],
    boss: 'Her dünyanın sonunda *patron*', death: 'Çarptın mı? *Anında* tekrar', finish: '*%100*! Yıldızları topla',
    shop: '*22 iz* topla, mitiklere kadar', levels: '*40 bölüm*, her biri 3 yıldız', ranks: '*Rütbeler* ve başarımlar',
    soon: 'Yakında: *sıralama sistemi!*', sub: 'Dünya sıralaması yakında', stamp: 'YAKINDA',
  },
  en: {
    hold: '*Hold* to veer right', let: '*Let go* to veer left', flow: 'Grab gems, build your *flow*',
    mech: 'Lasers, portals, pistons *and more*', k: ['Lasers', 'Split paths', 'Pistons', 'Portals', 'Darkness'],
    boss: 'A *boss* ends every world', death: 'Crashed? Retry *instantly*', finish: 'Hit *100%*, earn the stars',
    shop: 'Collect *22 trails*, up to mythic', levels: '*40 levels*, three stars each', ranks: '*Ranks* and feats',
    soon: 'Leaderboards *coming soon!*', sub: 'Global rankings on the way', stamp: 'SOON',
  },
};

export function edit(lang) {
  const T = TXT[lang];
  const auto = (min = 0.3) => ({ auto: true, min });
  return {
    beats: [
      { clip: 'mirror', from: 0.2, dur: 2.5, caption: T.hold, pos: 'top', zoom: [1.12, 1.0] },
      { clip: 'wind', from: auto(), dur: 2.5, caption: T.let, pos: 'top', trans: 'punch' },
      { clip: 'spin', from: auto(), dur: 2.5, caption: T.flow, pos: 'bottom', trans: 'whip' },
      ...['lasers', 'split', 'pistons', 'portals', 'dark'].map((c, i) => ({ clip: c, from: auto(), dur: 1.0, caption: T.mech, kicker: T.k[i], pos: 'bottom', trans: i ? 'flash' : 'whip', dir: -1, zoom: [1.0, 1.08] })),
      { clip: 'boss', from: auto(), dur: 3.0, caption: T.boss, pos: 'bottom', trans: 'punch' },
      { clip: 'death', from: ['let', -0.4], dur: 3.0, speed: [[0, 1], [0.5, 1], [0.7, 0.4], [1.4, 0.4], [1.6, 1.3], [3, 1.3]], caption: T.death, pos: 'bottom', trans: 'whip' },
      { clip: 'finish', from: 1.6, dur: 3.0, speed: [[0, 1], [1.2, 1], [1.4, 0.6], [3, 0.8]], caption: T.finish, pos: 'bottom', trans: 'flash' },
      { clip: 'shop', from: 0.4, dur: 2.5, speed: 1.4, caption: T.shop, pos: 'bottom', trans: 'zoom', capY: 1500 },
      { clip: 'levels', from: 0.5, dur: 2.0, speed: 1.3, caption: T.levels, pos: 'bottom', trans: 'whip', capY: 1500 },
      { clip: 'ranks', from: 0.3, dur: 2.0, caption: T.ranks, pos: 'bottom', trans: 'whip', dir: -1, capY: 1500 },
    ],
    end: { dur: 5.0, stampAt: 2.1 },
    endCard: { soon: T.soon, sub: T.sub, stamp: T.stamp },
  };
}
