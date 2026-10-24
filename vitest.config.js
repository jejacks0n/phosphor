import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { playwright } from '@vitest/browser-playwright';
import { buildInfo } from './vite.config.js';
import { fileURLToPath } from 'node:url';

// The test layers (docs/testing.md): unit tests in Node for pure logic, and browser tests in Chromium
// for the store and everything that needs a real canvas or WebGL. Chromium runs on software WebGL
// (SwiftShader) on every machine, so a conversion gives the same cells locally and in CI. Adding
// WebKit later: another entry in the browser project's instances.
const SOFTWARE_WEBGL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// An update run in CI would write references and pass whatever they say.
if (process.env.CI && process.env.UPDATE_REFERENCES === '1') throw new Error('Refusing to update reference files in CI');

export default defineConfig({
  plugins: [vue()],
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
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.js'],
          testTimeout: 20_000, // software WebGL on a small CI runner
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { args: SOFTWARE_WEBGL } }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
