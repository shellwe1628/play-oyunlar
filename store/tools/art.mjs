// node store/tools/art.mjs <slug> [--locale en-US|tr-TR] [--only icon|feature]
// Draws the icon set (Play icon, adaptive launcher layers, legacy icon, SVG sources) into
// store/<slug>/icon/ + metadata/.../images/icon.png, and the 1024×500 feature graphic per locale
// from the game's backdrop, its name and crops of the real captures in store/<slug>/.raw/.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flag, loadConfig, locales } from './lib/config.mjs';
import { iconSvgs } from './lib/icons.mjs';
import { backdrop } from './lib/look.mjs';
import { encodePng, resize } from './lib/png.mjs';
import { iconDir, imagesDir, LOCALES, rawDir, slugArg, tmp } from './lib/paths.mjs';
import { closeRenderer, fileUrl, FIT_SCRIPT, renderHtml } from './lib/render.mjs';

const slug = slugArg();
const cfg = await loadConfig(slug);
const only = flag('only');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function icons() {
  const dir = iconDir(slug);
  mkdirSync(dir, { recursive: true });
  const svgs = iconSvgs(cfg.icon);
  const files = {
    play: ['icon.svg', 'icon-512.png', 512, false],
    background: ['ic_launcher_background.svg', 'ic_launcher_background.png', 432, false],
    foreground: ['ic_launcher_foreground.svg', 'ic_launcher_foreground.png', 432, true],
    monochrome: ['ic_launcher_monochrome.svg', 'ic_launcher_monochrome.png', 432, true],
    legacy: ['ic_launcher_legacy.svg', 'ic_launcher_legacy-512.png', 512, true],
  };
  const out = {};
  for (const [k, [svgName, pngName, size, transparent]] of Object.entries(files)) {
    writeFileSync(join(dir, svgName), svgs[k] + '\n');
    out[k] = await renderHtml(svgs[k], { width: size, height: size, out: join(dir, pngName), alpha: true, transparent });
    console.log(`[art ${slug}] icon/${pngName}`);
  }
  for (const locale of LOCALES) {
    mkdirSync(imagesDir(slug, locale), { recursive: true });
    writeFileSync(join(imagesDir(slug, locale), 'icon.png'), encodePng(out.play, { alpha: true }));
  }
  // review aids (not shipped): how the icon reads at launcher and list sizes
  const preview = tmp('preview', slug);
  mkdirSync(preview, { recursive: true });
  for (const s of [192, 96, 48]) writeFileSync(join(preview, `icon-${s}.png`), encodePng(resize(out.play, s, s)));
  console.log(`[art ${slug}] previews in ${preview}`);
}

async function feature(locale) {
  const raw = rawDir(slug, locale);
  if (!existsSync(raw)) throw new Error(`no captures for ${locale}: run capture.mjs first`);
  const files = readdirSync(raw);
  const look = cfg.look;
  const W = 1024;
  const H = 500;
  const cards = cfg.feature.cards.map(([id, x, y, w, h], i) => {
    const idx = cfg.shots.findIndex((s) => s.id === id);
    const file = `${String(idx + 1).padStart(2, '0')}-${id}.png`;
    if (!files.includes(file)) throw new Error(`feature: missing capture ${locale}/${file}`);
    const cw = 212;
    const ch = Math.round((cw * h) / w);
    const s = cw / w;
    const pos = [
      { left: 566, top: (H - ch) / 2 + 8, rot: -7 },
      { left: 770, top: (H - ch) / 2 - 6, rot: 5 },
    ][i];
    return `<div class="fc" style="left:${pos.left}px;top:${pos.top}px;width:${cw}px;height:${ch}px;transform:rotate(${pos.rot}deg);
      background-image:url('${fileUrl(join(raw, file))}');background-size:${720 * s}px ${1280 * s}px;background-position:${-x * s}px ${-y * s}px"></div>`;
  });
  const css = `
.t{position:absolute;left:58px;width:440px;top:70px;height:240px;display:flex;align-items:flex-end}
.t p{margin:0;width:100%;font-family:Nunito;font-weight:900;line-height:1.0;color:#fff;-webkit-text-stroke:16px ${look.ink};paint-order:stroke fill;
  text-shadow:0 8px 0 ${look.ink}66;letter-spacing:-1px}
.bar{position:absolute;left:62px;top:330px;width:90px;height:10px;border-radius:5px;background:${look.accent}}
.s{position:absolute;left:58px;width:400px;top:356px;height:80px}
.s p{margin:0;font-family:Nunito;font-weight:800;line-height:1.15;color:#fff;-webkit-text-stroke:8px ${look.ink};paint-order:stroke fill}
.fc{position:absolute;border-radius:26px;box-shadow:0 0 0 6px ${look.ink},0 0 0 9px ${look.frame ?? '#ffffff66'},0 16px 30px rgba(0,0,0,.45)}`;
  const body = `${backdrop(look, W, H, 5)}
<div class="t"><p data-fit="108" data-min="60" data-lines="2">${esc(cfg.name[locale])}</p></div>
<div class="bar"></div>
<div class="s"><p data-fit="34" data-min="24" data-lines="2">${esc(cfg.feature.tagline[locale])}</p></div>
${cards.join('\n')}${FIT_SCRIPT}`;
  const out = join(imagesDir(slug, locale), 'featureGraphic.png');
  mkdirSync(imagesDir(slug, locale), { recursive: true });
  await renderHtml(body, { width: W, height: H, out, alpha: false, css });
  console.log(`[art ${slug}] ${locale} featureGraphic.png`);
}

try {
  if (!only || only === 'icon') await icons();
  if (!only || only === 'feature') for (const locale of locales(LOCALES)) await feature(locale);
} finally {
  await closeRenderer();
}
