/* global window, document, CanvasRenderingContext2D */
// Playwright check: a stage modifier's tip reaches the player on the first such stage, even when
// an enemy intro holds the banner. Starts on the stage before, knocks its archers out, taps a
// card the way a finger does (so the HUD runs its real wave-start path) and records every text
// the HUD draws for a while (its labels are canvases: fillText is recorded).
//
//   node tools/tips-check.mjs --base http://localhost:5180
import { chromium } from '@playwright/test';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []));
const base = args.base ?? 'http://localhost:5180';
const CASES = [
  { name: 'chapter 1 stage 5 (moving base)', from: 4, want: 'Your ledge slides' },
  { name: 'chapter 2 stage 2 (fog)', from: 8, want: 'Fog: far archers' },
];

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
let failed = 0;
for (const c of CASES) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    window.__texts = [];
    const proto = CanvasRenderingContext2D.prototype;
    const fill = proto.fillText;
    proto.fillText = function (text, ...rest) {
      window.__texts.push(String(text));
      return fill.call(this, text, ...rest);
    };
  });
  await page.goto(`${base}/?seed=5&wave=${c.from}&lang=en`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 60_000 });
  await page.waitForTimeout(800);
  // the stage before: every archer is set alight with no health left, so the next burn tick drops it
  await page.evaluate(() => {
    const w = window.__okcu3d.w;
    w.player.hp = 1e6;
    for (const e of w.enemies) {
      e.hp = 0.01;
      e.burn = 1;
      e.burnDps = 10;
      e.burnTick = 0;
    }
  });
  await page.waitForFunction(() => window.__okcu3d.w.phase === 'cards' && document.querySelector('.ok-card'), null, { timeout: 30_000 });
  await page.waitForTimeout(900);
  const box = await page.locator('.ok-card').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction((wave) => window.__okcu3d.w.wave === wave, c.from + 1, { timeout: 10_000 });
  const texts = new Set();
  for (let i = 0; i < 40; i++) {
    for (const line of await page.evaluate(() => window.__texts.splice(0))) if (line.trim()) texts.add(line.trim());
    await page.evaluate(() => {
      window.__okcu3d.w.player.hp = 1e6;
    });
    await page.waitForTimeout(150);
  }
  const hit = [...texts].find((t) => t.includes(c.want));
  console.log(`${c.name}: tip=${hit ? JSON.stringify(hit) : 'MISSING'}`);
  console.log(`  texts: ${JSON.stringify([...texts].filter((t) => t.length > 8))}`);
  if (!hit) failed += 1;
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
