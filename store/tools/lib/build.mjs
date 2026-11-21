// Capture build: the real game, built from its own sources with its own vite config, into a temp
// folder, with ONE capture-only change: the renderer draws at K× resolution (cameras zoomed by K
// around the logical 720×1280 view, text rasterised at K×). Rules, layout, art and timing are
// untouched, so a screenshot shows exactly what a phone shows, only sharper. Nothing in games/ or
// packages/ is written: the change is applied in memory by a Vite transform.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { REPO } from './paths.mjs';

export const RENDER_SCALE = 2;

function replaceOnce(code, from, to, what) {
  const i = code.indexOf(from);
  if (i < 0) throw new Error(`capture build: patch point not found (${what}). Phaser or core changed; update store/tools/lib/build.mjs.`);
  return code.slice(0, i) + to + code.slice(i + from.length);
}

function replaceLast(code, from, to, what) {
  const i = code.lastIndexOf(from);
  if (i < 0 || code.indexOf(from) === i) throw new Error(`capture build: expected two occurrences (${what}).`);
  return code.slice(0, i) + to + code.slice(i + from.length);
}

/** Vite plugin that applies the hi-res patch. */
function hiResPlugin(K, gw, gh) {
  return {
    name: 'store-hires-capture',
    enforce: 'pre',
    transform(code, id) {
      const file = id.split('?')[0];
      if (file.endsWith('/packages/core/src/game.ts')) {
        return replaceOnce(
          code,
          "parent: config.parent ?? 'game',\n    width: size.width,\n    height: size.height,",
          `parent: config.parent ?? 'game',\n    width: size.width * ${K},\n    height: size.height * ${K},`,
          'core Phaser.Game size',
        );
      }
      if (file.endsWith('/phaser/dist/phaser.esm.js')) {
        let c = code.replace(/\r\n/g, '\n');
        const cond = `var __k = (!this.isObjectInversion && this.width >= ${gw * K} && this.height >= ${gh * K}) ? ${K} : 1;\n        var zoomX = this.zoomX * __k;\n        var zoomY = this.zoomY * __k;`;
        c = replaceOnce(c, 'var zoomX = this.zoomX;\n        var zoomY = this.zoomY;', cond, 'camera zoom');
        c = replaceOnce(c, 'var midX = sx + halfWidth;\n        var midY = sy + halfHeight;', 'var midX = sx + halfWidth / __k;\n        var midY = sy + halfHeight / __k;', 'camera midpoint');
        c = replaceLast(c, 'matrix.translate(-sx - originX, -sy - originY);', 'matrix.translate(-sx - originX / __k, -sy - originY / __k);', 'camera matrix');
        c = replaceOnce(c, 'if (this.style.resolution === 0)\n        {\n            this.style.resolution = 1;', `if (this.style.resolution === 0)\n        {\n            this.style.resolution = ${K};`, 'text resolution');
        return c;
      }
      return null;
    },
  };
}

/** Build games/<slug> at render scale K into a temp dir; returns the dir. Cached by source mtime. */
export async function captureBuild(slug, K = RENDER_SCALE) {
  const root = join(REPO, 'games', slug);
  const meta = JSON.parse(readFileSync(join(root, 'oyun.config.json'), 'utf8'));
  const [gw, gh] = meta.orientation === 'landscape' ? [1280, 720] : [720, 1280];
  const outDir = join(tmpdir(), 'oyun-store-build', `${slug}-x${K}`);
  const { build } = await import('vite');
  await build({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'warn',
    plugins: [hiResPlugin(K, gw, gh)],
    build: { outDir, emptyOutDir: true, minify: false, sourcemap: false, reportCompressedSize: false },
  });
  return { dir: outDir, meta, width: gw, height: gh, K };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Static file server on a free port; returns { url, close }. */
export function serve(dir) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
      let file = join(dir, path || 'index.html');
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
