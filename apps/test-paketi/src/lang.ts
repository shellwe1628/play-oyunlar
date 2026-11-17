/** Languages of the test apps' own UI (launcher and update banner). */
export type Lang = 'tr' | 'en';

/** `?lang=tr|en` → first tr/en entry of the device languages → English. */
export function pickLang(languages: readonly string[], override: string | null): Lang {
  if (override === 'tr' || override === 'en') return override;
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'tr' || base === 'en') return base;
  }
  return 'en';
}
