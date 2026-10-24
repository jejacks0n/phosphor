import { test, expect } from '@playwright/test';
import { openApp, tab, settled, store, cellPoint, drag } from './support.js';

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

test('the editor tabs are a tablist: Tab reaches the selected one, arrows move and select', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tablist', { name: 'Editor' })).toBeVisible();
  await expect(tab(page, 'PIXEL')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'ANSI')).toBeDisabled(); // no image yet

  await openApp(page);
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await drag(page, await cellPoint(page, 2, 2), await cellPoint(page, 5, 5));
  const selection = await store(page, 'workspace', (w) => w.selection);
  expect(selection).toEqual({ c0: 2, r0: 2, c1: 5, r1: 5 }); // room to nudge, if an arrow got through

  await tab(page, 'ANSI').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'SAUCE')).toBeFocused();
  await expect(tab(page, 'SAUCE')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.editorTab)).toBe('sauce');
  await page.keyboard.press('ArrowRight'); // wraps
  await expect(tab(page, 'PIXEL')).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'ANSI')).toHaveAttribute('aria-selected', 'true');
  expect(await store(page, 'workspace', (w) => w.selection)).toEqual(selection); // the arrows stayed with the tabs
  await expect(tab(page, 'PIXEL')).toHaveAttribute('tabindex', '-1');

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(tab(page, 'ANSI')).toBeFocused(); // the selected tab is the one Tab stop
});
