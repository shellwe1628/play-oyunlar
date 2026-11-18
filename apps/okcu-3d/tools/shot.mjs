/* global window */
// Headless screenshots of the running dev server, for checking the 3D view without a window.
//
//   node tools/shot.mjs --url "http://localhost:5181/?seed=5&auto=1" --out shots/a --at 1,3,6
//   node tools/shot.mjs --url "http://localhost:5181/?seed=5&wave=4" --out shots/b --at 2 --eval "window.__okcu3d.shoot(-0.6, 0.7)"
//
// --at     seconds after the game is ready at which to capture (comma separated)
// --eval   JavaScript run in the page once ready (e.g. fire a shot, skip time)
// --size   WxH of the viewport, default 540x960 (portrait 9:16)
// --clip   x,y,w,h in viewport px to crop every capture (zoom in on a detail)
// Prints console errors and window.__okcu3d.failures so a broken module is visible.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const url = args.url ?? 'http://localhost:5180/?seed=5&auto=1';
const out = resolve(args.out ?? 'shots/shot');
const at = (args.at ?? '2').split(',').map(Number);
const [vw, vh] = (args.size ?? '540x960').split('x').map(Number);
const clip = args.clip ? args.clip.split(',').map(Number) : null;
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', (err) => errors.push(String(err)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 60_000 });
if (args.eval) await page.evaluate(args.eval);
const t0 = Date.now();
for (const t of at) {
  const wait = t * 1000 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const file = `${out}-${String(t).replace('.', '_')}s.png`;
  await page.screenshot({ path: file, ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {}) });
  console.log(file);
}
const state = await page.evaluate(() => {
  const g = window.__okcu3d;
  return { frames: g.frames, phase: g.w.phase, wave: g.w.wave, failures: Object.fromEntries(g.failures) };
});
console.log(JSON.stringify(state));
if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 12).join('\n')}`);
await browser.close();
