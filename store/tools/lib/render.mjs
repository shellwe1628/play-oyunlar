// Renders an HTML/SVG composition to an exact-size PNG with Chromium, then re-encodes it with
// lib/png.mjs: 24-bit RGB (no alpha channel) or 32-bit RGBA, as Play wants per asset.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './browser.mjs';
import { decodePng, encodePng } from './png.mjs';
import { FONT_DIR, tmp } from './paths.mjs';

export const FONT_CSS = ['latin', 'latin-ext']
  .flatMap((sub) =>
    [800, 900].map(
      (wt) =>
        `@font-face{font-family:'Nunito';font-weight:${wt};font-style:normal;src:url('${pathToFileURL(join(FONT_DIR, `nunito-${sub}-${wt}-normal.woff2`)).href}') format('woff2');unicode-range:${sub === 'latin' ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' : 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'};}`,
    ),
  )
  .join('\n');

export const fileUrl = (p) => pathToFileURL(p).href;

let browserP = null;
export function renderer() {
  browserP ??= launch();
  return browserP;
}
export async function closeRenderer() {
  if (browserP) await (await browserP).close();
  browserP = null;
}

let n = 0;
/**
 * body: HTML for <body>. Returns the RGBA image; writes `out` when given.
 * transparent: page background transparent (for icon layers).
 */
export async function renderHtml(body, { width, height, out, alpha = false, transparent = false, css = '' }) {
  const browser = await renderer();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const file = tmp('render', `${process.pid}-${n++}.html`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden;background:${transparent ? 'transparent' : '#000'}}
*{box-sizing:border-box}
${css}</style></head><body>${body}</body></html>`,
  );
  await page.goto(fileUrl(file));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
    // let page scripts (text fitting) finish
    if (window.__fit) window.__fit();
  });
  const fontsOk = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.weight));
  const shot = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
  await page.close();
  const img = decodePng(shot);
  if (img.width !== width || img.height !== height) throw new Error(`render size ${img.width}×${img.height} ≠ ${width}×${height}`);
  if (!fontsOk.length && /font-family/.test(css + body)) throw new Error('Nunito did not load');
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, encodePng(img, { alpha }));
  }
  return img;
}

/** Script that shrinks every [data-fit] element's font until it fits its box (max lines). */
export const FIT_SCRIPT = `<script>
window.__fit = () => {
  for (const el of document.querySelectorAll('[data-fit]')) {
    const maxLines = Number(el.dataset.lines || 2);
    let size = Number(el.dataset.fit);
    const min = Number(el.dataset.min || 24);
    for (;;) {
      el.style.fontSize = size + 'px';
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      const lines = Math.round(el.scrollHeight / lh);
      const tooWide = el.scrollWidth > el.clientWidth + 1;
      if ((lines <= maxLines && !tooWide) || size <= min) break;
      size -= 2;
    }
    el.dataset.size = size;
  }
};
</script>`;
