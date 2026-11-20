import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  // the 3D build's aliases (apps/okcu-3d/vite.config.ts), so its pure save module can be tested here
  resolve: {
    alias: [
      { find: /^@sim\//, replacement: `${src}/sim/` },
      { find: /^@okcu\//, replacement: `${src}/` },
    ],
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
