/** Number formatting for display (pure). Never parse these strings back into numbers. */
export type Lang = 'en' | 'tr';

function group(n: number, lang: Lang): string {
  const sep = lang === 'tr' ? '.' : ',';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

const UNITS_SFX = ['', 'de', 'de', 'te', 'te', 'te', 'da', 'de', 'de', 'da'];
const TENS_SFX = ['', 'da', 'de', 'da', 'ta', 'de', 'ta', 'te', 'de', 'da'];

/**
 * Turkish locative suffix (-de/-da/-te/-ta) for an integer, from its last spoken word:
 * 250 "iki yüz elli" → de, 60 "altmış" → ta, 4000 "dört bin" → de, 1,000,000 "bir milyon" → da.
 */
export function trLocative(n: number): string {
  const v = Math.round(Math.abs(n));
  if (v === 0) return 'da'; // sıfır
  if (v % 10 !== 0) return UNITS_SFX[v % 10];
  if (v % 100 !== 0) return TENS_SFX[Math.floor(v / 10) % 10];
  if (v % 1000 !== 0) return 'de'; // yüz
  if (v % 1_000_000 !== 0) return 'de'; // bin
  if (v % 1_000_000_000 !== 0) return 'da'; // milyon
  return 'da'; // milyar
}

/**
 * The N of "1 in N", grouped. Turkish reads "N'de 1", so the suffix is attached here and the
 * string table only places it: en "1 in {n}", tr "{n} 1".
 */
export function formatOddsNumber(odds: number, lang: Lang): string {
  return lang === 'tr' ? `${group(odds, lang)}'${trLocative(odds)}` : group(odds, lang);
}

const SUFFIX: Record<Lang, readonly string[]> = {
  en: ['', 'K', 'M', 'B', 'T', 'Qa'],
  tr: ['', 'B', 'Mn', 'Mr', 'Tn', 'Kd'],
};

/** Short big number: 999, 1.23K, 12.3K, 1.00M (tr: 1,23B, 2,50Mn). Three significant digits. */
export function formatBig(value: number, lang: Lang): string {
  if (!Number.isFinite(value)) return '0';
  const v = Math.max(0, value);
  const dec = (s: string): string => (lang === 'tr' ? s.replace('.', ',') : s);
  if (v < 1000) {
    if (v < 100 && !Number.isInteger(v)) return dec((Math.round(v * 10) / 10).toString());
    return String(Math.floor(v));
  }
  let tier = Math.floor(Math.log10(v) / 3);
  let scaled = v / 1000 ** tier;
  // Round first, then roll over to the next suffix if rounding reached 1000.
  let digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  let rounded = Number(scaled.toFixed(digits));
  if (rounded >= 1000) {
    tier += 1;
    scaled = v / 1000 ** tier;
    digits = 2;
    rounded = Number(scaled.toFixed(digits));
  }
  const suffixes = SUFFIX[lang];
  if (tier >= suffixes.length) return v.toExponential(2).replace('+', '');
  return dec(rounded.toFixed(digits)) + suffixes[tier];
}
