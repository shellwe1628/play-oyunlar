#!/usr/bin/env node
/* global window, document, localStorage, location */
// Repeatable browser check of the test APK's web folder (no device or emulator needed).
//   node apps/test-paketi/tests/web-check.mjs [webDir]
// webDir default: the assets/public folder unpacked from build/play-oyunlar-test.apk (exactly
// what is inside the APK); falls back to android/app/src/main/assets/public.
// Serves it with a small static server, then drives Chromium at 390×844 with touch:
//   launcher (tr + en) shows three cards → each card opens its game from the sub-folder →
//   menu reached → one real tap on Play leaves the menu → gameplay reached → history back
//   returns to the launcher; a fosil save survives visiting the other games; no console or page
//   errors, no failed requests, no request leaving the origin. Screenshots: tests/artifacts/.
// A fake `window.Capacitor` (isNativePlatform → true) is injected like the APK's native bridge.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..', '..');
const APK = join(ROOT, 'build', 'play-oyunlar-test.apk');
const SHOTS = join(APP, 'tests', 'artifacts');
const VIEW = { width: 390, height: 844 };
/** Play button centre as a fraction of the 1280 logical height (core MenuScene; fener moves it). */
const PLAY_Y = { fener: 0.59, murekkep: 0.62, fosil: 0.62 };

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

// ------------------------------------------------------------------ web folder
let tmp = null;
function webDir() {
  if (process.argv[2]) return resolve(process.argv[2]);
  if (existsSync(APK)) {
    try {
      tmp = mkdtempSync(join(tmpdir(), 'oyun-apk-'));
      execFileSync('unzip', ['-q', APK, 'assets/public/*', '-d', tmp]);
      console.log(`web folder: assets/public unpacked from ${APK}`);
      return join(tmp, 'assets', 'public');
    } catch (e) {
      console.warn(`could not unpack the APK (${String(e)}); using the android project copy`);
    }
  }
  return join(APP, 'android', 'app', 'src', 'main', 'assets', 'public');
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

/** Errors, failed requests and off-origin requests of every page in the context. */
function watch(context, origin) {
  const log = { errors: [], failed: [], foreign: [] };
  context.on('page', (page) => attach(page));
  function attach(page) {
    page.on('console', (m) => m.type() === 'error' && log.errors.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => log.errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => log.failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('request', (r) => {
      const u = r.url();
      if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) log.foreign.push(u);
    });
  }
  return { log, attach };
}

async function newContext(browser, locale, origin) {
  const context = await browser.newContext({ viewport: VIEW, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale });
  await context.addInitScript(() => {
    // Like the APK: Capacitor's native bridge is present on every page.
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    // Record AudioContexts so the check can see audio unlock after a real tap.
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
  const w = watch(context, origin);
  const page = await context.newPage();
  w.attach(page);
  return { context, page, log: w.log };
}

const state = (page) => page.evaluate(() => window.__OYUN__?.state() ?? null);
const act = (page, name, payload) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [name, payload]);

async function waitScene(page, pred, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let s = null;
  while (Date.now() < end) {
    s = await state(page).catch(() => null);
    if (s?.ready && pred(s.scene)) return s;
    await page.waitForTimeout(200);
  }
  throw new Error(`timeout waiting for ${label}; last scene ${s?.scene}`);
}

/** Logical game point (720×1280) → screen point via the canvas rectangle. */
async function toScreen(page, x, y) {
  const r = await page.locator('canvas').boundingBox();
  return { x: r.x + (x * r.width) / 720, y: r.y + (y * r.height) / 1280 };
}

async function cards(page) {
  await page.waitForSelector('a.card');
  return page.$$eval('a.card', (as) => as.map((a) => ({ slug: a.dataset.slug, href: a.getAttribute('href'), text: a.textContent })));
}

async function backToLauncher(page, base) {
  await page.goBack();
  await page.waitForURL((u) => u.href === `${base}/` || u.href.startsWith(`${base}/?`) || u.href === `${base}/index.html`);
  return (await cards(page)).length;
}

// ------------------------------------------------------------------ run
const dir = webDir();
const server = await serve(dir);
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync(SHOTS, { recursive: true });
const browser = await launch();
try {
  // --- launcher in English
  {
    const { context, page, log } = await newContext(browser, 'en-US', base);
    await page.goto(`${base}/`);
    const list = await cards(page);
    check(list.length === 3, `en launcher shows 3 cards (${list.map((c) => c.slug).join(', ')})`);
    check((await page.textContent('h1')) === 'Play Oyunlar — Test', 'en title "Play Oyunlar — Test"');
    check(list[0].text.startsWith('Lantern Shift'), `en first card name is English (${list[0].text.slice(0, 30)}…)`);
    check(/Test build · ads are simulated.* · \d{4}-\d{2}-\d{2} · [0-9a-f]{7}/.test(await page.textContent('.build')), `en footer: ${await page.textContent('.build')}`);
    await page.screenshot({ path: join(SHOTS, 'launcher-en.png') });
    check(!log.errors.length && !log.failed.length && !log.foreign.length, `en launcher: no errors/failed/foreign requests ${JSON.stringify(log)}`);
    await context.close();
  }

  // --- Turkish device: every game from its card
  const { context, page, log } = await newContext(browser, 'tr-TR', base);
  await page.goto(`${base}/`);
  const list = await cards(page);
  check(list.length === 3 && list.every((c) => c.href === `./${c.slug}/index.html`), `tr launcher: 3 cards with relative links ${list.map((c) => c.href).join(' ')}`);
  check(list[0].text.startsWith('Fener Nöbeti') && list[0].text.includes('Lantern Shift'), 'tr card shows both names');
  await page.screenshot({ path: join(SHOTS, 'launcher-tr.png') });
  check((await page.$$eval('.card', (els) => els.map((e) => e.getBoundingClientRect().height))).every((h) => h >= 88), 'cards are at least 88 CSS px tall');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'launcher has no horizontal scroll');

  let fosilSaved = null;
  for (const slug of ['fosil', 'fener', 'murekkep']) {
    console.log(`\n${slug}`);
    // 1. Real path: tap the card (touch), the game loads from its sub-folder without ?test.
    await page.tap(`a.card[data-slug="${slug}"]`);
    await page.waitForURL(`${base}/${slug}/index.html`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: join(SHOTS, `${slug}-from-launcher.png`) });
    check(page.url() === `${base}/${slug}/index.html`, `card opens ${page.url()}`);
    const font = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    check(font.some((f) => /Nunito/i.test(f)), `bundled font loaded from the sub-folder (${[...new Set(font)].join(', ')})`);
    const playPoint = await toScreen(page, 360, 1280 * PLAY_Y[slug]);
    await page.touchscreen.tap(playPoint.x, playPoint.y);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(SHOTS, `${slug}-after-play-tap.png`) });
    check((await backToLauncher(page, base)) === 3, 'history back returns to the launcher (3 cards)');

    // 2. Same sub-folder with the test hook, to prove scene changes from real taps.
    await page.evaluate((s) => (location.href = `./${s}/index.html?test=1&seed=1`), slug);
    await page.waitForURL(`${base}/${slug}/index.html?test=1&seed=1`);
    const menu = await waitScene(page, (s) => s === 'menu', 'menu');
    check(menu.scene === 'menu', `${slug} reaches its menu`);
    await page.waitForTimeout(700); // menu pop-in
    const p = await toScreen(page, 360, 1280 * PLAY_Y[slug]);
    await page.touchscreen.tap(p.x, p.y);
    const next = await waitScene(page, (s) => s !== 'menu', 'leaving the menu');
    check(true, `one real tap on Play: menu → ${next.scene}`);
    const audio = await page.evaluate(() => (window.__audioContexts ?? []).map((c) => c.state));
    check(audio.includes('running'), `audio unlocked by that tap (AudioContext states: ${audio.join(', ') || 'none'})`);

    if (slug === 'fener') {
      await act(page, 'night', 1);
      const s = await waitScene(page, (k) => k === 'briefing' || k === 'game', 'briefing or game');
      if (s.scene === 'briefing') await act(page, 'ok');
      await waitScene(page, (k) => k === 'game', 'game');
    } else if (slug === 'murekkep') {
      await act(page, 'sheet', { index: 0 });
      await waitScene(page, (k) => k === 'game', 'game');
    }
    const playing = await state(page);
    check(['game', 'dig'].includes(playing.scene), `${slug} gameplay running (scene ${playing.scene})`);
    if (slug === 'fosil') {
      const before = playing.data.taps;
      const b = await toScreen(page, playing.data.ui.block.x, playing.data.ui.block.y);
      await page.touchscreen.tap(b.x, b.y);
      await page.waitForTimeout(300);
      const after = (await state(page)).data.taps;
      check(after === before + 1, `real tap on the dig block counts (taps ${before} → ${after})`);
      await act(page, 'tap', 60);
      await page.waitForTimeout(500);
      const d = (await state(page)).data;
      fosilSaved = { found: d.museum.found };
    }
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SHOTS, `${slug}-playing.png`) });
    check((await backToLauncher(page, base)) === 3, 'history back from gameplay returns to the launcher');
  }

  // fosil again: its save survived two other games on the same origin.
  console.log('\nfosil (second visit)');
  await page.evaluate(() => (location.href = './fosil/index.html?test=1&seed=1'));
  const again = await waitScene(page, (s) => s === 'menu', 'menu');
  check(fosilSaved && again.data.found >= fosilSaved.found && fosilSaved.found > 0, `fosil save kept after visiting fener and murekkep (museum ${again.data.found} ≥ ${fosilSaved?.found})`);
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  console.log(`  localStorage keys: ${keys.join(', ')}`);
  check(keys.every((k) => /^oyun:(fener|murekkep|fosil):/.test(k)), 'every storage key is namespaced oyun:<game>:');
  check(keys.includes('oyun:fosil:save'), 'oyun:fosil:save present');

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
