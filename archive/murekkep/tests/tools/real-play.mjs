/* global window */
// Scratch: play a whole match with REAL pointer input only (touch taps, mouse drags); the test
// hook is used only to READ state (targets, reserve). node tests/tools/real-play.mjs <port> <outdir>
import { chromium } from '@playwright/test';
const [port, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
const st = () => page.evaluate(() => window.__OYUN__.state());
const box = async () => (await page.locator('canvas').boundingBox());
const P = async (x, y) => { const b = await box(); const s = b.width / 720; return { x: b.x + x * s, y: b.y + y * s }; };
const tap = async (x, y) => { const p = await P(x, y); await page.touchscreen.tap(p.x, p.y); };
await page.goto(`http://127.0.0.1:${port}/?test=1&seed=7&lang=en`);
await page.waitForFunction(() => window.__OYUN__?.ready === true);
await page.waitForTimeout(800);
// Menu → Play (button at 0.62 h), Sheets → Sheet 1 card, all by touch.
await tap(360, 1280 * 0.62);
await page.waitForFunction(() => window.__OYUN__.state().scene === 'maps');
await page.waitForTimeout(500);
await tap(186, 150 + 98);
await page.waitForFunction(() => window.__OYUN__.state().scene === 'game');
await page.waitForTimeout(600);
let s = (await st()).data;
await tap(s.speedButton.x, s.speedButton.y);
let taps = 0, drags = 0, rejected = 0;
const t0 = Date.now();
let lastShot = 0;
while (Date.now() - t0 < 300_000) {
  const all = await st();
  if (all.scene !== 'game') break;
  s = all.data;
  if (s.phase !== 'playing') { await page.waitForTimeout(300); continue; }
  // Sweet-spot player: drag the slider to spend down to ~45 % fill, then tap a border cell.
  const fill = s.reserve / s.cap;
  if (fill >= 0.55 && s.targets.length) {
    const want = Math.max(10, Math.min(100, Math.round(((fill - 0.42) / fill) * 100 / 5) * 5));
    if (Math.abs(want - s.commit) >= 10) {
      const from = await P(s.slider.x0 + ((s.commit - 10) / 90) * (s.slider.x1 - s.slider.x0), s.slider.y);
      const to = await P(s.slider.x0 + ((want - 10) / 90) * (s.slider.x1 - s.slider.x0), s.slider.y);
      await page.mouse.move(from.x, from.y); await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
      drags++;
    }
    const tg = s.targets[(taps * 3) % s.targets.length];
    const before = s.reserve;
    await tap(tg.x, tg.y);
    taps++;
    await page.waitForTimeout(120);
    if ((await st()).data.reserve >= before) rejected++;
  }
  if (Date.now() - lastShot > 20000) { lastShot = Date.now(); await page.screenshot({ path: `${out}/real-${Math.round((Date.now() - t0) / 1000)}s.png` }); }
  await page.waitForTimeout(250);
}
await page.waitForFunction(() => window.__OYUN__.state().scene === 'result', null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/real-result.png` });
const r = (await st()).data;
console.log(JSON.stringify({ realSeconds: Math.round((Date.now() - t0) / 1000), taps, drags, rejected, result: r, errors }));
await browser.close();
