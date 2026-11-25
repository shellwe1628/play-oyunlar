// node store/tools/appstore.mjs <slug> [--only icon|shots]
// Apple App Store art for one game, from the same sources as the Play listing:
//   store/<slug>/appstore/icon-1024.png      1024×1024, 24-bit, no alpha (App Store icon; Xcode's
//                                            single-size AppIcon, tools/ipa.mjs)
//   store/<slug>/appstore/splash-2732.png    2732×2732 launch image: the icon on the game's colour
//   store/<slug>/appstore/screenshots/<locale>/N.png
//                                            1320×2868 (iPhone 6.9″, the one size App Store
//                                            Connect requires; it scales them for smaller phones),
//                                            framed like the Play shots: the game's backdrop, the
//                                            caption in that language, the real capture as a card.
// Captures come from store/<slug>/.raw/<locale>/ (store/tools/capture.mjs); captions and the shot
// list from listing.config.mjs, the same as Play. App Store locales: en-US and tr.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { captionCss } from './compose.mjs';
import { flag, loadConfig } from './lib/config.mjs';
import { iconSvgs } from './lib/icons.mjs';
import { backdrop } from './lib/look.mjs';
import { iconDir, rawDir, slugArg, storeDir } from './lib/paths.mjs';
import { closeRenderer, fileUrl, FIT_SCRIPT, renderHtml } from './lib/render.mjs';

export const IOS_SHOT = { w: 1320, h: 2868, cardW: 1080, cardH: 1920, cardY: 640 };
/** Play locale → App Store Connect locale code (Turkish is plain "tr" there). */
export const ASC_LOCALE = { 'en-US': 'en-US', 'tr-TR': 'tr' };

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const captionHtml = (s) => esc(s).replace(/\S*-\S*/g, (w) => `<span style="white-space:nowrap">${w}</span>`);

const slug = slugArg();
const cfg = await loadConfig(slug);
const only = flag('only');
const out = join(storeDir(slug), 'appstore');

async function icon() {
  mkdirSync(out, { recursive: true });
  // the Play icon's SVG (512 viewBox), drawn at 1024: same art, full-bleed square, opaque
  const svg = iconSvgs(cfg.icon).play.replace(/<svg([^>]*)>/, (m, a) => `<svg${a.replace(/\swidth="[^"]*"|\sheight="[^"]*"/g, '')} width="1024" height="1024">`);
  await renderHtml(svg, { width: 1024, height: 1024, out: join(out, 'icon-1024.png'), alpha: false });
  console.log(`[appstore ${slug}] icon-1024.png`);
  // launch image: the game's dark colour, the icon in the middle at a modest size
  const bg = cfg.icon.bg[1];
  await renderHtml(`<div style="position:absolute;inset:0;background:${bg}"></div><img src="${fileUrl(join(out, 'icon-1024.png'))}" style="position:absolute;left:${2732 / 2 - 260}px;top:${2732 / 2 - 260}px;width:520px;height:520px;border-radius:116px">`, {
    width: 2732,
    height: 2732,
    out: join(out, 'splash-2732.png'),
    alpha: false,
  });
  console.log(`[appstore ${slug}] splash-2732.png`);
}

function css(look) {
  // the Play frame's look, sized for the 6.9″ canvas
  const s = IOS_SHOT;
  return `${captionCss(look)}
.cap{top:150px;height:${s.cardY - 230}px;left:80px;right:80px}
.card{left:${(s.w - s.cardW) / 2}px;top:${s.cardY}px;width:${s.cardW}px;height:${s.cardH}px;border-radius:64px}
.bar{top:${s.cardY - 48}px;width:150px;margin-left:-75px;height:12px;border-radius:6px}`;
}

async function shots() {
  for (const [locale, asc] of Object.entries(ASC_LOCALE)) {
    const dir = rawDir(slug, locale);
    if (!existsSync(dir)) throw new Error(`no captures in ${dir}: run node store/tools/capture.mjs ${slug} first`);
    const files = readdirSync(dir).filter((f) => f.endsWith('.png'));
    const dest = join(out, 'screenshots', asc);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const [i, shot] of cfg.shots.entries()) {
      const name = `${String(i + 1).padStart(2, '0')}-${shot.id}.png`;
      if (!files.includes(name)) throw new Error(`missing capture ${locale}/${name}`);
      n++;
      const body = `${backdrop(cfg.look, IOS_SHOT.w, IOS_SHOT.h, 11)}
<div class="cap"><p data-fit="104" data-min="68" data-lines="2">${captionHtml(shot.caption[locale])}</p></div>
<div class="bar"></div>
<div class="card"><img src="${fileUrl(join(dir, name))}"></div>${FIT_SCRIPT}`;
      await renderHtml(body, { width: IOS_SHOT.w, height: IOS_SHOT.h, out: join(dest, `${n}.png`), alpha: false, css: css(cfg.look) });
      console.log(`[appstore ${slug}] screenshots/${asc}/${n}.png ← ${name}`);
    }
  }
}

try {
  if (!existsSync(iconDir(slug))) throw new Error(`run node store/tools/art.mjs ${slug} first`);
  if (!only || only === 'icon') await icon();
  if (!only || only === 'shots') await shots();
} finally {
  await closeRenderer();
}
