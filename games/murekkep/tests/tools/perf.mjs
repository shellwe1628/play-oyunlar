/* global window, document, localStorage, performance, requestAnimationFrame */
// Scratch perf probe (not part of the gate). node tests/perf.mjs <port> <outdir> [level]
import { chromium } from '@playwright/test';
const [port, out, level = 'c8'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await page.addInitScript(() => {
  const data = { stars: [1,1,1,1,1,1,1,0], bestSeconds: [0,0,0,0,0,0,0,0], matches: 0, wins: 0, dailyDate: '', dailyBest: 0, streak: 0, lastDailyWin: '', commit: 30, speed: 2 };
  localStorage.setItem('oyun:murekkep:save', JSON.stringify({ v: 1, data }));
});
const act = (n, p) => page.evaluate(([n, p]) => window.__OYUN__.act(n, p), [n, p]);
const st = () => page.evaluate(() => window.__OYUN__.state());
await page.goto(`http://127.0.0.1:${port}/?test=1&seed=3&lang=en`);
await page.waitForFunction(() => window.__OYUN__?.ready === true);
await act('play');
await page.waitForFunction(() => window.__OYUN__.state().scene === 'maps');
await act(level === 'daily' ? 'daily' : 'sheet', { index: Number(level.slice(1)) - 1 });
await page.waitForFunction(() => window.__OYUN__.state().scene === 'game');
await act('auto-play', { ticks: 99999 });
if (process.argv[5]) { await act('fast-forward', Number(process.argv[5])); await page.waitForTimeout(500); }
const gl = await page.evaluate(() => { const c = document.querySelector('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); const d = g && g.getExtension('WEBGL_debug_renderer_info'); return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const frames = await page.evaluate(() => new Promise((res) => {
  const ts = []; let last = performance.now(); const end = last + 12000;
  const f = (t) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(ts); };
  requestAnimationFrame(f);
}));
const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const perFrame = (k) => (((m1[k] - m0[k]) * 1000) / frames.length).toFixed(2);
console.log('main-thread ms/frame: task', perFrame('TaskDuration'), 'script', perFrame('ScriptDuration'), 'layout', perFrame('LayoutDuration'));
frames.sort((a, b) => a - b);
const q = (p) => frames[Math.floor(frames.length * p)].toFixed(1);
const s = await st();
console.log(JSON.stringify({ gl, frames: frames.length, median: q(0.5), p95: q(0.95), max: frames.at(-1).toFixed(1), tick: s.data.tick, updateP95: s.data.updateMs, shares: s.data.shares }));
await page.screenshot({ path: `${out}/perf-${level}.png` });
await browser.close();
