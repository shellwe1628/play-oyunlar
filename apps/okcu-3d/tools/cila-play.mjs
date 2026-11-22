/* global window */
// A burst of screenshots of the running game from the moment something happens in the world, for
// checking in-play effects that a fixed clock would miss (a boss landing, a hit, a wave clearing).
//
//   node tools/cila-play.mjs --url "http://localhost:5323/?seed=5&auto=1&wave=6&speed=2" \
//        --when "g.w.wave === 7 && g.w.enemies.some((e) => e.type === 'boss')" --out tools/out-cila/boss --n 8
//
// --when     JavaScript expression, `g` is window.__okcu3d; the burst starts when it turns true
// --eval     JavaScript run once the game is ready (e.g. "g.shoot(-0.7, 0.8)")
// --n        frames in the burst (default 6)      --gap   ms between two frames (default 0: back to back)
// --wait     ms to wait after `when` before the first frame (default 0)
// --timeout  seconds to wait for `when` (default 90)
// --size     WxH (default 390x844)                --clip  x,y,w,h viewport px to crop every frame
// Prints the world's phase and wave, module failures and console errors. One browser, closed at the end.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const url = args.url ?? 'http://localhost:5323/?seed=5&auto=1';
const out = resolve(args.out ?? 'tools/out-cila/play');
const n = Number(args.n ?? 6);
const gap = Number(args.gap ?? 0);
const [vw, vh] = (args.size ?? '390x844').split('x').map(Number);
const clip = args.clip ? args.clip.split(',').map(Number) : null;
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__okcu3d?.ready === true, null, { timeout: 60_000 });
  if (args.eval) await page.evaluate(`(() => { const g = window.__okcu3d; ${args.eval}; })()`);
  if (args.when) await page.waitForFunction(`(() => { const g = window.__okcu3d; return ${args.when}; })()`, null, { timeout: Number(args.timeout ?? 90) * 1000, polling: 50 });
  if (args.wait) await page.waitForTimeout(Number(args.wait));
  for (let i = 0; i < n; i++) {
    const file = `${out}-${i}.png`;
    await page.screenshot({ path: file, ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {}) });
    console.log(file);
    if (gap > 0) await page.waitForTimeout(gap);
  }
  const state = await page.evaluate(() => {
    const g = window.__okcu3d;
    return { frames: g.frames, phase: g.w.phase, wave: g.w.wave, failures: Object.fromEntries(g.failures) };
  });
  console.log(JSON.stringify(state));
  if (errors.length) console.log(`console errors:\n${[...new Set(errors)].slice(0, 12).join('\n')}`);
} finally {
  await browser.close();
}
