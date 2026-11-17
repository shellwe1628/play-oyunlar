/* global window, localStorage */
// Scratch: full-sheet screenshots (not part of the gate). node tests/tools/shots-full.mjs <port> <outdir> [lang]
import { chromium } from '@playwright/test';
const [port, out, lang = 'en'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  const data = { stars: [3, 2, 1, 1, 2, 1, 1, 0], bestSeconds: [95, 130, 170, 160, 200, 210, 230, 0], matches: 9, wins: 7, dailyDate: '', dailyBest: 0, streak: 2, lastDailyWin: '', commit: 30, speed: 1 };
  localStorage.setItem('oyun:murekkep:save', JSON.stringify({ v: 1, data }));
});
const act = (n, p) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [n, p]);
const st = async () => (await page.evaluate(() => window.__OYUN__.state()));
const scene = (k) => page.waitForFunction((k) => window.__OYUN__?.state().scene === k, k, { timeout: 15000 });
await page.goto(`http://127.0.0.1:${port}/?test=1&seed=5&lang=${lang}`);
await page.waitForFunction(() => window.__OYUN__?.ready === true);
await act('play'); await scene('maps'); await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/maps-progress-${lang}.png` });
await act('sheet', { index: 7 }); await scene('game'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/c8-start-${lang}.png` });
await act('auto-play', { ticks: 100000 });
const at = async (tick, name) => {
  const s = await st(); if (s.scene !== 'game') return;
  const n = tick - s.data.tick; if (n > 0) await act('fast-forward', n);
  await page.waitForTimeout(900);
  const s2 = await st();
  if (s2.scene === 'game') { await page.screenshot({ path: `${out}/${name}-${lang}.png` }); console.log(name, s2.data.tick, JSON.stringify(s2.data.shares), 'blot', s2.data.blot, s2.data.blotReady); }
};
await at(250, 'c8-early');
await at(900, 'c8-mid');
await at(1500, 'c8-late');
await at(2400, 'c8-later');
const s = await st();
if (s.scene === 'game') await act('fast-forward', 5000);
await scene('result'); await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/c8-result-${lang}.png` });
console.log('result', JSON.stringify((await st()).data));
await act('menu'); await scene('maps'); await act('daily'); await scene('game'); await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/daily-${lang}.png` });
console.log('daily', JSON.stringify((await st()).data.mapId));
console.log('errors', JSON.stringify(errors));
await browser.close();
