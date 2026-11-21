/* global window, document, sessionStorage, localStorage, URLSearchParams, structuredClone */
// Screenshots of the tabbed main menu on phone sizes, for checking the layout by eye.
//
//   npm run dev -w apps/okcu-3d          (one dev server; note its port)
//   node apps/okcu-3d/tools/menu-shots.mjs --url http://localhost:5180/ [--only home,events] [--sizes 360x640]
//
// Every size (360×640, 390×844, 412×915; the tall two with faked safe areas, ?safe=top,bottom)
// in both languages (?lang=tr|en), with two saves written to localStorage before the app boots:
// - fresh:      a brand-new player (chapter 1, nothing owned)
// - progressed: chapter 4 reached, coins, a levelled bow, the three weapons of the bosses beaten
//               (the boomerang ready to level up), sling shards, chests waiting, the free chest
//               counting down, upgrades bought
// - done:       the progressed save with today's daily already done (a streak of 3)
// Shots: home (progressed), home-fresh, the Shop tab (shop: today's offers, chests, ad coins;
// shop-fresh; shop-odds: the odds sheet; shop-looks: the looks; shop-buy: the first offer bought),
// the Events tab (events; events-fresh; events-done), the free chest's choice (free-chest), the
// Weapons tab (weapons: the selected bow; weapons-fresh; weapons-detail: the crossbow; weapons-up:
// the boomerang, ready to level up; weapons-locked: the sling's shards; weapons-archer: the
// archer's upgrades), the screen the Ranks tab opens, and the chest opening (chest-*: frames of the
// pile's gold chest frozen mid-way: chest-shake, chest-lid, chest-coins, chest-shards, chest-summary;
// chest-reveal: the welcome gift unlocking the sling; chest-calm*: ?fx=0, the instant summary), the
// reveals a boss leaves owed (reveal-weapon: the firework; reveal-celestial: the look; weapons-new:
// the Weapons tab after them, the firework marked new) and a boss chest with every weapon maxed
// (chest-maxed: its shards come as coins).
// PNGs go to <repo>/build/menu-shots/okcu3d-<tab>-<size>-<lang>.png. One browser, one page at a time.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const url = (args.url ?? 'http://localhost:5180/').replace(/\/?$/, '/');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = resolve(repo, 'build/menu-shots');
mkdirSync(outDir, { recursive: true });
const SAVE_KEY = 'oyun:okcu-3d:save';
const SIZES = (args.sizes ?? '360x640,390x844,412x915').split(',');
/** faked safe areas (CSS px) per size: the tall phones have a notch and a home bar */
const SAFE = { '360x640': null, '390x844': '47,34', '412x915': '32,24' };
const LANGS = (args.langs ?? 'tr,en').split(',');
const ONLY = args.only ? args.only.split(',') : null;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

/** Open the app with `save` (a SaveData, or null for none) in localStorage; resolves once the title is up. */
async function open(size, lang, save, extra = {}) {
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: false, locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${size} ${lang}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${size} ${lang}: ${e}`));
  await page.addInitScript(
    ({ key, env }) => {
      if (sessionStorage.getItem('__menu_seeded')) return;
      sessionStorage.setItem('__menu_seeded', '1');
      localStorage.clear();
      if (env) localStorage.setItem(key, JSON.stringify(env));
    },
    { key: SAVE_KEY, env: save },
  );
  const q = new URLSearchParams({ lang, seed: '3' });
  if (SAFE[size]) q.set('safe', SAFE[size]);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  await page.goto(`${url}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true && window.__okcu3d.frames > 4, null, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForSelector('[data-testid="tab-home"]', { timeout: 30_000 });
  // the entrance settles
  await page.waitForTimeout(1600);
  return { page, context };
}

async function tap(page, testid) {
  await page.locator(`[data-testid="${testid}"]`).first().click();
}

async function shot(page, tab, size, lang) {
  const file = resolve(outDir, `okcu3d-${tab}-${size}-${lang}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}

/** A brand-new save written by the app itself (its schema and version), read back as the envelope. */
async function freshEnvelope() {
  const { page, context } = await open('360x640', 'tr', null);
  const env = await page.evaluate((key) => {
    window.__okcu3d.game.save.update(() => {});
    return JSON.parse(localStorage.getItem(key));
  }, SAVE_KEY);
  await context.close();
  return env;
}

const fresh = await freshEnvelope();

/**
 * The welcome gift that unlocks the sling: a migrated player in chapter 4 with 9 sling shards and the
 * welcome gold chest; `runs` is searched (with the game's own chest roll, served by the dev server)
 * until that chest's shards go to the sling.
 */
async function revealEnvelope() {
  const env = structuredClone(fresh);
  const d = env.data;
  d.chapter = 3;
  d.coins = 2400;
  d.bosses = d.bosses.map((_, i) => (i < 3 ? 1 : 0));
  for (const id of ['crossbow', 'spear', 'boomerang']) d.arsenal.weapons[id].owned = true;
  d.arsenal.weapons.sling = { owned: false, level: 1, shards: 9 };
  d.arsenal.chests = ['gold'];
  d.arsenal.welcome = true;
  const { page, context } = await open('360x640', 'en', null);
  const sim = encodeURI(`/@fs/${resolve(repo, 'games/okcu/src/sim/chests.ts').replace(/\\/g, '/')}`);
  d.runs = await page.evaluate(
    async ({ save, path }) => {
      const m = await import(/* @vite-ignore */ path);
      for (let runs = 0; runs < 500; runs++) {
        const s = structuredClone(save);
        s.runs = runs;
        if (m.openQueuedChest(s, 0)?.loot.unlocked === 'sling') return runs;
      }
      return 0;
    },
    { save: d, path: sim },
  );
  await context.close();
  return env;
}

const progressed = structuredClone(fresh);
{
  const d = progressed.data;
  d.coins = 16480;
  d.runs = 46;
  d.best = 34;
  d.chapter = 3;
  d.bosses = d.bosses.map((_, i) => (i < 3 ? 1 : 0));
  // power 235 against chapter 4's recommended 252: the card shows "tough" (orange)
  d.upgrades = { ...d.upgrades, hp: 2 };
  d.rank = 1;
  d.arsenal.weapons.bow.level = 12;
  d.arsenal.weapons.crossbow = { owned: true, level: 4, shards: 3 };
  d.arsenal.weapons.spear = { owned: true, level: 2, shards: 1 };
  d.arsenal.weapons.boomerang = { owned: true, level: 1, shards: 3 };
  d.arsenal.weapons.sling = { owned: false, level: 1, shards: 4 };
  d.arsenal.chests = ['gold', 'wood'];
  d.arsenal.freeChestAt = Date.now() + 2 * 3600_000 + 17 * 60_000;
  // one of today's three ad top-ups used
  d.arsenal.adCoinsDay = today();
  d.arsenal.adCoinsUsed = 1;
  d.dailyDate = today();
  d.dailyBest = 4;
  // a streak of 2 that today can extend
  d.dailyDone = today(-1);
  d.dailyStreak = 2;
}
const reveal = ONLY && !ONLY.some((x) => x.startsWith('chest-reveal') || x.startsWith('chest-calm-')) ? null : await revealEnvelope();
const done = structuredClone(progressed);
{
  const d = done.data;
  d.dailyDone = today();
  d.dailyBest = 9;
  d.dailyStreak = 3;
}
/** the chapter 4 boss beaten last run: the firework and the celestial look still owed their reveals */
const owed = structuredClone(progressed);
{
  const d = owed.data;
  d.bosses[3] = 1;
  d.arsenal.weapons.firework = { owned: true, level: 1, shards: 0 };
  d.arsenal.celestial = true;
  d.arsenal.reveals = ['firework', 'celestial'];
  d.arsenal.unseen = ['firework'];
}
/** every owned weapon at the top level, a boss chest in the line: its shards turn into coins */
const maxed = structuredClone(progressed);
{
  const d = maxed.data;
  for (const id of ['bow', 'crossbow', 'spear', 'boomerang', 'sling']) d.arsenal.weapons[id] = { owned: true, level: 20, shards: 0 };
  d.arsenal.chests = ['boss'];
}
/** today's key in local time (the app's todayKey), or `dd` days away */
function today(dd = 0) {
  const n = new Date();
  n.setDate(n.getDate() + dd);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const plan = [
  { tab: 'home-fresh', save: fresh },
  // the chapter card's ‹ wraps round to the last chapter reached (chapter 4)
  { tab: 'home', save: progressed, go: ['title-chapter-prev'] },
  { tab: 'events', save: progressed, go: ['tab-events'] },
  { tab: 'events-fresh', save: fresh, go: ['tab-events'] },
  { tab: 'events-done', save: done, go: ['tab-events'] },
  { tab: 'shop', save: progressed, go: ['tab-shop'] },
  { tab: 'shop-fresh', save: fresh, go: ['tab-shop'] },
  { tab: 'shop-odds', save: progressed, go: ['tab-shop', 'shop-odds'] },
  { tab: 'shop-looks', save: progressed, go: ['tab-shop', 'shop-seg-looks'] },
  { tab: 'shop-buy', save: progressed, go: ['tab-shop', 'shop-offer-0'] },
  { tab: 'free-chest', save: fresh, go: ['shell-chest'] },
  { tab: 'weapons', save: progressed, go: ['tab-weapons'] },
  { tab: 'weapons-fresh', save: fresh, go: ['tab-weapons'] },
  { tab: 'weapons-detail', save: progressed, go: ['tab-weapons', 'weapon-card-crossbow'] },
  { tab: 'weapons-up', save: progressed, go: ['tab-weapons', 'weapon-card-boomerang'] },
  { tab: 'weapons-locked', save: progressed, go: ['tab-weapons', 'weapon-card-sling'] },
  { tab: 'weapons-archer', save: progressed, go: ['tab-weapons', 'archer-card'] },
  { tab: 'ranks', save: progressed, go: ['tab-ranks'] },
  // the chest opening, frozen mid-way (ms after the tap on the chest pile)
  { tab: 'chest-shake', save: progressed, go: ['shell-pile'], wait: 1250 },
  { tab: 'chest-lid', save: progressed, go: ['shell-pile'], wait: 2080 },
  { tab: 'chest-coins', save: progressed, go: ['shell-pile'], wait: 2550 },
  { tab: 'chest-shards', save: progressed, go: ['shell-pile'], wait: 3500 },
  { tab: 'chest-summary', save: progressed, go: ['shell-pile'], wait: 7000 },
  { tab: 'chest-reveal', save: reveal, wait: 7600 },
  // reduced motion (?fx=0): the summary at once; the welcome gift's reveal, still, then its summary
  { tab: 'chest-calm', save: progressed, query: { fx: '0' }, go: ['shell-pile'], wait: 300 },
  { tab: 'chest-calm-reveal', save: reveal, query: { fx: '0' }, wait: 1500 },
  { tab: 'chest-calm-summary', save: reveal, query: { fx: '0' }, wait: 1500, then: ['chest-reveal-ok'] },
  // reveals owed by a boss (arsenal.reveals): the menu shows them, one after the other; then the Weapons tab marks the new one
  { tab: 'reveal-weapon', save: owed, wait: 2600 },
  { tab: 'reveal-celestial', save: owed, wait: 2600, then: ['chest-reveal-ok'], thenWait: 2000 },
  { tab: 'weapons-new', save: owed, wait: 2600, then: ['chest-reveal-ok', 'chest-reveal-ok', 'tab-weapons'], thenWait: 1500 },
  // every weapon maxed: the boss chest's shards come as coins
  { tab: 'chest-maxed', save: maxed, go: ['shell-pile'], wait: 7000 },
].filter((p) => !ONLY || ONLY.includes(p.tab));

for (const size of SIZES) {
  for (const lang of LANGS) {
    for (const p of plan) {
      const { page, context } = await open(size, lang, p.save, p.query);
      for (const id of p.go ?? []) {
        await tap(page, id);
        await page.waitForTimeout(p.wait ?? 900);
      }
      // (a welcome gift opens by itself a beat after the menu)
      if (!p.go && p.wait) await page.waitForTimeout(p.wait);
      for (const id of p.then ?? []) {
        await tap(page, id);
        await page.waitForTimeout(p.thenWait ?? 400);
      }
      await shot(page, p.tab, size, lang);
      await context.close();
    }
  }
}
await browser.close();
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 20).join('\n')}`);
