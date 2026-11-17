/** The games in the test APK. `slug` is the folder under dist/ (and under games/ in the repo). */
export type Lang = 'tr' | 'en';

export interface LauncherGame {
  slug: 'fener' | 'murekkep' | 'fosil';
  name: Record<Lang, string>;
  pitch: Record<Lang, string>;
  /** Card accent colour (CSS). */
  accent: string;
  /** Code-drawn colour mark: an inline SVG string, 64×64 viewBox. */
  mark: string;
}

const svg = (body: string): string =>
  `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" focusable="false">${body}</svg>`;

/** Lighthouse lamp with a beam, on the night-blue of Lantern Shift. */
const fenerMark = svg(
  '<rect width="64" height="64" rx="16" fill="#0d1226"/>' +
    '<path d="M32 30 L62 18 L62 42 Z" fill="#ffd36b" opacity="0.35"/>' +
    '<rect x="25" y="34" width="14" height="22" rx="3" fill="#3ee0c4"/>' +
    '<circle cx="32" cy="30" r="9" fill="#ffd36b"/>',
);

/** Two ink blots bleeding into each other on paper. */
const murekkepMark = svg(
  '<rect width="64" height="64" rx="16" fill="#f2e8d5"/>' +
    '<circle cx="25" cy="28" r="15" fill="#2f5bd3"/>' +
    '<circle cx="40" cy="40" r="13" fill="#d8463b"/>' +
    '<circle cx="46" cy="18" r="5" fill="#2f5bd3"/>',
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
    slug: 'fener',
    name: { tr: 'Fener Nöbeti', en: 'Lantern Shift' },
    pitch: {
      tr: 'Dört kamera, tek ekran: sen bakmazken değişeni bul.',
      en: 'Four cameras, one screen: spot what changed while you were not looking.',
    },
    accent: '#ffd36b',
    mark: fenerMark,
  },
  {
    slug: 'murekkep',
    name: { tr: 'Mürekkep Seli', en: 'Ink Tide' },
    pitch: {
      tr: 'Mürekkebini böl, sınırını ilerlet, sayfayı rakiplerden önce kapla.',
      en: 'Commit your ink, push your border, soak the page before your rivals.',
    },
    accent: '#6f8ff0',
    mark: murekkepMark,
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
