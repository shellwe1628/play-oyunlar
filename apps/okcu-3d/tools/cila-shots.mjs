/* global window, document, sessionStorage, localStorage, URLSearchParams, structuredClone */
// Screenshots of the menu's motion moments (the polish pass), frozen mid-animation, on one phone size.
//
//   npx vite --port 5323 --strictPort            (in apps/okcu-3d; one dev server)
//   node apps/okcu-3d/tools/cila-shots.mjs --url http://localhost:5323/ [--only levelup,coins] [--lang tr]
//
// Each scenario opens the app with a save written to localStorage (the "progressed" save of
// menu-shots.mjs), taps its way to a moment and captures frames `at` ms into it: the Web Animations
// the last tap started are held and moved to exactly that time, so a frame shows the moment it names
// however slow the software renderer is (numbers that count run on real time and may be further
// along; what an animation's end starts, like a landing coin's count, does not happen in a held frame).
// One browser, one page at a time. PNGs go to apps/okcu-3d/tools/out-cila/<scenario>-<ms>.png.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const url = (args.url ?? 'http://localhost:5323/').replace(/\/?$/, '/');
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, 'out-cila');
mkdirSync(outDir, { recursive: true });
const SAVE_KEY = 'oyun:okcu-3d:save';
const LANG = args.lang ?? 'en';
const ONLY = args.only ? args.only.split(',') : null;
const [VW, VH] = (args.size ?? '390x844').split('x').map(Number);

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];

async function open(save, extra = {}) {
  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1.5, hasTouch: false, locale: LANG === 'tr' ? 'tr-TR' : 'en-US' });
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(
    ({ key, env }) => {
      if (sessionStorage.getItem('__cila_seeded')) return;
      sessionStorage.setItem('__cila_seeded', '1');
      localStorage.clear();
      if (env) localStorage.setItem(key, JSON.stringify(env));
    },
    { key: SAVE_KEY, env: save },
  );
  const q = new URLSearchParams({ lang: LANG, seed: '3', safe: '47,34' });
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  await page.goto(`${url}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true && window.__okcu3d.frames > 4, null, { timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

async function menu(page) {
  await page.waitForSelector('[data-testid="tab-home"]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
}

/** remember the animations that exist now: `frames` then shows only what was started after this */
async function mark(page) {
  await page.evaluate(() => {
    window.__before = new Set(document.getAnimations());
  });
}

/** `force`: for a button that never holds still (PLAY breathes), which Playwright would wait on forever */
async function tap(page, testid, force = false) {
  await mark(page);
  await page.locator(`[data-testid="${testid}"]`).first().click({ force });
}

/**
 * capture `name-<ms>.png` for each of `at`: the Web Animations started since the last `mark` are held
 * and moved to exactly `ms` (their delays included), then released
 */
async function frames(page, name, at) {
  await page.evaluate(() => {
    window.__seek = document.getAnimations().filter((a) => !window.__before.has(a));
    for (const a of window.__seek) a.pause();
  });
  for (const ms of at) {
    await page.evaluate((t) => {
      for (const a of window.__seek) a.currentTime = t;
    }, ms);
    await page.waitForTimeout(260);
    const file = resolve(outDir, `${name}-${ms}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await page.evaluate(() => {
    for (const a of window.__seek) a.play();
  });
}

async function freshEnvelope() {
  const { page, context } = await open(null);
  await menu(page);
  const env = await page.evaluate((key) => {
    window.__okcu3d.game.save.update(() => {});
    return JSON.parse(localStorage.getItem(key));
  }, SAVE_KEY);
  await context.close();
  return env;
}

function today(dd = 0) {
  const n = new Date();
  n.setDate(n.getDate() + dd);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
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
  d.upgrades = { ...d.upgrades, hp: 2 };
  d.rank = 1;
  d.arsenal.weapons.bow.level = 12;
  d.arsenal.weapons.bow.shards = 14;
  d.arsenal.weapons.crossbow = { owned: true, level: 4, shards: 3 };
  d.arsenal.weapons.spear = { owned: true, level: 2, shards: 1 };
  d.arsenal.weapons.boomerang = { owned: true, level: 1, shards: 3 };
  d.arsenal.weapons.sling = { owned: false, level: 1, shards: 4 };
  d.arsenal.chests = ['gold', 'wood'];
  d.arsenal.freeChestAt = Date.now() + 2 * 3600_000;
  d.dailyDate = today();
  d.dailyBest = 4;
  d.dailyDone = today(-1);
  d.dailyStreak = 2;
}
/** enough coins for the bow's next level */
const rich = structuredClone(progressed);
rich.data.coins = 60480;
/** the free chest ready to open */
const ready = structuredClone(progressed);
ready.data.arsenal.freeChestAt = 0;

const scenarios = {
  // the selected bow goes up a level: the stamp, the sunburst, the bar, POWER counting up in the top bar
  levelup: async () => {
    const { page, context } = await open(rich);
    await menu(page);
    await tap(page, 'tab-weapons');
    await page.waitForTimeout(900);
    await tap(page, 'weapon-upgrade');
    await frames(page, 'levelup', [120, 320, 620, 1100, 1700]);
    await context.close();
  },
  // a weapon that is not the selected one levels up (no POWER change), then is selected (POWER drops)
  levelup2: async () => {
    const { page, context } = await open(progressed);
    await menu(page);
    await tap(page, 'tab-weapons');
    await page.waitForTimeout(700);
    await tap(page, 'weapon-card-boomerang');
    await page.waitForTimeout(500);
    await tap(page, 'weapon-upgrade');
    await frames(page, 'levelup2', [300, 900]);
    await page.waitForTimeout(1600);
    await tap(page, 'weapon-select');
    await frames(page, 'select-down', [350]);
    await context.close();
  },
  // a level that brings a perk (the crossbow's level 5): its chip turns gold and jumps
  perk: async () => {
    const save = structuredClone(rich);
    save.data.arsenal.weapons.crossbow = { owned: true, level: 4, shards: 9 };
    const { page, context } = await open(save);
    await menu(page);
    await tap(page, 'tab-weapons');
    await page.waitForTimeout(700);
    await tap(page, 'weapon-card-crossbow');
    await page.waitForTimeout(500);
    await tap(page, 'weapon-upgrade');
    await frames(page, 'perk', [400, 760, 1000]);
    await context.close();
  },
  // an archer upgrade bought: coins count down under "−n", POWER up
  archer: async () => {
    const { page, context } = await open(progressed);
    await menu(page);
    await tap(page, 'tab-weapons');
    await page.waitForTimeout(700);
    await tap(page, 'archer-card');
    await page.waitForTimeout(500);
    await mark(page);
    await page.locator('[data-testid="weapon-detail"] .ok-w-up .ok-w-btn:not(.off)').first().click();
    await frames(page, 'archer-buy', [280, 600]);
    await context.close();
  },
  // a chest from the pile, left to play to its summary and closed: the coins fly into the top bar
  coins: async () => {
    const { page, context } = await open(progressed);
    await menu(page);
    await tap(page, 'shell-pile');
    await page.waitForTimeout(7200);
    await mark(page);
    await page.getByText(LANG === 'tr' ? 'Sonra' : 'Later', { exact: true }).first().click();
    await frames(page, 'coins-fly', [200, 480, 760]);
    await context.close();
  },
  // a daily offer bought: the shards fly from its card to the Weapons tab, the coins count down
  shopbuy: async () => {
    const { page, context } = await open(progressed);
    await menu(page);
    await tap(page, 'tab-shop');
    await page.waitForTimeout(900);
    await tap(page, 'shop-offer-0');
    await frames(page, 'shop-buy', [200, 480]);
    await context.close();
  },
  // the tabs: the free chest knocking when ready, each pane as it arrives
  tabs: async () => {
    const { page, context } = await open(ready);
    await menu(page);
    await page.screenshot({ path: resolve(outDir, 'home-ready.png') });
    await tap(page, 'tab-events');
    await frames(page, 'events-in', [200, 600, 1300]);
    await tap(page, 'tab-shop');
    await frames(page, 'shop-in', [220, 900]);
    await tap(page, 'tab-ranks');
    await frames(page, 'ranks-in', [140, 420, 1400]);
    await context.close();
  },
  // reduced motion: the same level-up, still
  calm: async () => {
    const { page, context } = await open(rich, { calm: '1' });
    await menu(page);
    await tap(page, 'tab-weapons');
    await page.waitForTimeout(500);
    await tap(page, 'weapon-upgrade');
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(outDir, 'calm-levelup.png') });
    await context.close();
  },
  // a run that ends: the result card (a new best: the badge, the burst, the count)
  result: async () => {
    const { page, context } = await open(fresh);
    await menu(page);
    await tap(page, 'title-play', true);
    await page.waitForTimeout(700);
    await mark(page);
    await page.evaluate(() => {
      const g = window.__okcu3d;
      g.shoot(-0.5, 0.6);
      g.skip(0.5);
      g.w.wave = 4;
      g.w.run.coins = 137;
      g.w.run.kos = 9;
      for (let i = 0; i < 80 && g.w.phase !== 'over'; i++) {
        g.w.player.hp = Math.min(g.w.player.hp, 1);
        g.skip(4);
      }
    });
    await page.waitForSelector('.ok-panel', { timeout: 20_000 });
    await frames(page, 'result', [150, 500]);
    // the new-best cheer starts when the score has counted (real time): caught live, not held
    await page.waitForTimeout(350);
    await page.screenshot({ path: resolve(outDir, 'result-cheer.png') });
    await context.close();
  },
  // the chapter picker: the card's content slides in the way it was switched
  chapter: async () => {
    const { page, context } = await open(progressed);
    await menu(page);
    await tap(page, 'title-chapter-next');
    await frames(page, 'chapter-switch', [90, 500]);
    await context.close();
  },
};

try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.includes(name)) continue;
    await run();
  }
} finally {
  // never leave a browser behind, whatever a scenario did
  await browser.close();
}
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 20).join('\n')}`);
