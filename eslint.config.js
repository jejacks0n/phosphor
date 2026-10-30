import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';

export default [
  { ignores: ['dist/**', 'input/**', 'server/**', '.vitest/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      globals: { ...globals.browser, __BUILD__: 'readonly' }, // { version, sha }, from vite.config.js
    },
    rules: {
      'no-debugger': 'off',
    },
  },
  {
    // The house style, enforced so it stays one style: 2-space indents, no tabs, semicolons, single
    // quotes, no trailing spaces.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
      '@stylistic/no-trailing-spaces': 'error',
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Tests run in Node (unit) or the browser (browser, e2e); the update flag comes from vitest.config.js.
    files: ['tests/**'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, __UPDATE_REFERENCES__: 'readonly' },
    },
  },
  {
    // The e2e specs take test from support.js, which cuts off the SOCIAL server unless a spec fakes it.
    files: ['tests/e2e/**/*.spec.js'],
    rules: {
      'no-restricted-imports': ['error', { paths: [{ name: '@playwright/test', message: 'Import test and expect from ./support.js.' }] }],
    },
  },
];
