/* global window, localStorage */
// Scratch screenshots of every screen (not part of the gate).
// Usage: node tests/tools/shots.mjs <port> <outdir> <width>x<height> <lang>
import { chromium } from '@playwright/test';
const [port, out, size = '390x844', lang = 'en'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const tag = `${w}x${h}-${lang}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const errors = [];
async function session(saveData) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  if (saveData) await page.addInitScript((d) => localStorage.setItem('oyun:murekkep:save', JSON.stringify({ v: 1, data: d })), saveData);
  await page.goto(`http://127.0.0.1:${port}/?test=1&seed=3&lang=${lang}`);
  await page.waitForFunction(() => window.__OYUN__?.ready === true);
  return page;
}
const st = (page) => page.evaluate(() => window.__OYUN__.state());
const act = (page, n, p) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [n, p]);
const scene = (page, k) => page.waitForFunction((k) => window.__OYUN__?.state().scene === k, k, { timeout: 30000 });
const shot = (page, name) => page.screenshot({ path: `${out}/${name}-${tag}.png` });

// 1. Fresh player: menu, sheets, first match (hint, tips), a rejected tap, pause, result.
let page = await session(null);
await page.waitForTimeout(900); await shot(page, 'menu');
await act(page, 'play'); await scene(page, 'maps'); await page.waitForTimeout(900); await shot(page, 'maps-fresh');
await act(page, 'sheet', { index: 0 }); await scene(page, 'game'); await page.waitForTimeout(800); await shot(page, 'game-start');
let s = (await st(page)).data;
await act(page, 'tap', { x: s.ownCell.x, y: s.ownCell.y }); await page.waitForTimeout(250); await shot(page, 'reject-own');
s = (await st(page)).data;
await act(page, 'attack', { cell: s.targets[0].cell, percent: 30 }); await page.waitForTimeout(600); await shot(page, 'tip-tap');
await act(page, 'pause'); await scene(page, 'pause'); await page.waitForTimeout(500); await shot(page, 'pause');
await act(page, 'resume'); await scene(page, 'game');
await act(page, 'auto-play', { ticks: 100000 });
await act(page, 'fast-forward', 300); await page.waitForTimeout(700); await shot(page, 'c1-mid');
await act(page, 'fast-forward', 5000);
await scene(page, 'result'); await page.waitForTimeout(1600); await shot(page, 'result-c1');
console.log('c1 result', JSON.stringify((await st(page)).data));
await page.close();

// 2. Progress save: sheets with stars, full sheet early/mid/late, a loss, the daily sheet.
page = await session({ stars: [3, 2, 1, 1, 2, 1, 1, 0], bestSeconds: [95, 130, 170, 160, 200, 210, 230, 0], matches: 9, wins: 7, dailyDate: '', dailyBest: 0, streak: 0, lastDailyWin: '', speed: 1, tips: ['tap', 'empty', 'full', 'attacked'] });
await act(page, 'play'); await scene(page, 'maps'); await page.waitForTimeout(1500); await shot(page, 'maps-progress');
await act(page, 'sheet', { index: 7 }); await scene(page, 'game'); await page.waitForTimeout(800);
await act(page, 'auto-play', { ticks: 100000, policy: 'impatient' });
for (const [t, name] of [[250, 'c8-early'], [700, 'c8-mid'], [1100, 'c8-late']]) {
  s = await st(page);
  if (s.scene !== 'game') break;
  await act(page, 'fast-forward', Math.max(0, t - s.data.tick)); await page.waitForTimeout(700);
  if ((await st(page)).scene === 'game') await shot(page, name);
}
if ((await st(page)).scene === 'game') await act(page, 'fast-forward', 6000);
await scene(page, 'result'); await page.waitForTimeout(1600); await shot(page, 'result-c8');
console.log('c8 result', JSON.stringify((await st(page)).data));
await act(page, 'menu'); await scene(page, 'maps'); await act(page, 'daily'); await scene(page, 'game'); await page.waitForTimeout(900); await shot(page, 'daily');
await page.close();
console.log('errors', JSON.stringify(errors));
await browser.close();
