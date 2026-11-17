/* global window, localStorage */
// Scratch: Blot armed / used / rewarded recharge on sheet 4. node tests/tools/blot-check.mjs <port> <outdir>
import { chromium } from '@playwright/test';
const [port, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const data = { stars: [1, 1, 1, 0, 0, 0, 0, 0], bestSeconds: [0, 0, 0, 0, 0, 0, 0, 0], matches: 3, wins: 3, dailyDate: '', dailyBest: 0, streak: 0, lastDailyWin: '', commit: 30, speed: 1 };
  localStorage.setItem('oyun:murekkep:save', JSON.stringify({ v: 1, data }));
});
const act = (n, p) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [n, p]);
const st = async () => (await page.evaluate(() => window.__OYUN__.state())).data;
await page.goto(`http://127.0.0.1:${port}/?test=1&seed=4&lang=tr`);
await page.waitForFunction(() => window.__OYUN__?.ready === true);
await act('play'); await page.waitForFunction(() => window.__OYUN__.state().scene === 'maps');
await act('sheet', { index: 3 }); await page.waitForFunction(() => window.__OYUN__.state().scene === 'game');
await act('fast-forward', 120);
let s = await st();
console.log('blot available', s.blot, 'ready', s.blotReady);
await act('blot'); // arms
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/blot-armed.png` });
const area0 = s.shares[0];
await act('blot', { cell: s.targets[0].cell });
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/blot-used.png` });
s = await st();
console.log('share before', area0, 'after', s.shares[0], 'ready', s.blotReady);
await act('blot'); // on cooldown → rewarded → granted
await page.waitForTimeout(400);
s = await st();
console.log('after rewarded ready', s.blotReady);
console.log('errors', JSON.stringify(errors));
await browser.close();
