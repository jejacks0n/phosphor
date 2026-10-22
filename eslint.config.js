import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'input/**'] },
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
    files: ['scripts/**', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
