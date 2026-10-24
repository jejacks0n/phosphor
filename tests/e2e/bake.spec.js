import { test, expect } from '@playwright/test';
import { openApp, store, settled } from './support.js';

test('Bake from the toolbar: the sliders go back to neutral and the picture stays as it was', async ({ page }) => {
  await openApp(page);
  const bake = page.getByTitle(/^Bake:/);
  await expect(bake).toBeDisabled();
  const contrast = page.getByRole('group', { name: /Adjustments/ }).getByRole('slider').nth(1);
  await contrast.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBeGreaterThan(100);
  await settled(page);
  const cells = await store(page, 'project', (p) => JSON.stringify(p.cells));

  await bake.click();
  await expect.poll(() => store(page, 'project', (p) => p.contrast)).toBe(100);
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells))).toBe(cells);
  await expect(bake).toBeDisabled();
});
