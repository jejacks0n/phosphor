import { defineConfig, configDefaults } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import { playwright } from '@vitest/browser-playwright';
import { buildInfo } from './vite.config.js';
import { fileURLToPath } from 'node:url';
import { SOFTWARE_GL, launchWithout } from './tests/support/chromiumArgs.js';

// The test layers (docs/testing.md): unit tests in Node for pure logic, and browser tests in Chromium
// for the store and everything that needs a real canvas or WebGL. Chromium runs on software WebGL
// (SwiftShader) on every machine, so a conversion gives the same cells locally and in CI. Adding
// WebKit later: another entry in the browser project's instances.
// Two connections in one machine (the room tests) reach each other by their addresses, not mDNS names.
const launchOptions = await launchWithout(['WebRtcHideLocalIpsWithMdns'], SOFTWARE_GL);

const DESKTOP_TESTS = 'tests/browser/desktop-*.test.js';
const browserTests = () => ({  // (fresh each time: Vitest names a project's instances in place)
  testTimeout: 20_000, // software WebGL on a small CI runner
  browser: {
    enabled: true,
    headless: true,
    provider: playwright({ launchOptions }),
    instances: [{ browser: 'chromium' }],
  },
});

// An update run in CI would write references and pass whatever they say.
if (process.env.CI && process.env.UPDATE_REFERENCES === '1') throw new Error('Refusing to update reference files in CI');

export default defineConfig({
  plugins: [
    vue(),
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
      runtimeOnly: true,
      strictMessage: false,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __UPDATE_REFERENCES__: JSON.stringify(process.env.UPDATE_REFERENCES === '1'), // tests/support/references.js
    __BUILD__: JSON.stringify(buildInfo()), // as the app is built (vite.config.js)
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.js'] },
      },
      {
        extends: true,
        test: { ...browserTests(), name: 'browser', include: ['tests/browser/**/*.test.js'], exclude: [...configDefaults.exclude, DESKTOP_TESTS] },
      },
      // The desktop build's branches (import.meta.env.VITE_DESKTOP === '1'), in their own files.
      {
        extends: true,
        define: { 'import.meta.env.VITE_DESKTOP': JSON.stringify('1') },
        test: { ...browserTests(), name: 'browser-desktop', include: [DESKTOP_TESTS] },
      },
    ],
  },
});
