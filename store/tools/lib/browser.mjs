// Drives a capture build in Chromium through the game's own test hook (?test=1, see
// packages/core/README.md). Time is a fake clock (Playwright page.clock) that we pause and step,
// so a capture lands on the same animation frame every run.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

/**
 * Chromium for captures and renders. Playwright's headless mode uses its headless shell, which
 * also starts on Windows machines where the full bundled Chromium does not; installed Chrome
 * (`channel: 'chrome'`) and the Linux image's /opt/pw-browsers/chromium are fallbacks.
 * `opts.args`: extra flags (e.g. software WebGL for a three.js app, see webapp.mjs WEBGL_ARGS).
 */
export async function launch(opts = {}) {
  const args = opts.args ?? [];
  try {
    return await chromium.launch({ args });
  } catch (e) {
    if (existsSync('/opt/pw-browsers/chromium')) return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
    try {
      return await chromium.launch({ channel: 'chrome', args });
    } catch {
      throw e;
    }
  }
}

/**
 * Open the game. `storage` (key → JSON-able value) is written to localStorage before the game
 * boots, which is how a staged save gets in. The clock runs until the first scene is ready,
 * then it is paused: from there on only `run(ms)` moves time.
 */
export async function openGame(browser, build, { url, seed = 1, lang, storage = {}, stampLastSeen = [] }) {
  const context = await browser.newContext({
    viewport: { width: build.width, height: build.height },
    deviceScaleFactor: build.K,
    hasTouch: true,
    isMobile: false,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(
    ({ storage, stamp }) => {
      if (sessionStorage.getItem('__store_seeded')) return;
      sessionStorage.setItem('__store_seeded', '1');
      localStorage.clear();
      for (const [k, v] of Object.entries(storage)) {
        const value = structuredClone(v);
        // the game credits "time away" since lastSeen: stamp it a little ahead of the page's
        // clock so booting (which moves the fake clock a few seconds) earns no away haul
        for (const path of stamp) if (path[0] === k) setPath(value, path.slice(1), Date.now() + 120_000);
        localStorage.setItem(k, JSON.stringify(value));
      }
      function setPath(o, p, val) {
        let cur = o;
        for (let i = 0; i < p.length - 1; i++) cur = cur[p[i]];
        cur[p[p.length - 1]] = val;
      }
    },
    { storage, stamp: stampLastSeen },
  );
  // a fake clock, paused before the page loads: from here on only fastForward moves time
  const T0 = Date.now();
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(T0 + 5000);
  await page.goto(`${url}?test=1&seed=${seed}&lang=${lang}`);
  for (let i = 0; ; i++) {
    if (await page.evaluate(() => window.__OYUN__?.ready === true)) break;
    if (i > 900) throw new Error('game did not become ready');
    await page.clock.fastForward(50);
    await new Promise((r) => setTimeout(r, 10));
  }
  const g = {
    page,
    errors,
    async state() {
      return page.evaluate(() => window.__OYUN__.state());
    },
    async data() {
      return (await g.state()).data;
    },
    async act(name, payload) {
      return page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [name, payload]);
    },
    /**
     * Advance fake time by ms. Software WebGL at 2× is slow (~0.5 s per frame), so time moves in
     * jumps of up to `frame` ms, one rendered frame each (game delta is capped at 200 ms per
     * frame by core, tweens follow Date.now()). Use a smaller frame for a smooth landing.
     */
    async run(ms, frame = 120) {
      let left = ms;
      while (left > 0) {
        const d = Math.min(frame, left);
        await page.clock.fastForward(d);
        left -= d;
      }
    },
    /** Step time until fn(state) is true (checks every `step` ms); throws after `max` ms. */
    async until(fn, { step = 100, max = 30_000, what = 'condition' } = {}) {
      for (let t = 0; t <= max; t += step) {
        const s = await g.state();
        if (await fn(s)) return s;
        await g.run(step);
      }
      throw new Error(`timed out waiting for ${what}`);
    },
    async scene(key, max = 10_000) {
      return g.until((s) => s.scene === key, { what: `scene ${key}`, max });
    },
    async shot(path) {
      // one more frame so the canvas holds the latest state, then capture the viewport
      await page.clock.fastForward(17);
      await page.screenshot({ path, animations: 'allow', caret: 'initial' });
    },
    async close() {
      await context.close();
    },
  };
  return g;
}
