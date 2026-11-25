/* global window, document, sessionStorage, localStorage, URLSearchParams, structuredClone */
// Screenshots of the modes (Blitz, Boss Rush) and their arena (Sunset Canyon), played from the
// Events tab on a real save, so the cards, the HUD clock, the result cards and the bests are the
// ones a player sees.
//
//   npx vite --port 5334 --strictPort            (in apps/okcu-3d; one dev server)
//   node apps/okcu-3d/tools/modlar-shots.mjs --url http://localhost:5334/ [--only events,blitz] [--lang tr] [--angle angled]
//
// Scenarios (--only, comma separated; all by default):
//   events       the Events tab: the daily card and the two mode cards (a save that has opened both)
//   events-new   the Events tab of a brand-new player: both modes locked
//   blitz        Blitz from the Events tab: the ready screen, the start banner, play with the clock,
//                the last ten seconds, "TIME'S UP!" and the result card (a new best)
//   rush         Boss Rush with a level-10 bow: the ready screen, a boss, the card pick, the result
//                (stopped by the fourth boss)
//   rush-clear   Boss Rush with a level-16 bow: the last boss and the result of a rush cleared
//   arena        the arena with nobody on it but the player (Blitz's mesas), and a rush boss stage
// The aim bot plays (window.__okcu3d.bot). Headless WebGL is software-rendered: frames are slow, so
// captures wait on the world's state, not on a clock. One browser, one page at a time.
// PNGs go to apps/okcu-3d/tools/out-modlar/<scenario>-<name>.png.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const url = (args.url ?? 'http://localhost:5334/').replace(/\/?$/, '/');
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'out-modlar');
mkdirSync(outDir, { recursive: true });
const SAVE_KEY = 'oyun:okcu-3d:save';
const LANG = args.lang ?? 'en';
const ONLY = args.only ? args.only.split(',') : null;
const [VW, VH] = (args.size ?? '390x844').split('x').map(Number);
const SUFFIX = `${args.angle ? `-${args.angle}` : ''}${LANG === 'en' ? '' : `-${LANG}`}`;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

async function open(save, extra = {}) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5, hasTouch: false, locale: LANG === 'tr' ? 'tr-TR' : 'en-US' });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ({ key, env }) => {
      if (sessionStorage.getItem('__modlar_seeded')) return;
      sessionStorage.setItem('__modlar_seeded', '1');
      localStorage.clear();
      if (env) localStorage.setItem(key, JSON.stringify(env));
    },
    { key: SAVE_KEY, env: save },
  );
  const q = new URLSearchParams({ lang: LANG, seed: '3', safe: '47,34' });
  if (args.angle) q.set('angle', args.angle);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  await page.goto(`${url}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true && window.__okcu3d.frames > 4, null, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

const shot = async (page, name) => {
  const file = resolve(outDir, `${name}${SUFFIX}.png`);
  await page.screenshot({ path: file });
  console.log(file);
};
const tap = (page, testid) => page.locator(`[data-testid="${testid}"]`).first().click({ force: true });
const when = (page, expr, timeout = 240_000) => page.waitForFunction(`(() => { const g = window.__okcu3d; return ${expr}; })()`, null, { timeout, polling: 50 });
const state = (page) => page.evaluate(() => {
  const g = window.__okcu3d;
  const w = g.w;
  return { phase: w.phase, mode: w.mode, theme: w.theme, blitz: w.blitz && { left: Math.round(w.blitz.left), score: w.blitz.score, hits: w.blitz.hits }, rush: w.rush && { boss: w.rush.boss, beaten: w.rush.beaten }, coins: w.run.coins, save: { coins: g.game.save.data.coins, modes: g.game.save.data.arsenal.modes, chests: g.game.save.data.arsenal.chests, runs: g.game.save.data.runs, best: g.game.save.data.best, bosses: g.game.save.data.bosses }, failures: Object.fromEntries(g.failures) };
});

/** A brand-new save written by the app itself (its schema and version), read back as the envelope. */
async function freshEnvelope() {
  const { page, context } = await open(null);
  const env = await page.evaluate((key) => {
    window.__okcu3d.game.save.update(() => {});
    return JSON.parse(localStorage.getItem(key));
  }, SAVE_KEY);
  await context.close();
  return env;
}

const fresh = await freshEnvelope();
/** a player a few hours in: both modes open, a level-10 bow, bests to beat */
const played = structuredClone(fresh);
{
  const d = played.data;
  d.coins = 5210;
  d.runs = 31;
  d.best = 16;
  d.chapter = 2;
  d.bosses = d.bosses.map((_, i) => (i < 2 ? 1 : 0));
  d.rank = 1;
  d.arsenal.weapons.bow.level = 10;
  d.arsenal.weapons.crossbow = { owned: true, level: 3, shards: 1 };
  d.arsenal.weapons.spear = { owned: true, level: 1, shards: 0 };
  d.arsenal.modes = { ...d.arsenal.modes, blitz: 14, rush: 2, rushTime: 9.4 };
}
/** the same player much later: a level-16 bow, which carries a rush to its end */
const strong = structuredClone(played);
strong.data.arsenal.weapons.bow.level = 16;
// (its rank already celebrated: no rank-up ceremony over the result card)
strong.data.rank = 13;
strong.data.arsenal.modes = { ...strong.data.arsenal.modes, rush: 4, rushTime: 21.5 };

async function eventsTab(page) {
  await page.waitForSelector('[data-testid="tab-home"]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await tap(page, 'tab-events');
  await page.waitForSelector('[data-testid="events-mode-blitz"]', { timeout: 20_000 });
  await page.waitForTimeout(1600);
}

const scenarios = {
  async events() {
    const { page, context } = await open(played);
    await eventsTab(page);
    await shot(page, 'events');
    await context.close();
  },
  async 'events-new'() {
    const { page, context } = await open(fresh);
    await eventsTab(page);
    await shot(page, 'events-new');
    await context.close();
  },
  async blitz() {
    const { page, context } = await open(played);
    await eventsTab(page);
    await tap(page, 'events-mode-blitz-play');
    await when(page, "g.w.mode === 'blitz' && g.w.phase === 'title'");
    await page.waitForTimeout(1500);
    await shot(page, 'blitz-ready');
    await page.evaluate(() => window.__okcu3d.bot(true));
    await when(page, "g.w.phase === 'play'");
    await page.waitForTimeout(350);
    await shot(page, 'blitz-start');
    await when(page, 'g.w.blitz.left < 44');
    await shot(page, 'blitz-play');
    await when(page, 'g.w.blitz.left < 26');
    await shot(page, 'blitz-play2');
    await when(page, 'g.w.blitz.left < 8.4');
    await shot(page, 'blitz-last10');
    await page.evaluate(() => window.__okcu3d.bot(false));
    await when(page, "g.w.phase === 'over'");
    await page.waitForTimeout(450);
    await shot(page, 'blitz-timeup');
    await page.waitForSelector('[data-testid="result-chest"], .ok-panel', { timeout: 30_000 });
    await page.waitForTimeout(2600);
    await shot(page, 'blitz-result');
    console.log(JSON.stringify(await state(page)));
    await context.close();
  },
  async rush() {
    const { page, context } = await open(played);
    await eventsTab(page);
    await tap(page, 'events-mode-bossrush-play');
    await when(page, "g.w.mode === 'bossrush' && g.w.phase === 'title'");
    await page.waitForTimeout(1500);
    await shot(page, 'rush-ready');
    await page.evaluate(() => window.__okcu3d.bot(true));
    await when(page, "g.w.phase === 'play'");
    await page.waitForTimeout(500);
    await shot(page, 'rush-start');
    // (the bot off for the card pick: it would have chosen before the capture)
    await when(page, 'g.w.rush.beaten >= 1');
    await page.evaluate(() => window.__okcu3d.bot(false));
    await when(page, "g.w.phase === 'cards'");
    await page.waitForTimeout(1400);
    await shot(page, 'rush-cards');
    await page.evaluate(() => window.__okcu3d.bot(true));
    await when(page, "g.w.rush.boss === 1 && g.w.phase === 'play' && g.w.enemies.some((e) => e.type === 'boss' && e.brain !== 'spawn')");
    await page.waitForTimeout(700);
    await shot(page, 'rush-boss2');
    await when(page, "g.w.rush.boss === 3 && g.w.phase === 'play' && g.w.enemies.some((e) => e.type === 'boss' && e.brain !== 'spawn')");
    await page.waitForTimeout(900);
    await shot(page, 'rush-boss4');
    // (the bot off before the run is over: left on, it starts the next run a moment after)
    await when(page, "g.w.phase === 'dying' || g.w.phase === 'over'");
    await page.evaluate(() => window.__okcu3d.bot(false));
    await when(page, "g.w.phase === 'over'");
    await page.waitForSelector('.ok-panel', { timeout: 30_000 });
    await page.waitForTimeout(2600);
    await shot(page, 'rush-result');
    console.log(JSON.stringify(await state(page)));
    await context.close();
  },
  async 'rush-clear'() {
    const { page, context } = await open(strong);
    await eventsTab(page);
    await tap(page, 'events-mode-bossrush-play');
    await when(page, "g.w.mode === 'bossrush' && g.w.phase === 'title'");
    await page.evaluate(() => window.__okcu3d.bot(true));
    await when(page, "g.w.rush.boss === 5 && g.w.phase === 'play' && g.w.enemies.some((e) => e.type === 'boss' && e.brain !== 'spawn')");
    await page.waitForTimeout(500);
    await shot(page, 'rush-boss6');
    await when(page, "g.w.rush.beaten === 6 || g.w.phase === 'dying' || g.w.phase === 'over'");
    await page.evaluate(() => window.__okcu3d.bot(false));
    await when(page, "g.w.phase === 'over'");
    await page.waitForTimeout(500);
    await shot(page, 'rush-alldown');
    await page.waitForSelector('.ok-panel', { timeout: 30_000 });
    await page.waitForTimeout(2600);
    await shot(page, 'rush-clear-result');
    console.log(JSON.stringify(await state(page)));
    await context.close();
  },
  async arena() {
    // Blitz's mesas with nobody but the player on them (a test run: ?mode opens it directly)
    const a = await open(null, { mode: 'blitz' });
    await when(a.page, "g.w.mode === 'blitz'");
    await a.page.evaluate(() => {
      const g = window.__okcu3d;
      for (const e of g.w.enemies) e.gone = true;
      g.w.enemies.length = 0;
    });
    await a.page.waitForTimeout(1800);
    await shot(a.page, 'arena-empty');
    await a.context.close();
    // the storm caller's stage: the widest field a rush uses
    const b = await open(null, { mode: 'bossrush', boss: '6', bow: '25' });
    await when(b.page, "g.w.mode === 'bossrush' && g.w.enemies.some((e) => e.type === 'boss')");
    await b.page.waitForTimeout(3600);
    await shot(b.page, 'arena-rush6');
    await b.context.close();
  },
};

for (const [name, run] of Object.entries(scenarios)) {
  if (ONLY && !ONLY.includes(name)) continue;
  try {
    await run();
  } catch (err) {
    console.log(`${name} failed: ${String(err).split('\n')[0]}`);
  }
}
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 12).join('\n')}`);
await browser.close();
