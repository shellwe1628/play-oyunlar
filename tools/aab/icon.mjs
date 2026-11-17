// Launcher icon for one game's Play build (tools/aab.mjs).
//
// Source, in this order:
//   1. store/<slug>/icon/ with a PNG whose name contains "foreground" (and optionally ones with
//      "background" and "monochrome"): adaptive icon layers, 108 dp canvases (square, >= 192 px,
//      ideally 432); without a background PNG the colour apps.json icon.background is the back
//      layer; the monochrome layer (themed icons, Android 13+) is used when present.
//   2. store/<slug>/icon/ with any other square PNG (the largest wins; e.g. the 512×512 Play
//      icon): the full icon fills the adaptive icon's visible 72 dp area on a background of
//      apps.json icon.background, and is the legacy (API 24-25) icon as is.
//   3. Nothing there: a generated fallback (ring and dot in apps.json icon.accent on
//      icon.background), vector for API 26+ with a themed (monochrome) layer, PNGs for 24-25.
// Only 8-bit non-interlaced PNGs are read (tools/aab/png.mjs); others fail the build with a
// message, they are never silently replaced by the fallback.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng, encodePng, inset, resize } from './png.mjs';

/** Legacy launcher icon size (48 dp) and adaptive layer size (108 dp) per density, in px. */
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/** Generated fallback: one even-odd path (ring + dot) in the 108×108 adaptive space. */
const RINGS = [
  [54, 54, 27],
  [54, 54, 17],
  [54, 54, 8],
];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

export function findIconSource(dir) {
  if (!existsSync(dir)) return { kind: 'generated', files: [] };
  const pngs = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.png')).sort();
  const fg = pngs.find((f) => /foreground/i.test(f));
  if (fg) {
    const bg = pngs.find((f) => /background/i.test(f));
    const mono = pngs.find((f) => /monochrome/i.test(f));
    return {
      kind: 'adaptive',
      foreground: join(dir, fg),
      background: bg ? join(dir, bg) : null,
      monochrome: mono ? join(dir, mono) : null,
      files: [fg, bg, mono].filter(Boolean),
    };
  }
  let best = null;
  for (const f of pngs.filter((p) => !/background|monochrome/i.test(p))) {
    const img = decodePng(readFileSync(join(dir, f)), f);
    if (img.width !== img.height) continue;
    if (!best || img.width > best.img.width) best = { file: f, img };
  }
  if (best) return { kind: 'full', full: join(dir, best.file), files: [best.file] };
  return { kind: 'generated', files: [] };
}

function load(path) {
  const img = decodePng(readFileSync(path), path);
  if (img.width !== img.height) throw new Error(`${path}: icon images must be square (this one is ${img.width}×${img.height})`);
  if (img.width < 192) throw new Error(`${path}: ${img.width} px is too small for a launcher icon (need >= 192, ideally 432 or 512)`);
  return img;
}

function solid(size, colour) {
  const [r, g, b] = hex(colour);
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) rgba.set([r, g, b, 255], i * 4);
  return { width: size, height: size, rgba };
}

/** `top` over `bottom` (same size, straight alpha). */
function over(top, bottom) {
  const out = new Uint8Array(top.rgba.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = top.rgba[i + 3] / 255;
    const b = bottom.rgba[i + 3] / 255;
    const oa = a + b * (1 - a);
    for (let k = 0; k < 3; k++) out[i + k] = oa ? Math.round((top.rgba[i + k] * a + bottom.rgba[i + k] * b * (1 - a)) / oa) : 0;
    out[i + 3] = Math.round(oa * 255);
  }
  return { width: top.width, height: top.height, rgba: out };
}

/** Central 72/108 of an adaptive 108 dp composite = what a legacy icon shows. */
function crop72(img) {
  const s = img.width;
  const c = Math.round((s * 72) / 108);
  const o = Math.round((s - c) / 2);
  const rgba = new Uint8Array(c * c * 4);
  for (let y = 0; y < c; y++) rgba.set(img.rgba.subarray(((y + o) * s + o) * 4, ((y + o) * s + o + c) * 4), y * c * 4);
  return { width: c, height: c, rgba };
}

/** Round legacy icon: circle mask with a 1 px soft edge. */
function circle(img) {
  const s = img.width;
  const rgba = Uint8Array.from(img.rgba);
  const r = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r);
      const k = Math.max(0, Math.min(1, r - d));
      rgba[(y * s + x) * 4 + 3] = Math.round(rgba[(y * s + x) * 4 + 3] * k);
    }
  }
  return { width: s, height: s, rgba };
}

function ringPathData() {
  return RINGS.map(([cx, cy, r]) => `M${cx - r},${cy}a${r},${r} 0,1 1,${2 * r},0a${r},${r} 0,1 1,-${2 * r},0z`).join('');
}

function generatedVector(colour) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="108dp" android:height="108dp"',
    '    android:viewportWidth="108" android:viewportHeight="108">',
    `    <path android:fillColor="${colour}" android:fillType="evenOdd" android:pathData="${ringPathData()}"/>`,
    '</vector>',
    '',
  ].join('\n');
}

/** Rasterise the generated fallback (adaptive composite, `size` px for 108 dp), 4×4 supersampled. */
function generatedRaster(size, bg, accent) {
  const S = 4;
  const [br, bgc, bb] = hex(bg);
  const [ar, ag, ab] = hex(accent);
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = ((x + (sx + 0.5) / S) * 108) / size;
          const v = ((y + (sy + 0.5) / S) * 108) / size;
          const inside = RINGS.filter(([cx, cy, r]) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r).length;
          if (inside % 2 === 1) hits++;
        }
      }
      const k = hits / (S * S);
      rgba.set([Math.round(br + (ar - br) * k), Math.round(bgc + (ag - bgc) * k), Math.round(bb + (ab - bb) * k), 255], (y * size + x) * 4);
    }
  }
  return { width: size, height: size, rgba };
}

const adaptiveXml = (fg, bg, mono) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">',
    `    <background android:drawable="${bg}"/>`,
    `    <foreground android:drawable="${fg}"/>`,
    ...(mono ? [`    <monochrome android:drawable="${mono}"/>`] : []),
    '</adaptive-icon>',
    '',
  ].join('\n');

/**
 * Write every launcher-icon resource into `res` (an android/app/src/main/res folder), replacing
 * Capacitor's defaults. Returns a one-line description for the build log.
 */
export function writeIcon(res, source, colours) {
  const { background, accent } = colours;
  // Remove Capacitor's template icons so only ours ship.
  for (const dir of readdirSync(res).filter((d) => d.startsWith('mipmap'))) {
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'ic_launcher_background.png']) rmSync(join(res, dir, f), { force: true });
  }
  rmSync(join(res, 'drawable', 'ic_launcher_background.xml'), { force: true });
  rmSync(join(res, 'drawable-v24', 'ic_launcher_foreground.xml'), { force: true });
  writeFileSync(join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${background}</color>\n</resources>\n`);
  mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });

  let composite; // 432 px adaptive composite (fg over bg), source of the legacy PNGs
  const perDensity = (name, img) => {
    for (const [d, k] of Object.entries(DENSITIES)) {
      const dir = join(res, `mipmap-${d}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${name}.png`), encodePng(resize(img, Math.round(108 * k), Math.round(108 * k))));
    }
  };

  if (source.kind === 'generated') {
    mkdirSync(join(res, 'drawable-v24'), { recursive: true });
    writeFileSync(join(res, 'drawable-v24', 'ic_launcher_foreground.xml'), generatedVector(accent));
    const xml = adaptiveXml('@drawable/ic_launcher_foreground', '@color/ic_launcher_background', '@drawable/ic_launcher_foreground');
    for (const n of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(join(res, 'mipmap-anydpi-v26', n), xml);
    composite = generatedRaster(432, background, accent);
  } else {
    let fg;
    let bg;
    let mono = null;
    if (source.kind === 'adaptive') {
      fg = resize(load(source.foreground), 432, 432);
      bg = source.background ? resize(load(source.background), 432, 432) : null;
      mono = source.monochrome ? resize(load(source.monochrome), 432, 432) : null;
    } else {
      fg = inset(load(source.full), 432, 288); // 72 of 108 dp
      bg = null;
    }
    perDensity('ic_launcher_foreground', fg);
    if (bg) perDensity('ic_launcher_background', bg);
    if (mono) perDensity('ic_launcher_monochrome', mono);
    const xml = adaptiveXml('@mipmap/ic_launcher_foreground', bg ? '@mipmap/ic_launcher_background' : '@color/ic_launcher_background', mono ? '@mipmap/ic_launcher_monochrome' : null);
    for (const n of ['ic_launcher.xml', 'ic_launcher_round.xml']) writeFileSync(join(res, 'mipmap-anydpi-v26', n), xml);
    composite = over(fg, bg ?? solid(432, background));
  }

  // Legacy icons (API 24-25): 48 dp; a full icon is used as is, layers are cropped to 72 dp.
  const legacy = source.kind === 'full' ? load(source.full) : crop72(composite);
  for (const [d, k] of Object.entries(DENSITIES)) {
    const dir = join(res, `mipmap-${d}`);
    mkdirSync(dir, { recursive: true });
    const img = resize(legacy, 48 * k, 48 * k);
    writeFileSync(join(dir, 'ic_launcher.png'), encodePng(img));
    writeFileSync(join(dir, 'ic_launcher_round.png'), encodePng(circle(img)));
  }
  return source.kind === 'generated' ? 'generated fallback (no PNG in store/<slug>/icon/)' : `${source.kind} from store/<slug>/icon/${source.files.join(' + ')}`;
}
