import { test, expect } from '@playwright/test';
import { openApp, tab, settled } from './support.js';

test('switching PIXEL and ANSI twenty times leaves no WebGL context warnings (too many, or lost)', async ({ page }) => {
  const messages = [];
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') messages.push(m.text()); });
  await openApp(page);
  for (let i = 0; i < 20; i++) {
    await tab(page, 'PIXEL').click();
    await tab(page, 'ANSI').click();
    await expect(page.locator('.ansi-editor .display')).toBeVisible();
  }
  await settled(page);
  expect(messages.filter((m) => /context/i.test(m))).toEqual([]);
});
