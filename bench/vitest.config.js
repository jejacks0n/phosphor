/* global process */
// The large-document benchmark (bench/large-documents.bench.js), kept out of `npm test`: it takes
// minutes and asserts nothing. Run it with
//   npx vitest run --config bench/vitest.config.js
// BENCH_GPU=1 drops software WebGL (the test layers' SwiftShader) to time the canvas view on the GPU;
// BENCH_HUGE=1 adds the 1000 x 10,000-line document, which crashes the tab (it ends the run).
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { playwright } from '@vitest/browser-playwright';
import { fileURLToPath } from 'node:url';
import { buildInfo } from '../vite.config.js';

const WEBGL = process.env.BENCH_GPU
  ? { channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } // full Chromium: headless shell has no GPU
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  define: { __BUILD__: JSON.stringify(buildInfo()), __UPDATE_REFERENCES__: 'false', __BENCH_HUGE__: JSON.stringify(!!process.env.BENCH_HUGE) },
  test: {
    include: ['bench/**/*.bench.js'],
    testTimeout: 900_000,
    browser: {
      enabled: true,
      headless: true,
      // precise heap numbers, and gc() so they're measured after a collection
      provider: playwright({ launchOptions: { ...WEBGL, args: [...WEBGL.args, '--enable-precise-memory-info', '--js-flags=--expose-gc'] } }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
