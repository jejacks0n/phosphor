// End-to-end flows (tests/e2e): the production build served by vite preview, driven in Chromium with
// software WebGL (SwiftShader), as the browser tests are, so every machine renders alike.
import { defineConfig, devices } from '@playwright/test';
import { launchWithout } from './tests/support/chromiumArgs.js';

// Software WebGL, and no mDNS names for the room tests' connections (see vitest.config.js).
const launchOptions = await launchWithout(['WebRtcHideLocalIpsWithMdns'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  timeout: process.env.CI ? 60_000 : 30_000, // the runner can stall for 15 s or more, whichever test is starting
  expect: { timeout: process.env.CI ? 10_000 : 5_000 }, // software WebGL on a small CI runner
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 1400, height: 900 },
    trace: { mode: 'retain-on-failure', screenshots: false }, // recording every test's screenshots costs about 15% of the suite's time
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, launchOptions } },
  ],
  webServer: {
    command: 'VITE_SOCIAL_STUN=none npm run build && npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
