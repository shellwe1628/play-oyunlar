// node store/tools/compose.mjs <slug> [--locale en-US|tr-TR]
// Frames each raw capture (store/<slug>/.raw/<locale>/NN-<id>.png) into a 1080×1920 store
// screenshot: the game's own backdrop, a caption in that locale on top, the gameplay below as a
// rounded card. Writes metadata/android/<locale>/images/phoneScreenshots/N.png (24-bit, no alpha).
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, locales } from './lib/config.mjs';
import { backdrop } from './lib/look.mjs';
import { LOCALES, rawDir, shotsDir, slugArg } from './lib/paths.mjs';
import { closeRenderer, fileUrl, FIT_SCRIPT, renderHtml } from './lib/render.mjs';

export const SHOT = { w: 1080, h: 1920, cardW: 864, cardH: 1536, cardY: 340 };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function captionCss(look) {
  return `
.cap{position:absolute;left:60px;right:60px;top:40px;height:${SHOT.cardY - 70}px;display:flex;align-items:center;justify-content:center}
.cap p{margin:0;width:100%;text-align:center;font-family:Nunito;font-weight:900;line-height:1.12;color:${look.text};
  -webkit-text-stroke:${look.stroke ?? 0}px ${look.ink};paint-order:stroke fill;letter-spacing:0.3px;
  text-shadow:0 6px 0 ${look.ink}55;overflow-wrap:normal;word-break:keep-all;hyphens:none}
.card{position:absolute;left:${(SHOT.w - SHOT.cardW) / 2}px;top:${SHOT.cardY}px;width:${SHOT.cardW}px;height:${SHOT.cardH}px;border-radius:46px;
  overflow:hidden;box-shadow:0 0 0 9px ${look.ink},0 0 0 13px ${look.frame ?? '#ffffff55'},0 24px 50px rgba(0,0,0,.45)}
.card img{width:100%;height:100%;display:block}
.bar{position:absolute;left:50%;top:${SHOT.cardY - 34}px;width:120px;height:10px;margin-left:-60px;border-radius:5px;background:${look.accent}}`;
}

export async function composeShot(look, raw, caption, out) {
  const body = `${backdrop(look, SHOT.w, SHOT.h, 11)}
<div class="cap"><p data-fit="78" data-min="52" data-lines="2">${esc(caption)}</p></div>
<div class="bar"></div>
<div class="card"><img src="${fileUrl(raw)}"></div>${FIT_SCRIPT}`;
  return renderHtml(body, { width: SHOT.w, height: SHOT.h, out, alpha: false, css: captionCss(look) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const slug = slugArg();
  const cfg = await loadConfig(slug);
  try {
    for (const locale of locales(LOCALES)) {
      const dir = rawDir(slug, locale);
      if (!existsSync(dir)) throw new Error(`no captures in ${dir}: run node store/tools/capture.mjs ${slug} first`);
      const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
      const outDir = shotsDir(slug, locale);
      rmSync(outDir, { recursive: true, force: true });
      mkdirSync(outDir, { recursive: true });
      let n = 0;
      for (const [i, shot] of cfg.shots.entries()) {
        const name = `${String(i + 1).padStart(2, '0')}-${shot.id}.png`;
        if (!files.includes(name)) throw new Error(`missing capture ${locale}/${name}`);
        n++;
        await composeShot(cfg.look, join(dir, name), shot.caption[locale], join(outDir, `${n}.png`));
        console.log(`[compose ${slug}] ${locale} ${n}.png ← ${name}  "${shot.caption[locale]}"`);
      }
    }
  } finally {
    await closeRenderer();
  }
}
