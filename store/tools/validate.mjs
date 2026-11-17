// node store/tools/validate.mjs <slug> [--text]
// Checks every Google Play listing requirement known for store/<slug> (fastlane layout) and the
// adaptive icon sources, prints a table and exits 1 on any failure. --text: text checks only.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { alphaStats, decodePng, pngInfo } from './lib/png.mjs';
import { iconDir, imagesDir, LOCALES, metaDir, shotsDir, slugArg } from './lib/paths.mjs';

const slug = slugArg();
const textOnly = process.argv.includes('--text');
const rows = [];
const add = (check, where, value, limit, ok) => rows.push({ check, where, value: String(value), limit: String(limit), ok });
const KB = 1024;
const MB = 1024 * 1024;

// ---- texts
const TEXT = [
  ['title.txt', 30],
  ['short_description.txt', 80],
  ['full_description.txt', 4000],
  ['changelogs/default.txt', 500],
];
// ranking, price and award claims Play rejects (the games' own "best wave" is a game term, allowed)
const CLAIMS = /(#\s?1\b|number one|\bno\.\s?1\b|\btop[- ]?(rated|game|ranked)\b|\bfree\b|ücretsiz|bedava|\bbest (game|app|puzzle|archery|clicker)|en iyi oyun|\baward|ödül(lü)? (kazanan|alan)|\bdownload now\b|şimdi indir|\b(sale|discount|indirim)\b)/i;
const EMOJI = /\p{Extended_Pictographic}/u;
for (const locale of LOCALES) {
  for (const [file, max] of TEXT) {
    const p = join(metaDir(slug, locale), file);
    if (!existsSync(p)) {
      add(`text ${file}`, locale, 'missing', `≤ ${max} chars`, false);
      continue;
    }
    const raw = readFileSync(p, 'utf8');
    const s = raw.replace(/\n+$/, '');
    const len = [...s].length;
    add(`text ${file}`, locale, `${len} chars`, `1–${max}`, len > 0 && len <= max);
    const claim = s.match(CLAIMS);
    add(`no ranking/price/award claim ${file}`, locale, claim ? `"${claim[0]}"` : 'none', 'none', !claim);
    if (file !== 'full_description.txt') {
      add(`no emoji, no ALL CAPS ${file}`, locale, EMOJI.test(s) || /\b[A-ZÇĞİÖŞÜ]{4,}\b/.test(s) ? 'found' : 'clean', 'clean', !EMOJI.test(s) && !/\b[A-ZÇĞİÖŞÜ]{4,}\b/.test(s));
    }
    if (/�/.test(s)) add(`valid UTF-8 ${file}`, locale, 'replacement char', 'clean', false);
  }
  if (locale === 'tr-TR') {
    const all = TEXT.map(([f]) => join(metaDir(slug, locale), f)).filter(existsSync).map((p) => readFileSync(p, 'utf8')).join(' ');
    const marks = ['ş', 'ğ', 'ı', 'ö', 'ü', 'ç'].filter((c) => all.includes(c));
    add('Turkish letters present (not ASCII-folded)', locale, marks.join(''), 'ş ğ ı ö ü ç', marks.length >= 5);
  }
}

// ---- images
function png(p) {
  const buf = readFileSync(p);
  const info = pngInfo(buf);
  return { buf, info, size: statSync(p).size };
}

if (!textOnly) {
  for (const locale of LOCALES) {
    const img = imagesDir(slug, locale);
    // icon: 512×512, 32-bit PNG (RGBA), ≤ 1024 KB; fully opaque so no launcher shows holes
    const ip = join(img, 'icon.png');
    if (!existsSync(ip)) add('icon.png', locale, 'missing', '512×512', false);
    else {
      const { buf, info, size } = png(ip);
      add('icon.png size', locale, `${info.width}×${info.height}`, '512×512', info.width === 512 && info.height === 512);
      add('icon.png format', locale, `PNG ${info.bitsPerPixel}-bit`, 'PNG 32-bit RGBA', info.colorType === 6 && info.bitDepth === 8);
      add('icon.png file size', locale, `${Math.round(size / KB)} KB`, '≤ 1024 KB', size <= 1024 * KB);
      const a = alphaStats(decodePng(buf));
      add('icon.png alpha', locale, a.opaque === a.n ? 'fully opaque' : `${a.n - a.opaque} non-opaque px`, 'fully opaque', a.opaque === a.n);
    }
    // feature graphic: exactly 1024×500, JPEG or 24-bit PNG (no alpha), ≤ 15 MB
    const fp = join(img, 'featureGraphic.png');
    if (!existsSync(fp)) add('featureGraphic.png', locale, 'missing', '1024×500', false);
    else {
      const { info, size } = png(fp);
      add('featureGraphic size', locale, `${info.width}×${info.height}`, '1024×500', info.width === 1024 && info.height === 500);
      add('featureGraphic format', locale, `PNG ${info.bitsPerPixel}-bit${info.hasAlphaChannel ? ' +alpha' : ''}`, 'PNG 24-bit, no alpha', info.colorType === 2 && info.bitDepth === 8 && !info.hasAlphaChannel);
      add('featureGraphic file size', locale, `${(size / MB).toFixed(2)} MB`, '≤ 15 MB', size <= 15 * MB);
    }
    // phone screenshots: 2–8 per Play (this listing: 6–8), JPEG or 24-bit PNG, 320–3840 px per
    // side, long side ≤ 2× short side, ≤ 8 MB each; we ship 1080×1920 portrait
    const sd = shotsDir(slug, locale);
    const shots = existsSync(sd) ? readdirSync(sd).filter((f) => /\.(png|jpe?g)$/i.test(f)) : [];
    const names = shots.map((f) => Number(f.split('.')[0])).sort((x, y) => x - y);
    const consecutive = names.every((v, i) => v === i + 1);
    add('phoneScreenshots count', locale, shots.length, '6–8 (Play: 2–8), named 1..N', shots.length >= 6 && shots.length <= 8 && consecutive);
    let worst = { dims: true, fmt: true, size: 0, ratio: true };
    for (const f of shots) {
      const { info, size } = png(join(sd, f));
      if (info.width !== 1080 || info.height !== 1920) worst.dims = `${f}: ${info.width}×${info.height}`;
      const lo = Math.min(info.width, info.height);
      const hi = Math.max(info.width, info.height);
      if (lo < 320 || hi > 3840 || hi > 2 * lo) worst.ratio = `${f}`;
      if (info.colorType !== 2 || info.hasAlphaChannel || info.bitDepth !== 8) worst.fmt = `${f}: ${info.bitsPerPixel}-bit`;
      worst.size = Math.max(worst.size, size);
    }
    if (shots.length) {
      add('phoneScreenshots size', locale, worst.dims === true ? '1080×1920 all' : worst.dims, '1080×1920 portrait', worst.dims === true);
      add('phoneScreenshots sides/ratio', locale, worst.ratio === true ? '1080–1920, 1.78:1' : worst.ratio, '320–3840 px, ≤ 2:1', worst.ratio === true);
      add('phoneScreenshots format', locale, worst.fmt === true ? 'PNG 24-bit all' : worst.fmt, 'PNG 24-bit, no alpha', worst.fmt === true);
      add('phoneScreenshots largest file', locale, `${(worst.size / MB).toFixed(2)} MB`, '≤ 8 MB', worst.size <= 8 * MB);
    }
  }
  // both locales: same number of screenshots (same story in each language)
  const counts = LOCALES.map((l) => (existsSync(shotsDir(slug, l)) ? readdirSync(shotsDir(slug, l)).length : 0));
  add('screenshot count equal across locales', 'all', counts.join(' / '), 'equal', counts.every((c) => c === counts[0]));

  // ---- launcher icon sources (store/<slug>/icon/)
  const id = iconDir(slug);
  const need = [
    ['icon-512.png', 512, 'opaque'],
    ['ic_launcher_background.png', 432, 'opaque'],
    ['ic_launcher_foreground.png', 432, 'safe'],
    ['ic_launcher_monochrome.png', 432, 'safe'],
    ['ic_launcher_legacy-512.png', 512, 'any'],
  ];
  for (const [f, size, rule] of need) {
    const p = join(id, f);
    if (!existsSync(p)) {
      add(`icon/${f}`, 'icon', 'missing', `${size}×${size}`, false);
      continue;
    }
    const { buf, info } = png(p);
    add(`icon/${f}`, 'icon', `${info.width}×${info.height} ${info.bitsPerPixel}-bit`, `${size}×${size} RGBA`, info.width === size && info.height === size && info.colorType === 6);
    const img = decodePng(buf);
    if (rule === 'opaque') {
      const a = alphaStats(img);
      add(`icon/${f} opaque`, 'icon', a.opaque === a.n ? 'yes' : `${a.n - a.opaque} px not`, 'fully opaque', a.opaque === a.n);
    }
    if (rule === 'safe') {
      // adaptive icon: everything visible must sit inside the 66 dp safe circle (r = 132 px of
      // 432); 2 px of anti-aliasing allowed
      let outside = 0;
      let inside = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const a = img.data[(y * size + x) * 4 + 3];
          if (!a) continue;
          if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > 134) outside++;
          else inside++;
        }
      add(`icon/${f} safe zone`, 'icon', `${outside} px outside r132`, '0 px outside, content inside', outside === 0 && inside > 1000);
    }
  }
  for (const f of ['icon.svg', 'ic_launcher_foreground.svg', 'ic_launcher_background.svg', 'ic_launcher_monochrome.svg', 'README.md']) {
    add(`icon/${f}`, 'icon', existsSync(join(id, f)) ? 'present' : 'missing', 'present', existsSync(join(id, f)));
  }
}

// ---- table
const head = ['check', 'locale', 'value', 'limit', 'ok'];
const data = rows.map((r) => [r.check, r.where, r.value, r.limit, r.ok ? 'PASS' : 'FAIL']);
const widths = head.map((h, i) => Math.max(h.length, ...data.map((d) => [...d[i]].length)));
const line = (cells) => '| ' + cells.map((c, i) => c + ' '.repeat(widths[i] - [...c].length)).join(' | ') + ' |';
console.log(`\nPlay listing validation: ${slug}\n`);
console.log(line(head));
console.log('|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|');
for (const d of data) console.log(line(d));
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} checks passed.`);
if (failed.length) {
  console.error(`\nFAILED (${failed.length}):\n- ${failed.map((r) => `${r.check} [${r.where}]: ${r.value} (limit ${r.limit})`).join('\n- ')}`);
  process.exit(1);
}
