import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'input/**', '.vitest/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-debugger': 'off',
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
];
