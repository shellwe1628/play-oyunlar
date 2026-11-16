/**
 * Two-language string tables (tr + en) with device-language pick. Pure, no Phaser.
 * English is the source language and the fallback; `defineStrings` makes the compiler
 * reject a Turkish table that misses an English key.
 */
export const LANGUAGES = ['en', 'tr'] as const;
export type Lang = (typeof LANGUAGES)[number];
export type Params = Readonly<Record<string, string | number>>;

export interface StringTable<K extends string = string> {
  en: Readonly<Record<K, string>>;
  tr: Readonly<Record<K, string>>;
}

/** Type helper: `tr` must have exactly the keys of `en`. Returns the input unchanged. */
export function defineStrings<const E extends Readonly<Record<string, string>>>(table: {
  en: E;
  tr: { readonly [K in keyof E]: string };
}): StringTable<Extract<keyof E, string>> {
  return table;
}

function isLang(value: string): value is Lang {
  return (LANGUAGES as readonly string[]).includes(value);
}

/**
 * First supported language from the device preference list (`navigator.languages`),
 * or `override` (e.g. from `?lang=`) when it is supported. Falls back to `en`.
 */
export function pickLanguage(preferred: readonly string[] | undefined, override?: string | null): Lang {
  if (override && isLang(override.toLowerCase())) return override.toLowerCase() as Lang;
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0] ?? '';
    if (isLang(base)) return base;
  }
  return 'en';
}

export interface I18n<K extends string = string> {
  readonly lang: Lang;
  t(key: K, params?: Params): string;
  has(key: string): boolean;
}

export interface I18nOptions {
  /** Dictionary consulted after the main one (core supplies its shell strings here). */
  base?: StringTable;
  /** Called once per missing key. The game shell routes this to console.error so the smoke test fails. */
  onMissing?: (key: string) => void;
}

export function createI18n<K extends string>(table: StringTable<K>, lang: Lang, opts: I18nOptions = {}): I18n<K> {
  const layers: Readonly<Record<string, string>>[] = [table[lang], table.en];
  if (opts.base) layers.push(opts.base[lang], opts.base.en);
  const reported = new Set<string>();

  const lookup = (key: string): string | undefined => {
    for (const layer of layers) {
      const v = layer[key];
      if (v !== undefined && v !== '') return v;
    }
    return undefined;
  };

  return {
    lang,
    t(key, params) {
      const template = lookup(key);
      if (template === undefined) {
        if (!reported.has(key)) {
          reported.add(key);
          opts.onMissing?.(key);
        }
        return key;
      }
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
        const v = params[name];
        return v === undefined ? whole : String(v);
      });
    },
    has(key) {
      return lookup(key) !== undefined;
    },
  };
}
