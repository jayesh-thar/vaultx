const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const path = require('path');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'apps/api/knexfile.ts'],
  },

  // API — TypeScript with type-aware rules
  {
    files: ['apps/api/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: path.resolve(__dirname, 'apps/api/tsconfig.json'),
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // WEB — will add React rules here later when we build apps/web
];
