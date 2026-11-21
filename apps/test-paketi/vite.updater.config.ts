// Builds src/update/main.ts into one classic script, oyun-test-update.js (IIFE, no imports), that
// tools/apk.mjs copies next to every index.html of a test APK and loads with <script defer>.
//   vite build -c vite.updater.config.ts --outDir <dir>
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    emptyOutDir: true,
    minify: true,
    lib: {
      entry: 'src/update/main.ts',
      formats: ['iife'],
      name: 'OyunTestUpdate',
      fileName: () => 'oyun-test-update.js',
    },
  },
});
