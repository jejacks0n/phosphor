import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

// The test layers (docs/testing.md): unit tests in Node for pure logic.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.js'] },
      },
    ],
  },
});
