// The desktop end-to-end flows' helpers: the app as built by `npm run build:desktop`, launched in Electron from
// desktop/main.js. Each instance gets its own user data folder (so several can run at once) and lists only
// 127.0.0.1 as its address.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from 'playwright';
import { test, expect } from '@playwright/test';
export { test, expect };

// A launched app: { app, page, name, port, close }, close also removing its user data folder. Anything the page's
// Content-Security-Policy refuses is kept in `refused`, for the spec to check.
export async function launchApp({ name = 'ann', port = 31401 } = {}) {
  const userData = mkdtempSync(join(tmpdir(), `phosphor-${name}-`));
  const app = await _electron.launch({
    args: ['desktop/main.js'],
    env: { ...process.env, PHOSPHOR_USER_DATA: userData, PHOSPHOR_ADDRESSES: '127.0.0.1' },
  });
  const page = await app.firstWindow();
  const refused = [];
  page.on('console', (m) => { if (m.text().includes('Content Security Policy')) refused.push(m.text()); });
  await page.waitForLoadState('domcontentloaded');
  const close = async () => {
    await app.close();
    rmSync(userData, { recursive: true, force: true });
  };
  return { app, page, name, port, refused, close };
}
