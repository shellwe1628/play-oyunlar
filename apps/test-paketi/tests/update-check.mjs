#!/usr/bin/env node
/* global window, document, crypto, fetch */
// Repeatable browser check of the in-app update banner (no phone needed).
//   node apps/test-paketi/tests/update-check.mjs [webDir]
// webDir default: assets/public unpacked from the bundle APK listed in build/test-apk/versions.json
// (exactly what is inside the test APK: launcher, games and oyun-test-update.js on every page).
//
// Two local servers: the web folder (like https://localhost in the app) and a fake GitHub
// release (versions.json + an APK-sized file, scenario chosen per test). A fake native bridge
// (window.Capacitor with nativePromise / addListener / PluginHeaders, as Capacitor injects it)
// implements the TestUpdate plugin's contract in the page: check/download go to the fake
// release with fetch (native code does this with HttpURLConnection on the phone), download
// streams with progress and SHA-256 exactly like TestUpdatePlugin.java, install/settings record
// the call and answer as the scenario says. What this cannot prove: the Java side, Android's
// settings screen and package installer (never run on a device).
// Screenshots (390×844): apps/test-paketi/tests/artifacts/update/.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(APP, '..', '..');
const OUT = join(ROOT, 'build', 'test-apk');
const SHOTS = join(APP, 'tests', 'artifacts', 'update');
const VIEW = { width: 390, height: 844 };
const APP_ID = 'com.playoyunlar.testpaketi';
const INSTALLED = 462000;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

// ------------------------------------------------------------------ web folder
let tmp = null;
function webDir() {
  if (process.argv[2]) return resolve(process.argv[2]);
  const manifest = join(OUT, 'versions.json');
  if (!existsSync(manifest)) throw new Error(`no ${manifest}: run npm run apk first (or pass a web folder)`);
  const entry = JSON.parse(readFileSync(manifest, 'utf8')).apps.find((a) => a.applicationId === APP_ID);
  if (!entry) throw new Error(`${manifest} has no ${APP_ID} (run npm run apk or npm run apk -- all)`);
  tmp = mkdtempSync(join(tmpdir(), 'oyun-update-'));
  execFileSync('unzip', ['-q', join(OUT, entry.file), 'assets/public/*', '-d', tmp]);
  console.log(`web folder: assets/public of ${entry.file}`);
  return join(tmp, 'assets', 'public');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
const listen = (server) => new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));

function serveWeb(dir) {
  return listen(
    createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
      let file = normalize(join(dir, path));
      if (!file.startsWith(dir)) return void res.writeHead(403).end();
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return void res.writeHead(404).end('not found');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(file));
    }),
  );
}

// ------------------------------------------------------------------ fake GitHub release
const APK = randomBytes(3 * 1024 * 1024 + 123);
const APK_SHA = createHash('sha256').update(APK).digest('hex');
const release = { scenario: {}, checks: 0, downloads: 0 };

function entry(over = {}) {
  return {
    applicationId: APP_ID,
    versionCode: INSTALLED + 15,
    versionName: 'test-2026-11-17-abc1234',
    file: `play-oyunlar-test-${INSTALLED + 15}.apk`,
    size: APK.length,
    sha256: APK_SHA,
    builtAt: '2026-11-17T20:00:00.000Z',
    notes: 'Sparkrise: faster restart after a crash',
    ...over,
  };
}

function serveRelease() {
  return listen(
    createServer((req, res) => {
      const s = release.scenario;
      const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (path === '/versions.json') {
        release.checks++;
        if (s.status && s.status !== 200) return void res.writeHead(s.status, cors).end('<html>Not Found</html>');
        const body = s.body ?? JSON.stringify({ schema: 1, generatedAt: '2026-11-17T20:00:00.000Z', commit: 'abc1234', apps: [entry(s.entry)] });
        return void res.writeHead(200, { ...cors, 'content-type': 'application/json' }).end(body);
      }
      if (path.endsWith('.apk')) {
        release.downloads++;
        res.writeHead(200, { ...cors, 'content-type': 'application/vnd.android.package-archive', 'content-length': String(APK.length) });
        // Slow enough to see the progress bar; optionally cut off half way.
        let at = 0;
        const chunk = 96 * 1024;
        const tick = () => {
          if (s.cutAt && at >= s.cutAt) return void res.destroy();
          if (at >= APK.length) return void res.end();
          res.write(s.corrupt && at === 0 ? Buffer.alloc(chunk, 7) : APK.subarray(at, at + chunk));
          at += chunk;
          setTimeout(tick, s.chunkDelay ?? 40);
        };
        return void tick();
      }
      res.writeHead(404, cors).end();
    }),
  );
}

// ------------------------------------------------------------------ fake native bridge
/** Runs in the page before any script: the TestUpdate plugin's contract, see native.ts. */
function fakeBridge(cfg) {
  const calls = [];
  const listeners = [];
  const reject = (code) => Promise.reject(Object.assign(new Error(code), { code }));
  const plugin = {
    info: async () => ({ applicationId: cfg.appId, versionCode: cfg.installed, versionName: 'test-old', sdk: 34 }),
    async check() {
      if (cfg.offline) return reject('NETWORK');
      const r = await fetch(`${cfg.release}/versions.json`, { cache: 'no-store' });
      return { status: r.status, body: r.status === 200 ? await r.text() : '' };
    },
    canInstall: async () => ({ canInstall: cfg.canInstall }),
    openInstallSettings: async () => {
      await new Promise((r) => setTimeout(r, 300));
      return { canInstall: cfg.settingsGrants };
    },
    async download({ file, size, sha256 }) {
      if (cfg.offline) return reject('NETWORK');
      let received = 0;
      try {
        const r = await fetch(`${cfg.release}/${file}`, { cache: 'no-store' });
        if (r.status !== 200) return reject('HTTP');
        const reader = r.body.getReader();
        const parts = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > size) return reject('SIZE');
          parts.push(value);
          for (const cb of listeners) cb({ received, total: size });
        }
        if (received !== size) return reject('SIZE');
        const all = new Uint8Array(received);
        let o = 0;
        for (const p of parts) all.set(p, (o += p.length) - p.length);
        const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map((b) => b.toString(16).padStart(2, '0')).join('');
        if (hex !== sha256) return reject('CHECKSUM');
        return { bytes: received, sha256: hex };
      } catch {
        return reject(received > 0 ? 'INTERRUPTED' : 'NETWORK');
      }
    },
    install: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { result: cfg.installResult };
    },
  };
  window.__nativeCalls = calls;
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    PluginHeaders: [{ name: 'TestUpdate', methods: Object.keys(plugin).map((name) => ({ name, rtype: 'promise' })) }],
    nativePromise(name, method, options) {
      calls.push(method);
      if (name !== 'TestUpdate' || !plugin[method]) return reject('UNIMPLEMENTED');
      return plugin[method](options);
    },
    addListener(name, event, cb) {
      if (name === 'TestUpdate' && event === 'progress') listeners.push(cb);
      return { remove: async () => undefined };
    },
  };
}

// ------------------------------------------------------------------ helpers
async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

const DEFAULTS = { appId: APP_ID, installed: INSTALLED, offline: false, canInstall: true, settingsGrants: true, installResult: 'cancelled' };

async function open(browser, { locale = 'en-US', native = {}, scenario = {}, viewport = VIEW } = {}) {
  release.scenario = scenario;
  release.checks = 0;
  release.downloads = 0;
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, locale });
  await context.addInitScript(fakeBridge, { ...DEFAULTS, release: releaseUrl, ...native });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const cdp = await context.newCDPSession(page);
  return { context, page, errors, cdp };
}

const banner = (page) => page.locator('#oyun-test-update');
const bannerState = (page) => page.evaluate(() => document.getElementById('oyun-test-update')?.dataset.state ?? 'absent');
const visible = (page) =>
  page.evaluate(() => {
    const h = document.getElementById('oyun-test-update');
    return !!h && h.style.display !== 'none' && h.style.visibility !== 'hidden' && h.getBoundingClientRect().height > 0;
  });
const text = (page) => page.evaluate(() => document.getElementById('oyun-test-update')?.shadowRoot?.textContent ?? '');
const calls = (page) => page.evaluate(() => window.__nativeCalls.slice());
const shot = (page, name) => page.screenshot({ path: join(SHOTS, `${name}.png`) });

async function waitState(page, kinds, timeout = 15_000) {
  const want = [kinds].flat();
  const end = Date.now() + timeout;
  let s;
  while (Date.now() < end) {
    s = await bannerState(page);
    if (want.includes(s)) return s;
    await page.waitForTimeout(50);
  }
  throw new Error(`banner state ${s}, expected ${want.join('|')}`);
}

/** Wait until the check has run and settled (no banner expected). */
async function settled(page) {
  await page.waitForFunction(() => window.__nativeCalls?.includes('check'), null, { timeout: 15_000 });
  await page.waitForTimeout(600);
}

const tapButton = (page, event) => page.locator(`#oyun-test-update button[data-event="${event}"]`).tap();

function finger(cdp) {
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 1, radiusX: 8, radiusY: 8, force: 1 })) });
  return { down: (p) => send('touchStart', [p]), up: () => send('touchEnd', []) };
}

const overlaps = (a, b) => a.y < b.y + b.height && b.y < a.y + a.height && a.x < b.x + b.width && b.x < a.x + a.width;
const gameState = (page) => page.evaluate(() => window.__OYUN__?.state() ?? null);

async function until(page, pred, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let s = null;
  while (Date.now() < end) {
    s = await gameState(page).catch(() => null);
    if (s?.ready && pred(s)) return s;
    await page.waitForTimeout(100);
  }
  throw new Error(`timeout waiting for ${label}; last ${JSON.stringify(s?.data?.phase)}`);
}

// ------------------------------------------------------------------ run
const dir = webDir();
const web = await serveWeb(dir);
const rel = await serveRelease();
const base = `http://127.0.0.1:${web.address().port}`;
const releaseUrl = `http://127.0.0.1:${rel.address().port}`;
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
check(['', 'kivilcim', 'okcu', 'fosil'].every((d) => readFileSync(join(dir, d, 'index.html'), 'utf8').includes('src="./oyun-test-update.js"')), 'every page of the APK web folder loads oyun-test-update.js');
const browser = await launch();

async function scenario(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: ${e?.stack ?? e}`);
    console.error(`  FAIL ${name}: ${e?.message ?? e}`);
  }
}

try {
  await scenario('newer version offered (English launcher)', async () => {
    const { context, page, errors } = await open(browser);
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    const t = await text(page);
    check(t.includes('New test version available') && t.includes('Sparkrise: faster restart after a crash'), `title + what-changed line: "${t.slice(0, 90)}…"`);
    check(t.includes('Update') && t.includes('Later'), 'buttons Update and Later');
    const box = await banner(page).boundingBox();
    check(box.y >= 0 && box.y < 80 && box.height >= 44 && box.height <= 64, `compact banner at the top (y ${box.y.toFixed(0)}, h ${box.height.toFixed(0)})`);
    check((await page.locator('a.card').count()) === 3, 'launcher still usable under it (3 cards)');
    await shot(page, '01-available-en');
    check(!errors.length, `no page errors ${JSON.stringify(errors)}`);
    await context.close();
  });

  await scenario('Turkish device', async () => {
    const { context, page } = await open(browser, { locale: 'tr-TR' });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    const t = await text(page);
    check(t.includes('Yeni test sürümü var') && t.includes('Güncelle') && t.includes('Sonra'), `Turkish texts: "${t.slice(0, 80)}…"`);
    await shot(page, '02-available-tr');
    await context.close();
  });

  for (const [label, opts] of [
    ['equal versionCode', { scenario: { entry: { versionCode: INSTALLED } } }],
    ['older versionCode', { scenario: { entry: { versionCode: INSTALLED - 100 } } }],
    ['only another app in the manifest', { scenario: { entry: { applicationId: 'com.playoyunlar.sparkrise.test' } } }],
    ['malformed manifest (HTML)', { scenario: { body: '<html><body>Rate limited</body></html>' } }],
    ['malformed manifest (bad sha256)', { scenario: { entry: { sha256: 'xyz' } } }],
    ['manifest HTTP 404', { scenario: { status: 404 } }],
    ['no network', { native: { offline: true } }],
  ]) {
    await scenario(`no banner: ${label}`, async () => {
      const { context, page, errors } = await open(browser, opts);
      await page.goto(`${base}/`);
      await settled(page);
      check(!(await visible(page)) && ['idle', 'absent'].includes(await bannerState(page)), `no banner (state ${await bannerState(page)})`);
      check((await page.locator('a.card').count()) === 3 && !errors.length, `launcher works, no page errors ${JSON.stringify(errors)}`);
      if (label === 'no network') await shot(page, '03-no-network-no-banner');
      await context.close();
    });
  }

  await scenario('Later hides it for the rest of the app run (also on game pages)', async () => {
    const { context, page } = await open(browser);
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await tapButton(page, 'later');
    await waitState(page, 'hidden');
    check(!(await visible(page)), 'banner gone after Later');
    await page.goto(`${base}/okcu/index.html`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(1500);
    check(!(await visible(page)) && !(await calls(page)).includes('check'), 'game page: still hidden, no new check');
    await context.close();
  });

  await scenario('offer carried from the launcher to a game page without a second request', async () => {
    const { context, page } = await open(browser);
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await page.tap('a.card[data-slug="fosil"]');
    await page.waitForURL(`${base}/fosil/index.html`);
    await waitState(page, 'available');
    check(release.checks === 1, `one manifest request for both pages (${release.checks})`);
    await page.waitForSelector('canvas');
    await page.waitForTimeout(2500);
    await shot(page, '04-available-fosil-letterbox');
    await context.close();
  });

  await scenario('Update: download with progress → SHA-256 ok → installer; double tap starts nothing twice; backing out', async () => {
    const { context, page } = await open(browser, { scenario: { chunkDelay: 60 } });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    const btn = page.locator('#oyun-test-update button[data-event="update"]');
    await btn.tap();
    await btn.tap({ timeout: 300 }).catch(() => undefined); // second tap: button already gone
    await waitState(page, 'downloading');
    await page.waitForTimeout(1500);
    const t = await text(page);
    const pct = /(\d+)%/.exec(t)?.[1];
    check(pct !== undefined && Number(pct) > 0 && Number(pct) < 100, `progress shown (${pct}%)`);
    check(/update this app\?/i.test(t), 'explains Android’s "Do you want to update this app?" before it appears');
    await shot(page, '05-downloading');
    await waitState(page, 'installing', 20_000);
    check((await text(page)).includes('Confirm on Android'), 'installer hand-off state');
    await shot(page, '06-installing');
    await waitState(page, 'failed');
    const c = await calls(page);
    check(c.filter((x) => x === 'download').length === 1 && c.filter((x) => x === 'install').length === 1 && release.downloads === 1, `one download, one install call (${c.join(',')})`);
    check((await text(page)).includes('You left Android’s install screen'), 'backing out of the installer is explained, retry offered');
    await shot(page, '07-installer-cancelled');
    await context.close();
  });

  await scenario('install permission missing → explained → settings → still refused', async () => {
    const { context, page } = await open(browser, { native: { canInstall: false, settingsGrants: false } });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await tapButton(page, 'update');
    await waitState(page, 'needPermission');
    check((await text(page)).includes('Allow from this source'), 'explains the "Allow from this source" screen first');
    await shot(page, '08-permission-explained');
    check(!(await calls(page)).includes('openInstallSettings'), 'settings not opened before the tap');
    await tapButton(page, 'openSettings');
    await waitState(page, 'failed');
    check((await calls(page)).includes('openInstallSettings') && !(await calls(page)).includes('download'), 'settings opened; nothing downloaded without the permission');
    await shot(page, '09-permission-refused');
    await context.close();
  });

  await scenario('permission granted in settings → download continues', async () => {
    const { context, page } = await open(browser, { native: { canInstall: false, settingsGrants: true }, scenario: { chunkDelay: 5 } });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await tapButton(page, 'update');
    await waitState(page, 'needPermission');
    await tapButton(page, 'openSettings');
    await waitState(page, ['downloading', 'installing']);
    check(true, 'after the setting the update downloads');
    await context.close();
  });

  await scenario('checksum mismatch', async () => {
    const { context, page } = await open(browser, { scenario: { corrupt: true, chunkDelay: 5 } });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await tapButton(page, 'update');
    await waitState(page, 'failed', 20_000);
    const t = await text(page);
    check(t.includes('SHA-256') && !(await calls(page)).includes('install'), `reported, never installed: "${t.slice(0, 100)}…"`);
    await shot(page, '10-checksum-mismatch');
    await context.close();
  });

  await scenario('download interrupted, then retry succeeds', async () => {
    const { context, page } = await open(browser, { scenario: { cutAt: 1024 * 1024, chunkDelay: 5 } });
    await page.goto(`${base}/`);
    await waitState(page, 'available');
    await tapButton(page, 'update');
    await waitState(page, 'failed', 20_000);
    check((await text(page)).includes('interrupted'), 'interruption reported with a retry');
    await shot(page, '11-interrupted');
    release.scenario = { chunkDelay: 5 };
    await tapButton(page, 'update');
    await waitState(page, ['installing', 'failed'], 20_000);
    check((await calls(page)).includes('install'), 'retry downloads again and reaches the installer');
    await context.close();
  });

  await scenario('Sparkrise mid-run: banner only in the letterbox, its taps never reach the game', async () => {
    const { context, page, cdp } = await open(browser);
    const f = finger(cdp);
    await page.goto(`${base}/kivilcim/index.html?test=1&seed=1`);
    await until(page, (s) => s.scene === 'game' && s.data.phase === 'title', 'title');
    await waitState(page, 'available');
    await page.waitForTimeout(500);
    const canvas = await page.locator('canvas').boundingBox();
    const box = await banner(page).boundingBox();
    const mode = await banner(page).getAttribute('data-mode');
    check(mode === 'letterbox' && !overlaps(canvas, box), `letterbox mode, no overlap with the canvas (canvas y ${canvas.y.toFixed(0)}–${(canvas.y + canvas.height).toFixed(0)}, banner y ${box.y.toFixed(0)}–${(box.y + box.height).toFixed(0)})`);
    // A tap on the banner's text (not a button) on the title screen must not start a run.
    await f.down({ x: box.x + 40, y: box.y + box.height / 2 });
    await page.waitForTimeout(300);
    await f.up();
    await page.waitForTimeout(300);
    check((await gameState(page)).data.phase === 'title', 'tap on the banner does not start a run');
    // Start a run with a real press in the shaft and hold it: the banner stays outside.
    await f.down({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.55 });
    const run = await until(page, (s) => s.data.phase !== 'title', 'run start', 10_000);
    await page.waitForTimeout(250);
    const box2 = await banner(page).boundingBox();
    check(run.data.held === true && (await visible(page)) && !overlaps(canvas, box2), `mid-run (phase ${run.data.phase}, held): banner visible outside the play area`);
    await shot(page, '12-sparkrise-mid-run-letterbox');
    await f.up();
    await context.close();
  });

  await scenario('16:9 screen (no letterbox): waits while playing, appears after 4 s without touches, hides on touch', async () => {
    const { context, page, cdp } = await open(browser, { viewport: { width: 390, height: 693 } });
    const f = finger(cdp);
    await page.goto(`${base}/kivilcim/index.html?test=1&seed=1`);
    await until(page, (s) => s.scene === 'game' && s.data.phase === 'title', 'title');
    const canvas = await page.locator('canvas').boundingBox();
    // Start a run right away, before the check result lands.
    await f.down({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.55 });
    await until(page, (s) => s.data.phase !== 'title', 'run start', 10_000);
    await waitState(page, 'available');
    check(!(await visible(page)) && (await banner(page).getAttribute('data-mode')) === 'wait', 'held finger mid-run: banner waits (not shown)');
    await f.up();
    await page.waitForTimeout(1500);
    const mid = await gameState(page);
    check(!(await visible(page)), `1.5 s after release: still not shown (phase ${mid.data.phase})`);
    await page.waitForTimeout(3000);
    const after = await gameState(page);
    check((await visible(page)) && (await banner(page).getAttribute('data-mode')) === 'overlay', `after 4 s without touch: shown over the top (game phase now ${after.data.phase})`);
    check(after.data.phase !== 'playing' && after.data.phase !== 'title', `a run cannot last 4 s without input: phase is ${after.data.phase}`);
    await shot(page, '13-sparkrise-16x9-after-idle');
    await f.down({ x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height * 0.7 });
    await page.waitForTimeout(200);
    check(!(await visible(page)), 'a touch on the game hides it again');
    await f.up();
    await context.close();
  });
} finally {
  await browser.close();
  web.close();
  rel.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nscreenshots: ${SHOTS}`);
console.log(failures.length ? `UPDATE CHECK FAILED (${failures.length})` : 'UPDATE CHECK PASSED');
process.exit(failures.length ? 1 : 0);
