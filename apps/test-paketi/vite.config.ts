import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Read-only git query; never touches the index (`--no-optional-locks`). */
function git(args: string[]): string {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const commit = process.env.OYUN_BUILD_COMMIT ?? (git(['rev-parse', '--short', 'HEAD']) || 'unknown');
const dirty = process.env.OYUN_BUILD_COMMIT ? false : git(['status', '--porcelain']) !== '';
const date = process.env.OYUN_BUILD_DATE ?? new Date().toISOString().slice(0, 10);

export default defineConfig({
  // Relative paths: served from the root of the Capacitor WebView (https://localhost/).
  base: './',
  define: {
    __BUILD_DATE__: JSON.stringify(date),
    __BUILD_COMMIT__: JSON.stringify(dirty ? `${commit}-dirty` : commit),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // tools/apk.mjs builds the launcher first (emptying dist/), then each game into dist/<slug>/.
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
