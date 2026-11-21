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
// Shots: home (progressed), home-fresh, events, the Weapons tab (weapons: the selected bow;
// weapons-fresh; weapons-detail: the crossbow; weapons-up: the boomerang, ready to level up;
// weapons-locked: the sling's shards; weapons-archer: the archer's upgrades) and the screens the
// Shop / Ranks tabs open.
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
async function open(size, lang, save) {
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
}

const plan = [
  { tab: 'home-fresh', save: fresh },
  // the chapter card's ‹ wraps round to the last chapter reached (chapter 4)
  { tab: 'home', save: progressed, go: ['title-chapter-prev'] },
  { tab: 'events', save: progressed, go: ['tab-events'] },
  { tab: 'shop', save: progressed, go: ['tab-shop'] },
  { tab: 'weapons', save: progressed, go: ['tab-weapons'] },
  { tab: 'weapons-fresh', save: fresh, go: ['tab-weapons'] },
  { tab: 'weapons-detail', save: progressed, go: ['tab-weapons', 'weapon-card-crossbow'] },
  { tab: 'weapons-up', save: progressed, go: ['tab-weapons', 'weapon-card-boomerang'] },
  { tab: 'weapons-locked', save: progressed, go: ['tab-weapons', 'weapon-card-sling'] },
  { tab: 'weapons-archer', save: progressed, go: ['tab-weapons', 'archer-card'] },
  { tab: 'ranks', save: progressed, go: ['tab-ranks'] },
].filter((p) => !ONLY || ONLY.includes(p.tab));

for (const size of SIZES) {
  for (const lang of LANGS) {
    for (const p of plan) {
      const { page, context } = await open(size, lang, p.save);
      for (const id of p.go ?? []) {
        await tap(page, id);
        await page.waitForTimeout(900);
      }
      await shot(page, p.tab, size, lang);
      await context.close();
    }
  }
}
await browser.close();
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 20).join('\n')}`);
