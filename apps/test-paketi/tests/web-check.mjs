#!/usr/bin/env node
/* global window, document, localStorage, location */
// Repeatable browser check of the test APK's web folder (no device or emulator needed).
//   node apps/test-paketi/tests/web-check.mjs [webDir]
// webDir default: the assets/public folder unpacked from the bundle APK listed in
// build/test-apk/versions.json (exactly what is inside the APK); falls back to the Capacitor
// project copy build/test-apk/work/paket/android/app/src/main/assets/public.
// Serves it with a small static server, then drives Chromium at 390×844 with touch:
//   - launcher (tr + en) shows three cards;
//   - each card opens its game from its sub-folder (no ?test): screenshots, one real input;
//   - the same sub-folder with the test hook proves the real input works (state read only):
//     kivilcim: one real press starts a run and the spark moves; okcu: one real drag fires an
//     arrow; fosil: one real tap on Play reaches the dig site and a real tap on the block counts;
//   - history back returns to the launcher from every game;
//   - leftover keys of the removed games (as a phone with the previous APK has them) break
//     nothing and stay untouched; a fosil save survives visiting the other games; every key is
//     namespaced oyun:<game>:;
//   - no console or page errors, no failed requests, no request leaving the origin.
// Real touch goes through the Chrome DevTools protocol (Input.dispatchTouchEvent), like the
// games' own e2e tests. No touchCancel is ever sent (Chrome logs it as a console error).
// A fake `window.Capacitor` (isNativePlatform → true) is injected like the APK's native bridge.
// Screenshots: apps/test-paketi/tests/artifacts/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..', '..');
const OUT = join(ROOT, 'build', 'test-apk');
/** The bundle APK of the last `npm run apk` (file names carry the versionCode). */
function bundleApk() {
  try {
    const m = JSON.parse(readFileSync(join(OUT, 'versions.json'), 'utf8'));
    const e = m.apps.find((a) => a.applicationId === 'com.playoyunlar.testpaketi');
    return e ? join(OUT, e.file) : null;
  } catch {
    return null;
  }
}
const APK = bundleApk();
const SHOTS = join(APP, 'tests', 'artifacts');
const VIEW = { width: 390, height: 844 };
const SLUGS = ['kivilcim', 'okcu', 'fosil'];

/**
 * What the previous test APK (fener, murekkep, fosil) left in localStorage on a phone. Same
 * application id → same WebView origin → these survive an update. Shapes as core writes them.
 */
const LEFTOVER = {
  'oyun:fener:save': JSON.stringify({ v: 1, data: { unlocked: 2, nightBest: [120], log: ['clock'], briefed: true } }),
  'oyun:fener:save.bak': JSON.stringify({ v: 1, data: { unlocked: 1, nightBest: [], log: [], briefed: true } }),
  'oyun:fener:audio': JSON.stringify({ muted: true, volumes: { master: 1, music: 1, sfx: 1 } }),
  'oyun:murekkep:save': JSON.stringify({ v: 1, data: { stars: { 1: 2 }, daily: {} } }),
  'oyun:murekkep:audio': JSON.stringify({ muted: false, volumes: { master: 1, music: 1, sfx: 1 } }),
};

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

// ------------------------------------------------------------------ web folder
let tmp = null;
function webDir() {
  if (process.argv[2]) return resolve(process.argv[2]);
  if (APK && existsSync(APK)) {
    try {
      tmp = mkdtempSync(join(tmpdir(), 'oyun-apk-'));
      execFileSync('unzip', ['-q', APK, 'assets/public/*', '-d', tmp]);
      console.log(`web folder: assets/public unpacked from ${APK}`);
      return join(tmp, 'assets', 'public');
    } catch (e) {
      console.warn(`could not unpack the APK (${String(e)}); using the android project copy`);
    }
  }
  return join(OUT, 'work', 'paket', 'android', 'app', 'src', 'main', 'assets', 'public');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };

function serve(dir) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    let file = normalize(join(dir, path));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// ------------------------------------------------------------------ browser
async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

/** Errors, failed requests and off-origin requests of a page. */
function watch(page, origin) {
  const log = { errors: [], failed: [], foreign: [] };
  page.on('console', (m) => m.type() === 'error' && log.errors.push(`console: ${m.text()}`));
  page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.foreign.push(u);
  });
  return log;
}

async function newContext(browser, locale, origin) {
  const context = await browser.newContext({ viewport: VIEW, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale });
  await context.addInitScript(() => {
    // Like the APK: Capacitor's native bridge is present on every page.
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    // Record AudioContexts so the check can see audio unlock after a real input.
    const Orig = window.AudioContext;
    if (Orig) {
      window.__audioContexts = [];
      window.AudioContext = class extends Orig {
        constructor(...args) {
          super(...args);
          window.__audioContexts.push(this);
        }
      };
    }
  });
  const page = await context.newPage();
  const log = watch(page, origin);
  const cdp = await context.newCDPSession(page);
  return { context, page, log, cdp };
}

const state = (page) => page.evaluate(() => window.__OYUN__?.state() ?? null);
const act = (page, name, payload) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [name, payload]);

async function until(page, pred, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let s = null;
  while (Date.now() < end) {
    s = await state(page).catch(() => null);
    if (s?.ready && pred(s)) return s;
    await page.waitForTimeout(100);
  }
  throw new Error(`timeout waiting for ${label}; last scene ${s?.scene} phase ${s?.data?.phase}`);
}

/** Logical game point (720×1280) → CSS point via the canvas rectangle. */
async function toCss(page, x, y) {
  const r = await page.locator('canvas').boundingBox();
  return { x: r.x + (x * r.width) / 720, y: r.y + (y * r.height) / 1280 };
}

/** Real touch through Chrome's input pipeline (trusted touch → pointer events). Never touchCancel. */
function finger(cdp) {
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 1, radiusX: 8, radiusY: 8, force: 1 })) });
  return {
    down: (p) => send('touchStart', [p]),
    move: (p) => send('touchMove', [p]),
    up: () => send('touchEnd', []),
    async tap(p) {
      await send('touchStart', [p]);
      await send('touchEnd', []);
    },
    /** Drag from `a` by (dx, dy) CSS px in steps, then lift. */
    async drag(a, dx, dy, steps = 6) {
      await send('touchStart', [a]);
      for (let i = 1; i <= steps; i++) await send('touchMove', [{ x: a.x + (dx * i) / steps, y: a.y + (dy * i) / steps }]);
      await send('touchEnd', []);
    },
  };
}

async function cards(page) {
  await page.waitForSelector('a.card');
  return page.$$eval('a.card', (as) => as.map((a) => ({ slug: a.dataset.slug, href: a.getAttribute('href'), text: a.textContent })));
}

async function backToLauncher(page, base) {
  await page.goBack();
  await page.waitForURL((u) => u.href === `${base}/` || u.href === `${base}/index.html`);
  return (await cards(page)).length;
}

const audioStates = (page) => page.evaluate(() => (window.__audioContexts ?? []).map((c) => c.state));

// ------------------------------------------------------------------ per-game real input
/** Without the test hook: the input a player would give first, for the screenshots. */
const REAL_FIRST_INPUT = {
  // Any press starts the run (a point in open shaft, away from the title's buttons).
  async kivilcim(page, f) {
    await f.down(await toCss(page, 360, 700));
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(SHOTS, 'kivilcim-after-first-input.png') });
    await f.up();
  },
  // A drag anywhere in open sky fires the first arrow.
  async okcu(page, f) {
    const a = await toCss(page, 380, 560);
    const k = (await page.locator('canvas').boundingBox()).width / 720;
    await f.drag(a, -160 * k, 120 * k);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(SHOTS, 'okcu-after-first-input.png') });
  },
  // A real tap on the menu's Play button.
  async fosil(page, f) {
    await f.tap(await toCss(page, 360, 1280 * 0.62));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, 'fosil-after-first-input.png') });
  },
};

/** With the test hook: prove the real input does what it should (state is only read). */
const HOOKED = {
  async kivilcim(page, f) {
    const t = await until(page, (s) => s.scene === 'game' && s.data.phase === 'title', 'kivilcim title');
    check(t.data.phase === 'title', `kivilcim opens on its title over the shaft (level ${t.data.level})`);
    await page.waitForTimeout(500);
    await f.down(await toCss(page, 360, 700));
    const s1 = await until(page, (s) => s.data.phase !== 'title', 'run start', 10_000);
    check(s1.data.attempts >= 1 && s1.data.tick >= 0, `one real press starts the run (phase ${s1.data.phase}, held ${s1.data.held}, dir ${s1.data.dir})`);
    await page.waitForTimeout(250);
    const s2 = await state(page);
    check(s2.data.tick > 0 && (s2.data.y !== t.data.y || s2.data.x !== t.data.x), `the spark moves (tick ${s2.data.tick}, x ${t.data.x}→${s2.data.x}, y ${t.data.y}→${s2.data.y})`);
    await page.screenshot({ path: join(SHOTS, 'kivilcim-playing.png') });
    await f.up();
    await page.waitForTimeout(300);
    check((await state(page)).data.held === false, 'lifting the finger releases the hold');
  },
  async okcu(page, f) {
    await until(page, (s) => s.scene === 'game' && s.data.phase === 'title' && s.data.reload === 0, 'okcu title, arrow nocked');
    await page.waitForTimeout(500);
    const d = (await state(page)).data;
    check(d.shots === 0, 'okcu opens on its title-as-first-shot (no shots yet)');
    const k = (await page.locator('canvas').boundingBox()).width / 720;
    const sol = d.solution ?? { angle: Math.PI * 1.75, power: 0.6 };
    const len = d.drag.dead + sol.power * (d.drag.full - d.drag.dead);
    // A tap does nothing on the title.
    await f.tap(await toCss(page, 380, 560));
    await page.waitForTimeout(400);
    check((await state(page)).data.shots === 0, 'a tap does not fire');
    await f.drag(await toCss(page, 380, 560), -Math.cos(sol.angle) * len * k, -Math.sin(sol.angle) * len * k);
    const s = await until(page, (x) => x.data.shots > 0, 'first arrow', 10_000);
    check(s.data.shots === 1 && s.data.phase !== 'title', `one real drag fires an arrow and starts wave ${s.data.wave} (phase ${s.data.phase})`);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(SHOTS, 'okcu-playing.png') });
  },
  async fosil(page, f) {
    const menu = await until(page, (s) => s.scene === 'menu', 'fosil menu');
    check(menu.scene === 'menu', 'fosil reaches its menu');
    await page.waitForTimeout(700); // menu pop-in
    await f.tap(await toCss(page, 360, 1280 * 0.62));
    const dig = await until(page, (s) => s.scene === 'dig', 'dig');
    check(dig.scene === 'dig', 'one real tap on Play: menu → dig');
    const before = dig.data.taps;
    await f.tap(await toCss(page, dig.data.ui.block.x, dig.data.ui.block.y));
    await page.waitForTimeout(400);
    const after = (await state(page)).data.taps;
    check(after === before + 1, `real tap on the dig block counts (taps ${before} → ${after})`);
    await act(page, 'tap', 60);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SHOTS, 'fosil-playing.png') });
    return (await state(page)).data.museum.found;
  },
};

// ------------------------------------------------------------------ run
const dir = webDir();
const server = await serve(dir);
const base = `http://127.0.0.1:${server.address().port}`;
rmSync(SHOTS, { recursive: true, force: true }); // no stale screenshots of an older line-up
mkdirSync(SHOTS, { recursive: true });
const browser = await launch();
try {
  // --- launcher in English
  {
    const { context, page, log } = await newContext(browser, 'en-US', base);
    await page.goto(`${base}/`);
    const list = await cards(page);
    check(list.map((c) => c.slug).join() === SLUGS.join(), `en launcher shows 3 cards in order (${list.map((c) => c.slug).join(', ')})`);
    check((await page.textContent('h1')) === 'Play Oyunlar — Test', 'en title "Play Oyunlar — Test"');
    check(list[0].text.startsWith('Sparkrise') && list[1].text.startsWith('Noodle Archers'), `en card names are English (${list.map((c) => c.text.slice(0, 16)).join(' | ')})`);
    check(/Test build · ads are simulated.* · \d{4}-\d{2}-\d{2} · [0-9a-f]{7}/.test(await page.textContent('.build')), `en footer: ${await page.textContent('.build')}`);
    await page.screenshot({ path: join(SHOTS, 'launcher-en.png') });
    check(!log.errors.length && !log.failed.length && !log.foreign.length, `en launcher: no errors/failed/foreign requests ${JSON.stringify(log)}`);
    await context.close();
  }

  // --- Turkish device: every game from its card
  const { context, page, log, cdp } = await newContext(browser, 'tr-TR', base);
  const f = finger(cdp);
  await page.goto(`${base}/`);
  // A phone that had the previous APK: the removed games' keys are still in this origin.
  await page.evaluate((kv) => Object.entries(kv).forEach(([k, v]) => localStorage.setItem(k, v)), LEFTOVER);
  await page.reload();
  const list = await cards(page);
  check(list.length === 3 && list.every((c) => c.href === `./${c.slug}/index.html`), `tr launcher: 3 cards with relative links ${list.map((c) => c.href).join(' ')}`);
  check(list[0].text.startsWith('Kıvılcım') && list[0].text.includes('Sparkrise') && list[1].text.startsWith('Sallanan Okçular'), 'tr cards show both names');
  await page.screenshot({ path: join(SHOTS, 'launcher-tr.png') });
  check((await page.$$eval('.card', (els) => els.map((e) => e.getBoundingClientRect().height))).every((h) => h >= 88), 'cards are at least 88 CSS px tall');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'launcher has no horizontal scroll');

  let fosilFound = null;
  for (const slug of ['fosil', 'kivilcim', 'okcu']) {
    console.log(`\n${slug}`);
    // 1. Real path: tap the card, the game loads from its sub-folder without ?test.
    await page.tap(`a.card[data-slug="${slug}"]`);
    await page.waitForURL(`${base}/${slug}/index.html`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(SHOTS, `${slug}-from-launcher.png`) });
    check(page.url() === `${base}/${slug}/index.html`, `card opens ${page.url()}`);
    const fonts = await page.evaluate(() => [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family));
    check(fonts.some((x) => /Nunito/i.test(x)), `bundled font loaded from the sub-folder (${[...new Set(fonts)].join(', ')})`);
    await REAL_FIRST_INPUT[slug](page, f);
    check((await backToLauncher(page, base)) === 3, 'history back returns to the launcher (3 cards)');

    // 2. Same sub-folder with the test hook, to prove the real input works.
    await page.evaluate((s) => (location.href = `./${s}/index.html?test=1&seed=1`), slug);
    await page.waitForURL(`${base}/${slug}/index.html?test=1&seed=1`);
    const found = await HOOKED[slug](page, f);
    if (slug === 'fosil') fosilFound = found;
    const audio = await audioStates(page);
    check(audio.includes('running'), `audio unlocked by the real input (AudioContext states: ${audio.join(', ') || 'none'})`);
    check((await backToLauncher(page, base)) === 3, 'history back from play returns to the launcher');
  }

  console.log('\nfosil (second visit)');
  await page.evaluate(() => (location.href = './fosil/index.html?test=1&seed=1'));
  const again = await until(page, (s) => s.scene === 'menu', 'fosil menu');
  check(fosilFound > 0 && again.data.found >= fosilFound, `fosil save kept after visiting kivilcim and okcu (museum ${again.data.found} ≥ ${fosilFound})`);
  const store = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  const keys = Object.keys(store).sort();
  console.log(`  localStorage keys: ${keys.join(', ')}`);
  check(keys.every((k) => /^oyun:(kivilcim|okcu|fosil|fener|murekkep):/.test(k)), 'every storage key is namespaced oyun:<game>:');
  check(['oyun:fosil:save', 'oyun:kivilcim:save', 'oyun:okcu:save'].every((k) => keys.includes(k)), 'each game wrote its own save');
  check(Object.entries(LEFTOVER).every(([k, v]) => store[k] === v), 'the removed games\' leftover keys are untouched (nothing reads, rewrites or clears them)');

  console.log('\nwhole run');
  check(!log.errors.length, `no console/page errors ${JSON.stringify(log.errors)}`);
  check(!log.failed.length, `no failed requests ${JSON.stringify(log.failed)}`);
  check(!log.foreign.length, `no request left ${base} ${JSON.stringify(log.foreign)}`);
  await context.close();
} catch (e) {
  failures.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  await browser.close();
  server.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nscreenshots: ${SHOTS}`);
console.log(failures.length ? `WEB CHECK FAILED (${failures.length})` : 'WEB CHECK PASSED');
process.exit(failures.length ? 1 : 0);
