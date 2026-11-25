// node store/tools/appstore-validate.mjs <slug>
// Checks the App Store Connect listing of one game before it is uploaded (fastlane `deliver`
// layout): store/<slug>/appstore/metadata/ texts (lengths, keywords, forbidden platform names,
// claims, placeholders, URLs, categories), the screenshots (store/<slug>/appstore/screenshots/
// <locale>/, 3–10 PNGs of 1320×2868 without alpha) and icon-1024.png (1024×1024, no alpha).
// Prints a table and exits 1 on any failure. Guide: docs/production/app-store.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngInfo } from './lib/png.mjs';
import { slugArg, STORE } from './lib/paths.mjs';

const slug = slugArg();
const cfg = JSON.parse(readFileSync(join(STORE, 'apps.json'), 'utf8'));
const app = cfg.apps.find((a) => a.slug === slug);
if (!app) {
  console.error(`appstore-validate: no app "${slug}" in store/apps.json`);
  process.exit(2);
}
const AS = join(STORE, slug, 'appstore');
const META = join(AS, 'metadata');
/** App Store Connect locale codes (Turkish is plain "tr" there). */
const LOCALES = ['en-US', 'tr'];
const SHOT = { w: 1320, h: 2868, min: 3, max: 10 };

const rows = [];
const add = (check, where, value, limit, ok) => rows.push({ check, where, value: String(value), limit: String(limit), ok: Boolean(ok) });
const len = (s) => [...s].length;
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/\s+$/, '') : null);

// Other platforms and stores must not be named (Guideline 2.3.10); "Google" alone too.
const FORBIDDEN = /\b(android|google|play store|google play|play games|galaxy store|huawei|appgallery|amazon appstore|windows phone)\b/i;
// ranking, price and award claims (game terms such as "best wave" stay allowed)
const CLAIMS = /(#\s?1\b|number one|\bno\.\s?1\b|\btop[- ]?(rated|game|ranked|app)\b|\bbest (game|app|puzzle|archery|clicker|arcade|idle)\b|en iyi (oyun|uygulama)|\bfree\b|ücretsiz|bedava|[$€£₺]\s?\d|\d\s?(tl|usd|eur)\b|\baward|ödül(lü)? (kazanan|alan)|\bdownload now\b|şimdi indir|\b(sale|discount|indirim)\b)/i;
const PLACEHOLDER = /(lorem|ipsum|\btodo\b|\btbd\b|\bxxx\b|placeholder|\{\{|\}\}|<[a-z]|\[(name|app|game)\])/i;
const EMOJI = /\p{Extended_Pictographic}/u;
const GAME_SUBS = new Set(['GAMES_ACTION', 'GAMES_ADVENTURE', 'GAMES_BOARD', 'GAMES_CARD', 'GAMES_CASINO', 'GAMES_CASUAL', 'GAMES_FAMILY', 'GAMES_MUSIC', 'GAMES_PUZZLE', 'GAMES_RACING', 'GAMES_ROLE_PLAYING', 'GAMES_SIMULATION', 'GAMES_SPORTS', 'GAMES_STRATEGY', 'GAMES_TRIVIA', 'GAMES_WORD']);
const CATEGORIES = new Set(['BOOKS', 'BUSINESS', 'DEVELOPER_TOOLS', 'EDUCATION', 'ENTERTAINMENT', 'FINANCE', 'FOOD_AND_DRINK', 'GAMES', 'GRAPHICS_AND_DESIGN', 'HEALTH_AND_FITNESS', 'LIFESTYLE', 'MAGAZINES_AND_NEWSPAPERS', 'MEDICAL', 'MUSIC', 'NAVIGATION', 'NEWS', 'PHOTO_AND_VIDEO', 'PRODUCTIVITY', 'REFERENCE', 'SHOPPING', 'SOCIAL_NETWORKING', 'SPORTS', 'STICKERS', 'TRAVEL', 'UTILITIES', 'WEATHER']);

const TEXT = [
  // file, min, max, plain (no emoji / line breaks)
  ['name.txt', 2, 30, true],
  ['subtitle.txt', 1, 30, true],
  ['keywords.txt', 1, 100, true],
  ['promotional_text.txt', 1, 170, false],
  ['description.txt', 200, 4000, false],
  ['release_notes.txt', 1, 4000, false],
];
const words = (s) => s.toLocaleLowerCase('tr').split(/[^\p{L}\p{N}]+/u).filter(Boolean);

for (const locale of LOCALES) {
  const dir = join(META, locale);
  const texts = {};
  for (const [file, min, max, plain] of TEXT) {
    const s = read(join(dir, file));
    if (s === null) {
      add(`text ${file}`, locale, 'missing', `${min}–${max} chars`, false);
      continue;
    }
    texts[file] = s;
    add(`text ${file}`, locale, `${len(s)} chars`, `${min}–${max}`, len(s) >= min && len(s) <= max);
    const bad = s.match(FORBIDDEN);
    add(`no other platform ${file}`, locale, bad ? `"${bad[0]}"` : 'none', 'none', !bad);
    const claim = s.match(CLAIMS);
    add(`no claim/price ${file}`, locale, claim ? `"${claim[0]}"` : 'none', 'none', !claim);
    const ph = s.match(PLACEHOLDER);
    add(`no placeholder ${file}`, locale, ph ? `"${ph[0]}"` : 'none', 'none', !ph);
    if (plain) add(`one line, no emoji ${file}`, locale, /\n/.test(s) || EMOJI.test(s) ? 'found' : 'clean', 'clean', !/\n/.test(s) && !EMOJI.test(s));
  }

  // keywords: comma-separated, no space around commas, no empty or repeated entries, no word
  // that is already in the name (Apple indexes the name anyway)
  const kw = texts['keywords.txt'];
  if (kw !== undefined) {
    const parts = kw.split(',');
    add('keywords: no space around commas', locale, /\s,|,\s/.test(kw) ? 'found' : 'none', 'none', !/\s,|,\s/.test(kw));
    add('keywords: no empty entry', locale, parts.some((p) => !p.trim()) ? 'found' : `${parts.length} entries`, 'none empty', !parts.some((p) => !p.trim()));
    const lower = parts.map((p) => p.trim().toLocaleLowerCase('tr'));
    const dup = lower.find((p, i) => lower.indexOf(p) !== i);
    add('keywords: no repeat', locale, dup ? `"${dup}"` : 'none', 'none', !dup);
    if (texts['name.txt'] !== undefined) {
      const nameWords = new Set(words(texts['name.txt']));
      const hit = [...new Set(lower.flatMap((p) => words(p)))].filter((w) => nameWords.has(w));
      add('keywords: no word from name', locale, hit.length ? hit.join(', ') : 'none', 'none', !hit.length);
    }
  }
  // online ranking: on iOS it is Game Center, and the description should say so
  if (app.ios?.gameCenter && texts['description.txt'] !== undefined) {
    const gc = texts['description.txt'].includes('Game Center');
    add('description names Game Center', locale, gc ? 'yes' : 'no', 'yes (app has Game Center boards)', gc);
  }

  // URLs
  const privacyWant = `${cfg.privacyPolicyBase}${slug}/`;
  const privacy = read(join(dir, 'privacy_url.txt'));
  add('privacy_url.txt', locale, privacy ?? 'missing', privacyWant, privacy === privacyWant);
  const support = read(join(dir, 'support_url.txt'));
  add('support_url.txt', locale, support ?? 'missing', 'https URL', support !== null && /^https:\/\/[^\s]+$/.test(support));

  // screenshots
  const sdir = join(AS, 'screenshots', locale);
  const shots = existsSync(sdir) ? readdirSync(sdir).filter((f) => /\.png$/i.test(f)).sort() : [];
  add('screenshots count', locale, shots.length, `${SHOT.min}–${SHOT.max}`, shots.length >= SHOT.min && shots.length <= SHOT.max);
  for (const f of shots) {
    const info = pngInfo(readFileSync(join(sdir, f)));
    const v = info ? `${info.width}×${info.height}${info.hasAlphaChannel ? ' alpha' : ''}` : 'not a PNG';
    add(`screenshot ${f}`, locale, v, `${SHOT.w}×${SHOT.h} PNG, no alpha`, info && info.width === SHOT.w && info.height === SHOT.h && !info.hasAlphaChannel);
  }
}

// shared files
const copyright = read(join(META, 'copyright.txt'));
add('copyright.txt', 'all', copyright ?? 'missing', '"<year> <owner>"', copyright !== null && /^(©\s?)?20\d\d\s+\S/.test(copyright));
const primary = read(join(META, 'primary_category.txt'));
add('primary_category.txt', 'all', primary ?? 'missing', 'GAMES', primary === 'GAMES');
const sub = read(join(META, 'primary_first_sub_category.txt'));
add('primary_first_sub_category.txt', 'all', sub ?? 'missing', 'a GAMES_* subcategory', sub !== null && GAME_SUBS.has(sub));
const secondary = read(join(META, 'secondary_category.txt'));
add('secondary_category.txt', 'all', secondary ?? 'missing', 'a category other than primary', secondary !== null && CATEGORIES.has(secondary) && secondary !== primary);

// icon
const iconPath = join(AS, 'icon-1024.png');
const icon = existsSync(iconPath) ? pngInfo(readFileSync(iconPath)) : null;
add('icon-1024.png', 'all', icon ? `${icon.width}×${icon.height}${icon.hasAlphaChannel ? ' alpha' : ''}` : 'missing', '1024×1024 PNG, no alpha', icon && icon.width === 1024 && icon.height === 1024 && !icon.hasAlphaChannel);

// the privacy page this listing points to must exist and cover the iPhone app
const page = read(join(STORE, '..', 'docs', 'gizlilik', slug, 'index.html'));
add('privacy page covers iPhone', 'all', page === null ? 'missing' : page.includes('Game Center') && page.includes('App Store') ? 'yes' : 'no', 'docs/gizlilik/<slug> names Game Center + App Store', page !== null && page.includes('Game Center') && page.includes('App Store'));

// ---- table
const head = ['check', 'locale', 'value', 'limit', 'ok'];
const data = rows.map((r) => [r.check, r.where, r.value, r.limit, r.ok ? 'PASS' : 'FAIL']);
const widths = head.map((h, i) => Math.max(h.length, ...data.map((d) => [...d[i]].length)));
const line = (cells) => '| ' + cells.map((c, i) => c + ' '.repeat(widths[i] - [...c].length)).join(' | ') + ' |';
const out = [`\nApp Store listing validation: ${slug}\n`, line(head), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...data.map(line)];
const failed = rows.filter((r) => !r.ok);
out.push(`\n${rows.length - failed.length}/${rows.length} checks passed.`);
process.stdout.write(`${out.join('\n')}\n`);
if (failed.length) {
  console.error(`\nFAILED (${failed.length}):\n- ${failed.map((r) => `${r.check} [${r.where}]: ${r.value} (limit ${r.limit})`).join('\n- ')}`);
  process.exit(1);
}
