/** The games in the test APK. `slug` is the folder under dist/ (and under games/ in the repo). */
export type Lang = 'tr' | 'en';

export interface LauncherGame {
  slug: 'kivilcim' | 'okcu' | 'fosil';
  name: Record<Lang, string>;
  pitch: Record<Lang, string>;
  /** Card accent colour (CSS). */
  accent: string;
  /** Code-drawn colour mark: an inline SVG string, 64×64 viewBox. */
  mark: string;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">${body}</svg>`;

/** Neon shaft: dark zigzag walls over a pink-to-orange glow, a white spark with a cyan trail. */
const kivilcimMark = svg(
  '<defs><linearGradient id="kv-glow" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ff2d95"/><stop offset="1" stop-color="#ffa53b"/></linearGradient></defs>' +
    '<rect width="64" height="64" rx="16" fill="url(#kv-glow)"/>' +
    '<path d="M0 0 H22 L14 16 L24 32 L12 48 L20 64 H0 Z" fill="#3a0a5e"/>' +
    '<path d="M64 0 H44 L52 16 L42 32 L54 48 L46 64 H64 Z" fill="#3a0a5e"/>' +
    '<path d="M22 0 L14 16 L24 32 L12 48 L20 64 M44 0 L52 16 L42 32 L54 48 L46 64" fill="none" stroke="#3ff6ff" stroke-width="2"/>' +
    '<path d="M33 58 L28 46 L36 36" fill="none" stroke="#3ff6ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>' +
    '<circle cx="36" cy="33" r="6" fill="#ffffff"/>',
);

/** Sky-blue backdrop, an orange archer on a ledge, an arrow flying on a dotted arc. */
const okcuMark = svg(
  '<rect width="64" height="64" rx="16" fill="#3fb4ff"/>' +
    '<rect x="4" y="46" width="20" height="7" rx="3" fill="#7a5233"/>' +
    '<circle cx="14" cy="30" r="5" fill="#ffb233"/>' +
    '<path d="M14 35 L14 46 M14 39 L20 36" stroke="#e58a1a" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M22 32 Q36 14 54 22" fill="none" stroke="#fff3d6" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round"/>' +
    '<path d="M46 18 L58 24 M58 24 L52 25 M58 24 L54 19" stroke="#2a1838" stroke-width="3" stroke-linecap="round"/>' +
    '<rect x="44" y="46" width="16" height="7" rx="3" fill="#7a5233"/>' +
    '<circle cx="52" cy="38" r="5" fill="#a46be8"/>',
);

/** Ammonite spiral in ochre on dark soil. */
const fosilMark = svg(
  '<rect width="64" height="64" rx="16" fill="#24160e"/>' +
    '<circle cx="32" cy="32" r="20" fill="#d99a3e"/>' +
    '<path d="M32 32 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 8 a12 12 0 1 1 -12 -12 a16 16 0 0 1 16 -12" ' +
    'fill="none" stroke="#24160e" stroke-width="3" stroke-linecap="round"/>',
);

export const GAMES: readonly LauncherGame[] = [
  {
    slug: 'kivilcim',
    name: { tr: 'Kıvılcım', en: 'Sparkrise' },
    pitch: {
      tr: 'Basılı tut sağa, bırak sola kay: kıvılcımı neon bacadan geçir.',
      en: 'Hold to veer right, let go to veer left — thread the neon shaft.',
    },
    accent: '#ff4fa3',
    mark: kivilcimMark,
  },
  {
    slug: 'okcu',
    name: { tr: 'Sallanan Okçular', en: 'Noodle Archers' },
    pitch: {
      tr: 'Geri çek ve bırak: rakip okçuları çıkıntılarından düşür.',
      en: 'Drag back and let fly — knock the rival archers off their ledges.',
    },
    accent: '#4fc3ff',
    mark: okcuMark,
  },
  {
    slug: 'fosil',
    name: { tr: 'Fosil Şansı', en: 'Fossil Odds' },
    pitch: {
      tr: 'Kaz, her fosilin şansını gör, milyonda birlik buluşun peşine düş.',
      en: 'Dig, see the odds of every fossil, chase the one-in-a-million find.',
    },
    accent: '#d99a3e',
    mark: fosilMark,
  },
];

export const UI: Record<Lang, { title: string; choose: string; back: string; footer: string }> = {
  tr: {
    title: 'Play Oyunlar — Test',
    choose: 'Denemek için bir oyun seç.',
    back: 'Oyundan bu ekrana dönmek için telefonun geri tuşunu kullan.',
    footer: 'Test sürümü · reklamlar simüle edilir (ödüllü reklam hemen verilir)',
  },
  en: {
    title: 'Play Oyunlar — Test',
    choose: 'Pick a game to try.',
    back: "Use the phone's back button to return here from a game.",
    footer: 'Test build · ads are simulated (rewarded ads are granted at once)',
  },
};

/** `?lang=tr|en` → first tr/en entry of the device languages → English. */
export function pickLang(languages: readonly string[], override: string | null): Lang {
  if (override === 'tr' || override === 'en') return override;
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'tr' || base === 'en') return base;
  }
  return 'en';
}
