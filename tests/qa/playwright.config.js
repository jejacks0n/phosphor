// QA runs (tests/qa): the production build on its own port, driven in headless Chromium on the machine's
// GPU, one long session at a time. `npm run qa` is a session an agent drives; `npm run qa:smoke` checks
// the harness itself.
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import { launchWithout } from '../support/chromiumArgs.js';
import { qaPort } from './setup.js';

const port = qaPort(process.env);
const root = fileURLToPath(new URL('../..', import.meta.url));

// The GPU through Metal, never SwiftShader, so timings are real; the heap's true size for qa.memory; no
// mDNS names for the room tests' connections, as in the end-to-end config.
const launchOptions = await launchWithout(['WebRtcHideLocalIpsWithMdns'], ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info']);

export default defineConfig({
  testDir: '.', // this folder, tests/qa: Playwright reads the path from the config file's folder
  testMatch: /\.qa\.js$/,
  workers: 1,
  timeout: 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    channel: 'chromium', // the full browser's headless mode, which has the GPU; the headless shell doesn't
    headless: true,
    launchOptions,
  },
  // Never another checkout's server: a port that's taken stops the run.
  webServer: {
    command: `VITE_SOCIAL_STUN=none npx vite build --outDir dist-qa && npx vite preview --outDir dist-qa --port ${port} --strictPort`,
    cwd: root,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
