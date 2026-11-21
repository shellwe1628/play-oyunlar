// Renders templates/game for a given slug/title/orientation. Shared by new-game.mjs and the
// gate's template-drift check (games/ornek must equal a fresh render of the template).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATE_DIR = join(ROOT, 'templates', 'game');
export const SKIP = new Set(['node_modules', 'dist', 'artifacts', 'test-results', 'android', 'ios']);
const TEXT = new Set(['.ts', '.json', '.html', '.md', '.mjs', '.css']);

export function appIdFor(slug) {
  return `com.oyunlar.${slug.replace(/-/g, '')}`;
}

function escapeFor(ext, title) {
  if (ext === '.json' || ext === '.ts') return JSON.stringify(title).slice(1, -1);
  if (ext === '.html') return title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return title;
}

/** @returns {Map<string, Buffer|string>} relative path → file content */
export function renderTemplate(slug, title, orientation) {
  const out = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      if (SKIP.has(entry)) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      const rel = relative(TEMPLATE_DIR, p);
      const ext = extname(p);
      if (!TEXT.has(ext)) {
        out.set(rel, readFileSync(p));
        continue;
      }
      const content = readFileSync(p, 'utf8')
        .replaceAll('__SLUG__', slug)
        .replaceAll('__TITLE__', escapeFor(ext, title))
        .replaceAll('__ORIENTATION__', orientation)
        .replaceAll('__APP_ID__', appIdFor(slug));
      out.set(rel, content);
    }
  };
  walk(TEMPLATE_DIR);
  return out;
}

/** Files under dir (relative), skipping generated folders. */
export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d).sort()) {
      if (SKIP.has(entry) || entry.startsWith('.')) continue;
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out;
}
