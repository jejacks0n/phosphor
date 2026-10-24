import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';

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
    // The house style, enforced so it stays one style: 2-space indents, no tabs, semicolons.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/semi': ['error', 'always'],
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
