/* global window, performance, requestAnimationFrame */
import { chromium } from '@playwright/test';
const [url, secs = '5'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
await page.goto(url);
await page.waitForFunction(() => window.__OYUN__?.ready === true);
await page.waitForTimeout(1000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const m0 = await get();
const frames = await page.evaluate((s) => new Promise((res) => { const ts = []; let last = performance.now(); const end = last + s * 1000; const f = (t) => { ts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }), Number(secs));
const m1 = await get();
frames.sort((a, b) => a - b);
const pf = (k) => (((m1[k] - m0[k]) * 1000) / frames.length).toFixed(2);
console.log(url, 'frames', frames.length, 'median', frames[frames.length >> 1].toFixed(1), 'task/frame', pf('TaskDuration'), 'script/frame', pf('ScriptDuration'));
await browser.close();
