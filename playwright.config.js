// End-to-end flows (tests/e2e): the production build served by vite preview, driven in Chromium with
// software WebGL (SwiftShader), as the browser tests are, so every machine renders alike.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  expect: { timeout: process.env.CI ? 10_000 : 5_000 }, // software WebGL on a small CI runner
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4180',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'] } } },
  ],
  webServer: {
    command: 'VITE_SOCIAL_STUN=none npm run build && npx vite preview --port 4180 --strictPort',
    url: 'http://localhost:4180',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
