import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { STORE } from './paths.mjs';

export function configPath(slug) {
  return join(STORE, slug, 'listing.config.mjs');
}

export async function loadConfig(slug) {
  const p = configPath(slug);
  if (!existsSync(p)) {
    console.error(`No ${p}. Run: node store/tools/new.mjs ${slug}   (writes a starter config to fill in)`);
    process.exit(2);
  }
  const mod = await import(pathToFileURL(p).href + `?t=${Date.now()}`);
  return mod.default;
}

export function flag(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  return process.argv[i + 1] ?? fallback;
}

export function locales(all) {
  const one = flag('locale');
  return one ? [one] : all;
}
