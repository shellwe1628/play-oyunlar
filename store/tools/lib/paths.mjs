import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const TOOLS = dirname(dirname(fileURLToPath(import.meta.url)));
export const STORE = dirname(TOOLS);
export const REPO = dirname(STORE);
export const LOCALES = ['en-US', 'tr-TR'];
/** Game language for a Play locale. */
export const LANG = { 'en-US': 'en', 'tr-TR': 'tr' };

export const storeDir = (slug) => join(STORE, slug);
export const metaDir = (slug, locale) => join(STORE, slug, 'metadata', 'android', locale);
export const imagesDir = (slug, locale) => join(metaDir(slug, locale), 'images');
export const shotsDir = (slug, locale) => join(imagesDir(slug, locale), 'phoneScreenshots');
/** Raw hi-res captures (not committed: store/<slug>/.gitignore). */
export const rawDir = (slug, locale) => join(STORE, slug, '.raw', locale);
export const iconDir = (slug) => join(STORE, slug, 'icon');
export const tmp = (...p) => join(tmpdir(), 'oyun-store', ...p);

export const FONT_DIR = join(REPO, 'node_modules', '@fontsource', 'nunito', 'files');

export function slugArg() {
  const slug = process.argv[2];
  if (!slug || slug.startsWith('-')) {
    console.error(`usage: node ${process.argv[1].split(/[\\/]/).slice(-3).join('/')} <slug> [options]`);
    process.exit(2);
  }
  return slug;
}
