import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const okcu = fileURLToPath(new URL('../../games/okcu/src', import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    // The rules are imported straight from the 2D game: one simulation, two renderers.
    alias: [
      { find: /^@sim\//, replacement: `${okcu}/sim/` },
      { find: /^@okcu\//, replacement: `${okcu}/` },
    ],
  },
  server: { port: 5180, strictPort: false, fs: { allow: ['../..'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
});
