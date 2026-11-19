// Capture support for a listing whose game is a web app outside games/ (listing.config.mjs
// `app: 'apps/<name>'`, e.g. Sallanan Okçular's 3D build apps/okcu-3d). The app is built from its
// own sources with its own vite config, UNCHANGED (no capture patch: a three.js renderer already
// draws at devicePixelRatio, so the page is simply opened at 2× device scale). An optional
// `bot` bundle (a file in store/<slug>/ that imports the game's sim) is injected next to it to
// play through the app's test hook. Time is Playwright's fake clock, which also drives
// requestAnimationFrame and performance.now: one `run(33, 33)` is one rendered frame.
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { REPO } from './paths.mjs';

/** Chromium flags for WebGL without a GPU (software rasteriser, also on Windows). */
export const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

/** Build `app` (path relative to the repo) into a temp dir. Portrait 720×1280 logical, 2× pixels. */
export async function appBuild(app, K = 2) {
  const root = join(REPO, app);
  if (!existsSync(join(root, 'vite.config.ts'))) throw new Error(`app ${app}: no vite.config.ts`);
  const outDir = join(tmpdir(), 'oyun-store-build', `app-${basename(root)}`);
  const { build } = await import('vite');
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true, sourcemap: false, reportCompressedSize: false },
  });
  return { dir: outDir, width: 720, height: 1280, K, app };
}

/**
 * Bundle a capture bot (an ES module that sets a window global) into one classic script.
 * `root` is the game folder whose packages it resolves against (its imports of the sim are
 * relative paths into games/<slug>/src).
 */
export async function botScript(entry, root) {
  const outDir = join(tmpdir(), 'oyun-store-build', `bot-${basename(entry).replace(/\W/g, '_')}`);
  const { build } = await import('vite');
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      lib: { entry, formats: ['iife'], name: '__storeBotBundle', fileName: () => 'bot.js' },
    },
  });
  return readFileSync(join(outDir, 'bot.js'), 'utf8');
}

/**
 * Open the app. `storage` (key → JSON-able value) is written to localStorage before the app
 * boots (a staged save). The fake clock runs until `window[hook].ready`, then pauses: from there
 * on only `run(ms)` moves time. `locale` sets navigator.language, `htmlLang` the document's lang.
 */
export async function openApp(browser, build, { url, hook, query = {}, locale = 'en-US', storage = {}, bot = null, htmlLang = null }) {
  const context = await browser.newContext({
    viewport: { width: build.width, height: build.height },
    deviceScaleFactor: build.K,
    hasTouch: true,
    isMobile: false,
    locale,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ({ storage }) => {
      if (sessionStorage.getItem('__store_seeded')) return;
      sessionStorage.setItem('__store_seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, JSON.stringify(v));
    },
    { storage },
  );
  if (bot) await page.addInitScript({ content: bot });
  // `htmlLang`: set <html lang> once the page is parsed, for an app part that reads its language
  // from the document instead of the ?lang switch (what a phone set to that language would show)
  if (htmlLang) {
    await page.addInitScript((lang) => document.addEventListener('DOMContentLoaded', () => (document.documentElement.lang = lang), { once: true }), htmlLang);
  }
  const T0 = Date.now();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 5000);
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  await page.goto(`${url}${qs ? `?${qs}` : ''}`);
  for (let i = 0; ; i++) {
    if (await page.evaluate((h) => window[h]?.ready === true && window[h].frames > 2, hook)) break;
    if (i > 1200) throw new Error(`app did not become ready (window.${hook}.ready)`);
    await page.clock.fastForward(50);
    await new Promise((r) => setTimeout(r, 20));
  }
  await page.evaluate(() => document.fonts.ready);
  const g = {
    page,
    errors,
    hook,
    /** evaluate fn(H, arg) in the page with H = window[hook] */
    async eval(fn, arg) {
      return page.evaluate(([src, h, a]) => new Function('H', 'a', `return (${src})(H, a)`)(window[h], a), [fn.toString(), hook, arg]);
    },
    /** advance fake time by ms, one rendered frame per `frame` ms (the app caps a frame at 200 ms) */
    async run(ms, frame = 33) {
      let left = ms;
      while (left > 0) {
        const d = Math.min(frame, left);
        await page.clock.fastForward(d);
        left -= d;
      }
    },
    /** step frames until fn(H) is true in the page */
    async until(fn, { step = 100, frame = 100, max = 30_000, what = 'condition' } = {}) {
      for (let t = 0; t <= max; t += step) {
        if (await g.eval(fn)) return true;
        await g.run(step, frame);
      }
      throw new Error(`timed out waiting for ${what}`);
    },
    /** a real tap (pointer down + up through the element's own handlers) on the button showing `text` */
    async tap(text) {
      const ok = await page.evaluate((text) => {
        const els = [...document.querySelectorAll('[data-ui]')].filter((e) => e.textContent.trim() === text || e.textContent.trim().startsWith(text));
        const e = els.find((x) => x.offsetParent !== null && getComputedStyle(x).visibility !== 'hidden') ?? els[0];
        if (!e) return false;
        const r = e.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
        e.dispatchEvent(new PointerEvent('pointerdown', o));
        e.dispatchEvent(new PointerEvent('pointerup', o));
        return true;
      }, text);
      if (!ok) throw new Error(`no button "${text}"`);
    },
    /**
     * Speed of the page's CSS / Web Animations (they run on real time, not the fake clock).
     * Software WebGL draws a frame in roughly 0.5–1 s of real time, so a rate around 0.05–0.1
     * keeps DOM animations near the fake clock's pace during a shot.
     */
    async animRate(rate) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Animation.enable');
      await cdp.send('Animation.setPlaybackRate', { playbackRate: rate });
    },
    async shot(path) {
      await page.clock.fastForward(17);
      await page.screenshot({ path, animations: 'allow', caret: 'initial' });
    },
    async close() {
      await context.close();
    },
  };
  return g;
}
