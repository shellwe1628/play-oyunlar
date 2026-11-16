// Flat config for the whole monorepo. Type-aware rules for TypeScript sources.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/android/**', '**/ios/**', '**/test-results/**', '**/tests/artifacts/**', '.claude/**', 'docs/**', 'templates/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests may use loose typing helpers.
    files: ['**/tests/**/*.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Sim purity: game rules never touch Phaser, the DOM-facing core entry, or scenes.
    files: ['games/*/src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'phaser', message: 'src/sim must stay pure: no Phaser.' },
            { name: '@oyun/core', message: "src/sim may only import '@oyun/core/pure'." },
          ],
          patterns: [{ group: ['**/scenes/**', '../scenes/*'], message: 'src/sim must not import scenes.' }],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'navigator', 'requestAnimationFrame'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random', message: 'Use the seeded Rng from @oyun/core/pure.' }],
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
  },
);
