import { test, expect } from '@playwright/test';
import { openApp, store, settled, editAt } from './support.js';

test('save a project and load it back through the file input', async ({ page }) => {
  await openApp(page);
  await editAt(page, 3, 3);
  await page.keyboard.insertText('saved 漢');
  await settled(page);
  const before = await store(page, 'project', (p) => JSON.stringify(p.cells.map((c) => c.char + c.fg.hex + c.bg.hex)));

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save Project (.phosphor)' }).click()]);
  expect(download.suggestedFilename()).toBe('gradient.phosphor');
  const path = await download.path();

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Start New Project' }).click();
  await expect(page.locator('input[type=file]')).toBeAttached();
  expect(await store(page, 'project', (p) => p.image)).toBe(null);
  await page.locator('input[type=file]').setInputFiles({ name: 'gradient.phosphor', mimeType: 'application/octet-stream', buffer: await (await import('node:fs/promises')).readFile(path) });
  await settled(page);
  expect(await store(page, 'project', (p) => JSON.stringify(p.cells.map((c) => c.char + c.fg.hex + c.bg.hex)))).toBe(before);
});
