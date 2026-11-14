// The desktop app's end-to-end flows (tests/e2e/desktop-*.spec.js): the desktop build (`npm run build:desktop`, made
// once before the run) in Electron, several instances to a test talking over 127.0.0.1. Their own config: no preview
// server to start, and the web e2e shards (tests/support/shard.mjs lists playwright.config.js's projects) never see them.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /[\\/]desktop-[^\\/]*\.spec\.js$/,
  globalSetup: './tests/e2e/desktop-build.js',
  workers: 1,   // each instance listens on its own fixed port (31401–31403), so one test at a time
  forbidOnly: !!process.env.CI,
  timeout: process.env.CI ? 90_000 : 60_000,   // three apps, a hand-over and a host's wait
  expect: { timeout: process.env.CI ? 10_000 : 5_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
